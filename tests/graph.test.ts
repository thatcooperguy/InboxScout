import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGraphAttachments, graphUid, htmlToText, mapGraphMessage, syncGraphFolder } from '../src/main/mail/graph'
import { FILE_MAX_BYTES, SyncBudget } from '../src/main/mail/attachmentsPolicy'
import type { AccountConfig } from '../src/shared/types'

const account: AccountConfig = {
  id: 'acc-o',
  label: 'me@outlook.com',
  email: 'me@outlook.com',
  provider: 'outlook',
  host: 'graph.microsoft.com',
  port: 443,
  folders: ['inbox', 'sentitems'],
  createdAt: '2026-09-05T00:00:00.000Z'
}

describe('htmlToText', () => {
  it('strips tags, scripts, and entities but keeps line structure', () => {
    const text = htmlToText('<style>p{}</style><p>Hello&nbsp;<b>Jane</b>,</p><script>x()</script><div>Total: $5 &amp; tax</div>')
    expect(text).toBe('Hello Jane,\nTotal: $5 & tax')
  })
})

describe('graphUid', () => {
  it('is stable and fits the integer uid column', () => {
    expect(graphUid('AAMkAGI2')).toBe(graphUid('AAMkAGI2'))
    expect(graphUid('AAMkAGI2')).not.toBe(graphUid('AAMkAGI3'))
    expect(Number.isSafeInteger(graphUid('anything'))).toBe(true)
  })
})

describe('mapGraphMessage', () => {
  it('maps a Graph message into our record, detecting our own sent mail', () => {
    const m = mapGraphMessage(
      {
        id: 'AAMk1',
        subject: 'Closing documents',
        from: { emailAddress: { address: 'Title@Escrow.com', name: 'Title Co' } },
        toRecipients: [{ emailAddress: { address: 'me@outlook.com' } }],
        receivedDateTime: '2026-09-05T14:02:00Z',
        body: { contentType: 'html', content: '<p>Please sign by <b>Friday</b>.</p>' },
        conversationId: 'conv-1',
        internetMessageId: '<abc@escrow.com>',
        hasAttachments: true,
        inferenceClassification: 'focused',
        importance: 'high',
        isRead: false
      },
      account,
      'inbox',
      true
    )
    expect(m.fromAddress).toBe('title@escrow.com')
    expect(m.fromName).toBe('Title Co')
    expect(m.bodyText).toBe('Please sign by Friday.')
    expect(m.hasAttachments).toBe(true)
    expect(m.fromMe).toBe(false)
    expect(m.messageId).toBe('<abc@escrow.com>')
    expect(m.folder).toBe('inbox')
    expect(m.providerHints).toEqual({ source: 'outlook', category: null, important: true, starred: false, unread: true, focused: true })

    const sent = mapGraphMessage(
      { id: 'AAMk2', from: { emailAddress: { address: 'ME@outlook.com' } }, sentDateTime: '2026-09-05T15:00:00Z', bodyPreview: 'hi' },
      account,
      'sentitems',
      false
    )
    expect(sent.fromMe).toBe(true)
    expect(sent.subject).toBe('(no subject)')
    expect(sent.bodyText).toBe('hi')
  })

  it('groups messages by conversation id', () => {
    const a = mapGraphMessage({ id: '1', conversationId: 'c', receivedDateTime: '2026-09-05T00:00:00Z' }, account, 'inbox', true)
    const b = mapGraphMessage({ id: '2', conversationId: 'c', receivedDateTime: '2026-09-05T00:00:00Z' }, account, 'inbox', true)
    expect(a.threadKey).toBe(b.threadKey)
  })
})

// ---- v1.5: attachment bytes via /attachments (metadata) then /$value (bytes) ----

describe('syncGraphFolder with attachments', () => {
  afterEach(() => vi.unstubAllGlobals())

  const pdfBytes = Buffer.from('%PDF-1.4 closing statement', 'utf8')
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('lists attachments only for messages that have them, keeps file attachments that pass the policy, and decodes $value', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(url)
      expect(String((init?.headers as any).Authorization)).toBe('Bearer tok')
      if (url.includes('/mailFolders/inbox/messages?')) {
        return json({
          value: [
            { id: 'M1', subject: 'Closing documents', receivedDateTime: '2026-09-05T14:02:00Z', hasAttachments: true, from: { emailAddress: { address: 'title@escrow.com' } } },
            { id: 'M2', subject: 'Just text', receivedDateTime: '2026-09-05T15:00:00Z', hasAttachments: false }
          ]
        })
      }
      if (url.endsWith('/me/messages/M1/attachments?$select=id,name,contentType,size,isInline')) {
        return json({
          value: [
            { '@odata.type': '#microsoft.graph.fileAttachment', id: 'A1', name: 'closing.pdf', contentType: 'application/pdf', size: pdfBytes.length, isInline: false },
            { '@odata.type': '#microsoft.graph.fileAttachment', id: 'A2', name: 'logo.png', contentType: 'image/png', size: 900, isInline: true },
            { '@odata.type': '#microsoft.graph.referenceAttachment', id: 'A3', name: 'Shared folder', contentType: null, size: 0, isInline: false },
            { '@odata.type': '#microsoft.graph.fileAttachment', id: 'A4', name: 'huge.zip', contentType: 'application/zip', size: FILE_MAX_BYTES + 1, isInline: false }
          ]
        })
      }
      if (url.endsWith('/me/messages/M1/attachments/A1/$value')) {
        return new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/pdf' } })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const { messages, lastMs } = await syncGraphFolder('tok', account, 'inbox', 0, true)
    expect(messages).toHaveLength(2)
    expect(lastMs).toBe(Date.parse('2026-09-05T15:00:00Z'))
    const m1 = messages.find((m) => m.subject === 'Closing documents')!
    const m2 = messages.find((m) => m.subject === 'Just text')!
    expect(m2.attachments).toBeUndefined()
    expect(m1.attachments).toHaveLength(1)
    const [pdf] = m1.attachments!
    expect(pdf.filename).toBe('closing.pdf')
    expect(pdf.contentType).toBe('application/pdf')
    expect(pdf.size).toBe(pdfBytes.length)
    expect(pdf.data).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(pdf.data).equals(pdfBytes)).toBe(true)
    expect(calls.filter((u) => u.includes('/attachments'))).toEqual([
      'https://graph.microsoft.com/v1.0/me/messages/M1/attachments?$select=id,name,contentType,size,isInline',
      'https://graph.microsoft.com/v1.0/me/messages/M1/attachments/A1/$value'
    ])
  })

  it('a failed attachment listing or download never fails the sync', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/mailFolders/inbox/messages?')) {
        return json({ value: [{ id: 'M1', subject: 'Docs', receivedDateTime: '2026-09-05T14:02:00Z', hasAttachments: true }] })
      }
      return new Response('throttled', { status: 429 })
    })
    const { messages } = await syncGraphFolder('tok', account, 'inbox', 0, true)
    expect(messages).toHaveLength(1)
    expect(messages[0].attachments).toBeUndefined()

    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/mailFolders/inbox/messages?')) {
        return json({ value: [{ id: 'M1', subject: 'Docs', receivedDateTime: '2026-09-05T14:02:00Z', hasAttachments: true }] })
      }
      if (url.endsWith('/attachments?$select=id,name,contentType,size,isInline')) {
        return json({ value: [{ '@odata.type': '#microsoft.graph.fileAttachment', id: 'A1', name: 'a.pdf', contentType: 'application/pdf', size: 10, isInline: false }] })
      }
      throw new Error('network down')
    })
    const again = await syncGraphFolder('tok', account, 'inbox', 0, true)
    expect(again.messages).toHaveLength(1)
    expect(again.messages[0].attachments).toBeUndefined()
  })

  it('fetchGraphAttachments honours the sync budget', async () => {
    let valueCalls = 0
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/$value')) {
        valueCalls++
        return new Response(pdfBytes, { status: 200 })
      }
      return json({ value: [{ '@odata.type': '#microsoft.graph.fileAttachment', id: 'A1', name: 'a.pdf', contentType: 'application/pdf', size: pdfBytes.length }] })
    })
    const sync = new SyncBudget(pdfBytes.length, pdfBytes.length)
    expect((await fetchGraphAttachments('tok', 'M1', sync)).map((a) => a.filename)).toEqual(['a.pdf'])
    expect(await fetchGraphAttachments('tok', 'M2', sync)).toEqual([])
    expect(valueCalls).toBe(1)
  })
})
