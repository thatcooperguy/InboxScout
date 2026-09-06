import { describe, expect, it } from 'vitest'
import { dedupeAcrossAccounts, summarizeInboxes } from '../src/main/pipeline/inboxes'
import type { ReplyTrackerResult } from '../src/main/pipeline/replies'
import type { AccountConfig, Category, MessageRecord } from '../src/shared/types'

const accounts: AccountConfig[] = [
  { id: 'work', label: 'Work', email: 'chad@company.com', provider: 'gmail', host: '', port: 993, folders: ['INBOX'], createdAt: '' },
  { id: 'home', label: 'Personal', email: 'chad@example.com', provider: 'icloud', host: '', port: 993, folders: ['INBOX'], createdAt: '' }
]

let seq = 0
function msg(partial: Partial<MessageRecord> & { accountId: string }): MessageRecord {
  seq++
  return {
    id: partial.id ?? `${partial.accountId}-${seq}`,
    folder: 'INBOX',
    uid: seq,
    messageId: `<${seq}@test>`,
    threadKey: `t${seq}`,
    fromAddress: `sender${seq}@example.com`,
    fromName: 'Sender',
    toAddresses: 'chad@example.com',
    subject: `Subject ${seq}`,
    date: new Date(Date.UTC(2026, 8, 1, 0, 0, seq)).toISOString(),
    snippet: '',
    bodyText: '',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...partial
  }
}

/** n inbound messages on an account, each classified as `category`. */
function batch(accountId: string, n: number, category: Category | undefined, categories: Map<string, Category>): MessageRecord[] {
  return Array.from({ length: n }, () => {
    const m = msg({ accountId })
    if (category) categories.set(m.id, category)
    return m
  })
}

const noReplies: ReplyTrackerResult = { waitingOnYou: [], waitingOnThem: [] }

describe('summarizeInboxes', () => {
  it('returns one summary per account in the given order, even with no mail', () => {
    const out = summarizeInboxes(accounts, [], () => undefined, noReplies, new Set())
    expect(out.map((s) => s.accountId)).toEqual(['work', 'home'])
    expect(out[0]).toEqual({ accountId: 'work', label: 'Work', email: 'chad@company.com', role: 'mixed', newCount: 0, needsYou: 0, waitingOnYou: 0 })
  })

  it('calls an inbox "work" when at least 65% of classified inbound mail is work', () => {
    const categories = new Map<string, Category>()
    const messages = [...batch('work', 14, 'work', categories), ...batch('work', 6, 'personal', categories)]
    const out = summarizeInboxes(accounts, messages, (id) => categories.get(id), noReplies, new Set())
    expect(out[0].role).toBe('work')
  })

  it('counts promotions with personal mail when deciding "personal"', () => {
    const categories = new Map<string, Category>()
    const messages = [...batch('home', 5, 'personal', categories), ...batch('home', 9, 'promotions_noise', categories), ...batch('home', 6, 'work', categories)]
    const out = summarizeInboxes(accounts, messages, (id) => categories.get(id), noReplies, new Set())
    expect(out[1].role).toBe('personal')
  })

  it('is "mixed" when neither side reaches 65% or fewer than 10 messages are classified', () => {
    const categories = new Map<string, Category>()
    const messages = [
      ...batch('work', 6, 'work', categories),
      ...batch('work', 5, 'personal', categories),
      ...batch('home', 9, 'personal', categories),
      ...batch('home', 40, undefined, categories)
    ]
    const out = summarizeInboxes(accounts, messages, (id) => categories.get(id), noReplies, new Set())
    expect(out.map((s) => s.role)).toEqual(['mixed', 'mixed'])
  })

  it('judges the role on the most recent 200 inbound messages and ignores the owner’s own mail', () => {
    const categories = new Map<string, Category>()
    const old = batch('work', 300, 'personal', categories).map((m, i) => ({ ...m, date: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }))
    const recent = batch('work', 200, 'work', categories).map((m, i) => ({ ...m, date: new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString() }))
    const sentByMe = batch('work', 100, 'personal', categories).map((m) => ({ ...m, fromMe: true, date: '2026-09-02T00:00:00.000Z' }))
    const out = summarizeInboxes(accounts, [...old, ...recent, ...sentByMe], (id) => categories.get(id), noReplies, new Set())
    expect(out[0].role).toBe('work')
  })

  it('counts new messages per account', () => {
    const messages = [msg({ accountId: 'work', id: 'w1' }), msg({ accountId: 'work', id: 'w2' }), msg({ accountId: 'home', id: 'h1' })]
    const out = summarizeInboxes(accounts, messages, () => undefined, noReplies, new Set(['w1', 'h1', 'ghost']))
    expect(out.map((s) => s.newCount)).toEqual([1, 1])
  })

  it('attributes waiting-on-you threads to the inbox the sender wrote to', () => {
    const messages = [
      msg({ accountId: 'work', fromAddress: 'Dana@Client.com', subject: 'Re: Quote' }),
      msg({ accountId: 'home', fromAddress: 'mom@family.net', subject: 'Sunday lunch' })
    ]
    const replies: ReplyTrackerResult = {
      waitingOnYou: [
        { subject: 'Quote', counterpart: 'Dana', address: 'dana@client.com', daysWaiting: 3 },
        { subject: 'Sunday lunch', counterpart: 'Mom', address: 'mom@family.net', daysWaiting: 1 },
        { subject: 'Unknown', counterpart: 'Nobody', address: 'nobody@nowhere.org', daysWaiting: 9 }
      ],
      waitingOnThem: []
    }
    const out = summarizeInboxes(accounts, messages, () => undefined, replies, new Set())
    expect(out.map((s) => s.waitingOnYou)).toEqual([1, 1])
    expect(out.map((s) => s.needsYou)).toEqual([1, 1])
  })

  it('uses the subject to pick the right inbox when one sender writes to both', () => {
    const messages = [
      msg({ accountId: 'work', fromAddress: 'sam@both.com', subject: 'Invoice 42' }),
      msg({ accountId: 'home', fromAddress: 'sam@both.com', subject: 'BBQ on Saturday' })
    ]
    const replies: ReplyTrackerResult = {
      waitingOnYou: [{ subject: 'Invoice 42', counterpart: 'Sam', address: 'sam@both.com', daysWaiting: 2 }],
      waitingOnThem: []
    }
    const out = summarizeInboxes(accounts, messages, () => undefined, replies, new Set())
    expect(out.map((s) => s.waitingOnYou)).toEqual([1, 0])
  })

  it('needsYou adds new work messages that are not already waiting-on-you threads', () => {
    const categories = new Map<string, Category>()
    const messages = [
      msg({ accountId: 'work', id: 'w1', fromAddress: 'dana@client.com', subject: 'Quote' }),
      msg({ accountId: 'work', id: 'w2', fromAddress: 'new@client.com' }),
      msg({ accountId: 'work', id: 'w3', fromAddress: 'shop@promo.com' }),
      msg({ accountId: 'work', id: 'w4', fromAddress: 'chad@company.com', fromMe: true }),
      msg({ accountId: 'work', id: 'w5', fromAddress: 'old@client.com' })
    ]
    categories.set('w1', 'work')
    categories.set('w2', 'work')
    categories.set('w3', 'promotions_noise')
    categories.set('w4', 'work')
    categories.set('w5', 'work')
    const replies: ReplyTrackerResult = {
      waitingOnYou: [{ subject: 'Quote', counterpart: 'Dana', address: 'dana@client.com', daysWaiting: 2 }],
      waitingOnThem: []
    }
    const out = summarizeInboxes(accounts, messages, (id) => categories.get(id), replies, new Set(['w1', 'w2', 'w3', 'w4']))
    expect(out[0]).toMatchObject({ newCount: 4, waitingOnYou: 1, needsYou: 2 })
  })

  it('caps the new-work part of needsYou at 25 per inbox', () => {
    const categories = new Map<string, Category>()
    const messages = batch('work', 60, 'work', categories)
    const out = summarizeInboxes(accounts, messages, (id) => categories.get(id), noReplies, new Set(messages.map((m) => m.id)))
    expect(out[0]).toMatchObject({ newCount: 60, needsYou: 25, waitingOnYou: 0 })
  })

  it('survives a throwing classifier and odd inputs', () => {
    const messages = [msg({ accountId: 'work' })]
    const out = summarizeInboxes(
      accounts,
      messages,
      () => {
        throw new Error('boom')
      },
      { waitingOnYou: [{ subject: '', counterpart: '', address: '', daysWaiting: 0 }], waitingOnThem: [] },
      new Set()
    )
    expect(out[0].role).toBe('mixed')
    expect(out[0].waitingOnYou).toBe(0)
  })
})

describe('dedupeAcrossAccounts', () => {
  const m = (id: string, accountId: string, messageId: string, date: string) => ({ id, accountId, messageId, date })

  it('keeps the earliest copy of a message delivered to two inboxes', () => {
    const later = m('b', 'home', '<abc@mail>', '2026-09-01T10:05:00.000Z')
    const earlier = m('a', 'work', '<abc@mail>', '2026-09-01T10:00:00.000Z')
    expect(dedupeAcrossAccounts([later, earlier])).toEqual([earlier])
  })

  it('normalises Message-IDs (case, whitespace, angle brackets)', () => {
    const a = m('a', 'work', '<ABC@Mail>', '2026-09-01T10:00:00.000Z')
    const b = m('b', 'home', '  abc@mail ', '2026-09-01T11:00:00.000Z')
    expect(dedupeAcrossAccounts([a, b])).toEqual([a])
  })

  it('always keeps messages with an empty Message-ID', () => {
    const list = [m('a', 'work', '', '2026-09-01T10:00:00.000Z'), m('b', 'home', '', '2026-09-01T10:00:00.000Z'), m('c', 'home', '<>', '2026-09-01T10:00:00.000Z')]
    expect(dedupeAcrossAccounts(list)).toEqual(list)
  })

  it('leaves copies within the same account alone and preserves order', () => {
    const inbox = m('a', 'work', '<x@mail>', '2026-09-01T10:00:00.000Z')
    const sent = m('b', 'work', '<x@mail>', '2026-09-01T10:00:00.000Z')
    const other = m('c', 'home', '<x@mail>', '2026-09-01T12:00:00.000Z')
    const unrelated = m('d', 'home', '<y@mail>', '2026-09-01T09:00:00.000Z')
    expect(dedupeAcrossAccounts([unrelated, inbox, other, sent])).toEqual([unrelated, inbox, sent])
  })

  it('prefers the first copy on a tie and treats a bad date as latest', () => {
    const first = m('a', 'home', '<t@mail>', '2026-09-01T10:00:00.000Z')
    const second = m('b', 'work', '<t@mail>', '2026-09-01T10:00:00.000Z')
    const junk = m('c', 'work', '<u@mail>', 'garbage')
    const good = m('d', 'home', '<u@mail>', '2026-09-01T10:00:00.000Z')
    expect(dedupeAcrossAccounts([first, second, junk, good])).toEqual([first, good])
    expect(dedupeAcrossAccounts([])).toEqual([])
  })
})
