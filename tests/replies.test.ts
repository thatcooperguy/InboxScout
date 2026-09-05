import { describe, expect, it } from 'vitest'
import { trackReplies } from '../src/main/pipeline/replies'
import type { Category, MessageRecord } from '../src/shared/types'

const NOW = new Date('2026-09-05T12:00:00.000Z')

function msg(partial: Partial<MessageRecord> & { id: string; threadKey: string; date: string }): MessageRecord {
  return {
    accountId: 'a1',
    folder: 'INBOX',
    uid: 1,
    messageId: `<${partial.id}@test>`,
    fromAddress: 'other@example.com',
    fromName: 'Other Person',
    toAddresses: 'me@example.com',
    subject: 'Test thread',
    snippet: '',
    bodyText: '',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...partial
  }
}

describe('trackReplies', () => {
  const categories: Record<string, Category> = {}
  const categoryOf = (id: string): Category | undefined => categories[id]

  it('flags inbound work threads as waiting on you', () => {
    categories['m2'] = 'work'
    const result = trackReplies(
      [
        msg({ id: 'm1', threadKey: 't1', date: '2026-09-01T10:00:00.000Z', fromMe: true }),
        msg({ id: 'm2', threadKey: 't1', date: '2026-09-04T10:00:00.000Z', subject: 'Quote request' })
      ],
      categoryOf,
      NOW
    )
    expect(result.waitingOnYou).toHaveLength(1)
    expect(result.waitingOnYou[0].subject).toBe('Quote request')
    expect(result.waitingOnThem).toHaveLength(0)
  })

  it('ignores inbound threads that are not work mail', () => {
    categories['m3'] = 'promotions_noise'
    const result = trackReplies([msg({ id: 'm3', threadKey: 't2', date: '2026-09-04T10:00:00.000Z' })], categoryOf, NOW)
    expect(result.waitingOnYou).toHaveLength(0)
  })

  it('flags threads where the user spoke last and days have passed', () => {
    const result = trackReplies(
      [
        msg({ id: 'm4', threadKey: 't3', date: '2026-09-01T10:00:00.000Z', fromName: 'Jane Lender' }),
        msg({ id: 'm5', threadKey: 't3', date: '2026-09-02T10:00:00.000Z', fromMe: true, fromAddress: 'me@example.com' })
      ],
      categoryOf,
      NOW
    )
    expect(result.waitingOnThem).toHaveLength(1)
    expect(result.waitingOnThem[0].counterpart).toBe('Jane Lender')
    expect(result.waitingOnThem[0].daysWaiting).toBe(3)
  })

  it('does not flag fresh outbound mail (under the waiting threshold)', () => {
    const result = trackReplies(
      [msg({ id: 'm6', threadKey: 't4', date: '2026-09-04T20:00:00.000Z', fromMe: true })],
      categoryOf,
      NOW
    )
    expect(result.waitingOnThem).toHaveLength(0)
  })
})
