import { describe, expect, it } from 'vitest'
import { extractBody, mapGmailMessage } from '../src/main/mail/gmail'
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
