import { describe, expect, it } from 'vitest'
import { graphUid, htmlToText, mapGraphMessage } from '../src/main/mail/graph'
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
