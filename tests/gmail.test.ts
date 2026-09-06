import { afterEach, describe, expect, it, vi } from 'vitest'
import { GMAIL_BATCH_SIZE, batchBoundary, buildBatchBody, extractBody, fetchMessages, mapGmailMessage, parseBatchResponse } from '../src/main/mail/gmail'
import { classifyMessageHeuristically } from '../src/main/ai/builtin'
import { PROFILES } from '../src/main/profiles/profiles'
import type { AccountConfig } from '../src/shared/types'

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')
const account: AccountConfig = {
  id: 'acc-g',
  label: 'me@gmail.com',
  email: 'me@gmail.com',
  provider: 'gmailapi',
  host: 'gmail.googleapis.com',
  port: 443,
  folders: ['gmail'],
  createdAt: '2026-09-06T00:00:00.000Z'
}

describe('extractBody', () => {
  it('prefers text/plain, falls back to html, and notices attachments', () => {
    const plain = extractBody({
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/html', body: { data: b64('<p>html</p>') } },
        { mimeType: 'text/plain', body: { data: b64('plain text') } },
        { mimeType: 'application/pdf', filename: 'invoice.pdf', body: { size: 100 } }
      ]
    })
    expect(plain.text).toBe('plain text')
    expect(plain.hasAttachments).toBe(true)
    const html = extractBody({ mimeType: 'text/html', body: { data: b64('<b>Hi</b> there') } })
    expect(html.text).toBe('Hi there')
    expect(html.hasAttachments).toBe(false)
  })
})

describe('mapGmailMessage', () => {
  const raw = {
    id: '18f3',
    threadId: 'thr1',
    labelIds: ['INBOX', 'CATEGORY_PROMOTIONS', 'UNREAD'],
    internalDate: '1788000000000',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: '"Big Store" <deals@bigstore.com>' },
        { name: 'To', value: 'me@gmail.com' },
        { name: 'Subject', value: '50% off everything' },
        { name: 'Message-ID', value: '<promo@bigstore.com>' },
        { name: 'List-Unsubscribe', value: '<https://bigstore.com/unsub>' }
      ],
      body: { data: b64('Huge sale this weekend only.') }
    }
  }

  it('maps headers, labels, and Gmail category hints', () => {
    const m = mapGmailMessage(raw, account, true)
    expect(m.fromAddress).toBe('deals@bigstore.com')
    expect(m.fromName).toBe('Big Store')
    expect(m.subject).toBe('50% off everything')
    expect(m.listUnsubscribe).toContain('bigstore.com/unsub')
    expect(m.providerHints?.category).toBe('promotions')
    expect(m.providerHints?.unread).toBe(true)
    expect(m.fromMe).toBe(false)
  })

  it('treats SENT-labelled mail as ours', () => {
    const m = mapGmailMessage({ ...raw, labelIds: ['SENT'] }, account, true)
    expect(m.fromMe).toBe(true)
  })

  it('Gmail Promotions category drives the built-in engine to noise', () => {
    const m = mapGmailMessage(raw, account, true)
    const c = classifyMessageHeuristically(m, PROFILES.general)
    expect(c.category).toBe('promotions_noise')
    expect(c.importance).toBe(0)
  })

  it('Important/Starred markers lift importance even for plain mail', () => {
    const m = mapGmailMessage(
      {
        ...raw,
        labelIds: ['INBOX', 'IMPORTANT', 'STARRED'],
        payload: {
          ...raw.payload,
          headers: [
            { name: 'From', value: 'Jane <jane@client.com>' },
            { name: 'Subject', value: 'Quick question about the proposal' }
          ],
          body: { data: b64('Can we talk tomorrow?') }
        }
      },
      account,
      true
    )
    const c = classifyMessageHeuristically(m, PROFILES.owner)
    expect(c.importance).toBeGreaterThanOrEqual(2)
    expect(c.category).toBe('work')
  })
})

// ---- v1.4 item 5: the batch endpoint (50 messages per round trip) with a per-message fallback ----

/** A Gmail-style multipart/mixed batch reply. Parts may come back in any order; Content-ID says which is which. */
function batchReply(boundary: string, parts: { index: number; status: number; body: string }[]): string {
  const chunks = parts.map(
    (p) =>
      `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <response-item-${p.index}>\r\n\r\n` +
      `HTTP/1.1 ${p.status} ${p.status === 200 ? 'OK' : 'Error'}\r\nContent-Type: application/json; charset=UTF-8\r\nVary: Origin\r\n\r\n${p.body}\r\n`
  )
  return `${chunks.join('')}--${boundary}--\r\n`
}

const rawMessage = (id: string, subject: string, labels: string[] = ['INBOX']) =>
  JSON.stringify({
    id,
    threadId: `thr-${id}`,
    labelIds: labels,
    internalDate: '1788000000000',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: `Sender <s@example.com>` },
        { name: 'Subject', value: subject },
        { name: 'Message-ID', value: `<${id}@example.com>` }
      ],
      body: { data: b64(`Body of ${subject}`) }
    }
  })

describe('Gmail batch parsing', () => {
  it('builds a multipart request with one GET per id and a closing delimiter', () => {
    const body = buildBatchBody(['a1', 'b 2'], 'bnd')
    expect(body.split('--bnd\r\n')).toHaveLength(3)
    expect(body).toContain('Content-ID: <item-0>')
    expect(body).toContain('GET /gmail/v1/users/me/messages/a1?format=full HTTP/1.1')
    expect(body).toContain('GET /gmail/v1/users/me/messages/b%202?format=full HTTP/1.1')
    expect(body.endsWith('--bnd--\r\n')).toBe(true)
  })

  it('reads the boundary from the content-type header', () => {
    expect(batchBoundary('multipart/mixed; boundary=batch_abc123')).toBe('batch_abc123')
    expect(batchBoundary('multipart/mixed; boundary="batch_q"; charset=UTF-8')).toBe('batch_q')
    expect(batchBoundary('application/json')).toBeNull()
    expect(batchBoundary(null)).toBeNull()
  })

  it('parses a fixture reply into parts with status, Content-ID, and JSON body (in any order)', () => {
    const text = batchReply('batch_XYZ', [
      { index: 1, status: 200, body: rawMessage('m2', 'Second') },
      { index: 0, status: 200, body: rawMessage('m1', 'First') },
      { index: 2, status: 404, body: '{"error":{"code":404,"message":"Requested entity was not found."}}' }
    ])
    const parts = parseBatchResponse(text, 'batch_XYZ')
    expect(parts.map((p) => [p.contentId, p.status])).toEqual([
      ['response-item-1', 200],
      ['response-item-0', 200],
      ['response-item-2', 404]
    ])
    expect(JSON.parse(parts[0].body).id).toBe('m2')
    expect(JSON.parse(parts[2].body).error.code).toBe(404)
  })

  it('throws on a reply that is not a batch (so the caller falls back)', () => {
    expect(() => parseBatchResponse('<html>Sorry</html>', 'batch_XYZ')).toThrow()
    expect(() => parseBatchResponse('--b\r\nContent-Type: application/http\r\n\r\nnot an http response\r\n--b--', 'b')).toThrow()
  })
})

describe('fetchMessages over the batch endpoint', () => {
  afterEach(() => vi.unstubAllGlobals())

  const jsonResponse = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('fetches 50 per round trip, maps parts back by Content-ID, skips 404s, and retries odd parts one by one', async () => {
    const calls: { url: string; method: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' })
      if (url.endsWith('/batch/gmail/v1')) {
        const body = String(init?.body)
        const boundary = body.slice(2, body.indexOf('\r\n'))
        expect(String((init?.headers as any)['content-type'])).toContain(boundary)
        const ids = [...body.matchAll(/messages\/([^?]+)\?format=full/g)].map((m) => m[1])
        const parts = ids.map((id, index) => {
          if (id === 'gone') return { index, status: 404, body: '{"error":{"code":404}}' }
          if (id === 'busy') return { index, status: 429, body: '{"error":{"code":429}}' }
          return { index, status: 200, body: rawMessage(id, `Subject ${id}`, id === 'spam' ? ['SPAM'] : ['INBOX']) }
        })
        // Reverse the order to prove Content-ID (not position) drives the mapping.
        return new Response(batchReply('batch_reply', parts.reverse()), { status: 200, headers: { 'content-type': 'multipart/mixed; boundary=batch_reply' } })
      }
      const id = url.match(/messages\/([^?]+)\?/)![1]
      return jsonResponse(200, JSON.parse(rawMessage(id, `Single ${id}`)))
    })
    const ids = [...Array.from({ length: 60 }, (_, i) => `id${i}`), 'gone', 'busy', 'spam']
    const out = await fetchMessages('tok', ids, account, true)
    const batchCalls = calls.filter((c) => c.method === 'POST')
    expect(batchCalls).toHaveLength(Math.ceil(ids.length / GMAIL_BATCH_SIZE))
    const singles = calls.filter((c) => c.method === 'GET')
    expect(singles.map((c) => c.url.match(/messages\/([^?]+)/)![1])).toEqual(['busy'])
    const subjects = new Map(out.map((m) => [m.messageId, m.subject]))
    expect(out).toHaveLength(61) // 60 ok + busy (retried), minus gone and spam
    expect(subjects.get('<id0@example.com>')).toBe('Subject id0')
    expect(subjects.get('<id59@example.com>')).toBe('Subject id59')
    expect(subjects.get('<busy@example.com>')).toBe('Single busy')
    expect(subjects.has('<gone@example.com>')).toBe(false)
    expect(subjects.has('<spam@example.com>')).toBe(false)
  })

  it('falls back to one request per message when the batch reply cannot be parsed or the batch call fails', async () => {
    const singles: string[] = []
    let batchCalls = 0
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/batch/gmail/v1')) {
        batchCalls++
        return batchCalls === 1
          ? new Response('<html>not a batch</html>', { status: 200, headers: { 'content-type': 'text/html' } })
          : new Response('quota', { status: 403 })
      }
      const id = url.match(/messages\/([^?]+)\?/)![1]
      singles.push(id)
      return jsonResponse(200, JSON.parse(rawMessage(id, `Single ${id}`)))
    })
    const ids = Array.from({ length: 55 }, (_, i) => `x${i}`)
    const out = await fetchMessages('tok', ids, account, true)
    expect(batchCalls).toBe(2)
    expect(singles.sort()).toEqual([...ids].sort())
    expect(out).toHaveLength(55)
    expect(out.every((m) => m.subject.startsWith('Single '))).toBe(true)
  })
})
