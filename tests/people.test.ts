import { describe, expect, it } from 'vitest'
import {
  buildPeople,
  inferOwnerName,
  inferVipAddresses,
  normalizeAddress,
  parseAddressList,
  summarizePeople,
  type PeopleInput,
  type Person
} from '../src/main/people/engine'
import type { Category, MessageRecord } from '../src/shared/types'

const NOW = new Date('2026-09-05T12:00:00.000Z')
const ME = ['chad@gmail.com', 'chad@cooperbuild.com']

let seq = 0
function msg(partial: Partial<MessageRecord> & { date: string }): MessageRecord {
  const id = partial.id ?? `m${++seq}`
  return {
    id,
    accountId: 'a1',
    folder: 'INBOX',
    uid: seq,
    messageId: `<${id}@test>`,
    threadKey: partial.threadKey ?? `t-${id}`,
    fromAddress: 'other@example.com',
    fromName: 'Other Person',
    toAddresses: 'chad@gmail.com',
    subject: 'Hello',
    snippet: '',
    bodyText: '',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...partial
  }
}

/** Day offset helper: daysAgo(3) = three days before NOW (plus optional hours). */
function daysAgo(days: number, hours = 0): string {
  return new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString()
}

/** Inbound message from someone to me. */
function from(address: string, name: string, days: number, extra: Partial<MessageRecord> = {}): MessageRecord {
  return msg({ fromAddress: address, fromName: name, toAddresses: 'chad@gmail.com', date: daysAgo(days), ...extra })
}

/** My reply to someone. */
function mine(to: string, days: number, extra: Partial<MessageRecord> = {}): MessageRecord {
  return msg({
    fromAddress: 'chad@gmail.com',
    fromName: 'Chad Cooper',
    fromMe: true,
    toAddresses: to,
    date: daysAgo(days),
    ...extra
  })
}

/** A two-way conversation: they write, I reply a day later, they reply again. Repeated `rounds` times. */
function conversation(address: string, name: string, startDays: number, rounds: number, extra: Partial<MessageRecord> = {}): MessageRecord[] {
  const out: MessageRecord[] = []
  for (let r = 0; r < rounds; r++) {
    const base = startDays - r * 7
    const threadKey = `conv-${address}-${r}`
    out.push(from(address, name, base, { threadKey, ...extra }))
    out.push(mine(`${name} <${address}>`, base - 0.5, { threadKey, ...extra, fromMe: true, fromAddress: 'chad@gmail.com', fromName: 'Chad Cooper' }))
    out.push(from(address, name, base - 1, { threadKey, ...extra }))
  }
  return out
}

/** One note from them and one reply from me per round, a week apart (steady weekly cadence). */
function pingPong(address: string, name: string, startDays: number, rounds: number, extra: Partial<MessageRecord> = {}): MessageRecord[] {
  const out: MessageRecord[] = []
  for (let r = 0; r < rounds; r++) {
    const base = startDays - r * 7
    const threadKey = `pp-${address}-${r}`
    out.push(from(address, name, base, { threadKey, ...extra }))
    out.push(mine(`${name} <${address}>`, base - 0.5, { threadKey, ...extra, fromMe: true, fromAddress: 'chad@gmail.com', fromName: 'Chad Cooper' }))
  }
  return out
}

function build(messages: MessageRecord[], overrides: Partial<PeopleInput> = {}, categories: Record<string, Category> = {}): Person[] {
  return buildPeople({
    messages,
    categoryOf: (id) => categories[id],
    myAddresses: ME,
    now: NOW,
    ...overrides
  })
}

function byKey(people: Person[], key: string): Person {
  const p = people.find((x) => x.key === key)
  if (!p) throw new Error(`no person ${key}; have ${people.map((x) => x.key).join(', ')}`)
  return p
}

describe('address helpers', () => {
  it('normalises case, angle brackets and +tags', () => {
    expect(normalizeAddress('  "Dana" <Dana.Ruiz+news@Northwind.COM> ')).toBe('dana.ruiz@northwind.com')
    expect(normalizeAddress('MOM@GMAIL.COM')).toBe('mom@gmail.com')
    expect(normalizeAddress('')).toBe('')
    expect(normalizeAddress(undefined)).toBe('')
  })

  it('parses messy recipient lists', () => {
    const parsed = parseAddressList('"Ruiz, Dana" <dana@northwind.com>, bob@example.com; Carol <CAROL+x@Example.com>')
    expect(parsed).toEqual([
      { address: 'dana@northwind.com', name: 'Dana Ruiz' },
      { address: 'bob@example.com', name: '' },
      { address: 'carol@example.com', name: 'Carol' }
    ])
  })
})

describe('inferOwnerName', () => {
  it('picks the most common display name on the owner’s own sent mail', () => {
    const messages = [
      mine('a@x.com', 5, { fromName: 'Chad Cooper' }),
      mine('b@x.com', 4, { fromName: 'Chad Cooper' }),
      mine('c@x.com', 3, { fromName: 'C. Cooper' }),
      from('a@x.com', 'Chad Impostor', 2)
    ]
    expect(inferOwnerName(messages, ME)).toBe('Chad Cooper')
    expect(inferOwnerName([], ME)).toBeNull()
  })
})

describe('buildPeople identity', () => {
  it('builds one person per correspondent, ignoring the owner’s own addresses', () => {
    const people = build([
      from('Dana@Northwind.com', 'Dana Ruiz', 3),
      from('dana+promo@northwind.com', 'Dana Ruiz', 2),
      mine('Dana Ruiz <dana@northwind.com>, chad@cooperbuild.com', 1)
    ])
    expect(people).toHaveLength(1)
    const dana = byKey(people, 'dana@northwind.com')
    expect(dana.received).toBe(2)
    expect(dana.sent).toBe(1)
    expect(dana.name).toBe('Dana Ruiz')
    expect(dana.domain).toBe('northwind.com')
  })

  it('merges addresses that share a display name and domain', () => {
    const people = build([
      from('dana@northwind.com', 'Dana Ruiz', 6),
      from('dana.ruiz@northwind.com', 'Dana Ruiz', 4),
      from('dana@northwind.com', 'Dana Ruiz', 2),
      from('dana@othercorp.com', 'Dana Ruiz', 1)
    ])
    expect(people).toHaveLength(2)
    const dana = byKey(people, 'dana@northwind.com')
    expect(dana.addresses).toEqual(['dana.ruiz@northwind.com', 'dana@northwind.com'])
    expect(dana.received).toBe(3)
    expect(byKey(people, 'dana@othercorp.com').received).toBe(1)
  })

  it('tracks accounts, first/last seen and cadence across inboxes', () => {
    const people = build([
      from('pat@example.com', 'Pat Lee', 20, { accountId: 'gmail' }),
      from('pat@example.com', 'Pat Lee', 15, { accountId: 'work' }),
      from('pat@example.com', 'Pat Lee', 10, { accountId: 'gmail' }),
      from('pat@example.com', 'Pat Lee', 2, { accountId: 'gmail' }),
      from('solo@example.com', 'Solo', 9),
      from('solo@example.com', 'Solo', 4)
    ])
    const pat = byKey(people, 'pat@example.com')
    expect(pat.accounts).toEqual(['gmail', 'work'])
    expect(pat.firstSeen).toBe(daysAgo(20))
    expect(pat.lastSeen).toBe(daysAgo(2))
    // gaps 5, 5, 8 → median 5
    expect(pat.cadenceDays).toBe(5)
    expect(byKey(people, 'solo@example.com').cadenceDays).toBeNull()
  })
})

describe('reply tracking', () => {
  it('counts replies per thread in both directions using date order', () => {
    const people = build([
      from('amy@example.com', 'Amy', 10, { threadKey: 'T1' }),
      mine('Amy <amy@example.com>', 9, { threadKey: 'T1' }),
      from('amy@example.com', 'Amy', 8, { threadKey: 'T1' }),
      mine('amy@example.com', 7, { threadKey: 'T1' }), // second reply in same thread does not double count
      mine('amy@example.com', 5, { threadKey: 'T2' }), // I start a thread
      from('amy@example.com', 'Amy', 4, { threadKey: 'T2' }),
      from('amy@example.com', 'Amy', 3, { threadKey: 'T3' }) // unanswered
    ])
    const amy = byKey(people, 'amy@example.com')
    expect(amy.received).toBe(4)
    expect(amy.sent).toBe(3)
    expect(amy.repliedByMe).toBe(1)
    expect(amy.repliedToMe).toBe(2)
    expect(amy.replyHoursByMe).toBe(24)
  })
})

describe('role inference', () => {
  it('flags noreply senders, unsubscribe-heavy senders, and silent bulk senders as automated', () => {
    const messages: MessageRecord[] = [
      from('noreply@shop.com', 'Shop', 3),
      from('news@blog.com', 'Blog', 5, { listUnsubscribe: '<mailto:u@blog.com>' }),
      from('news@blog.com', 'Blog', 2, { listUnsubscribe: '<mailto:u@blog.com>' }),
      from('news@blog.com', 'Blog', 1)
    ]
    for (let i = 0; i < 5; i++) messages.push(from('bob@tool.io', 'Tool Bob', 10 - i))
    const people = build(messages)
    expect(byKey(people, 'noreply@shop.com').role).toBe('automated')
    expect(byKey(people, 'news@blog.com').role).toBe('automated')
    expect(byKey(people, 'bob@tool.io').role).toBe('automated')
  })

  it('flags billing/support senders and transactional domains as service', () => {
    const people = build([
      from('billing@utility.com', 'Utility Billing', 3),
      from('service@paypal.com', 'PayPal', 2),
      from('appointments@dentist.com', 'Smile Dental', 1)
    ])
    expect(byKey(people, 'billing@utility.com').role).toBe('service')
    expect(byKey(people, 'service@paypal.com').role).toBe('service')
    expect(byKey(people, 'appointments@dentist.com').role).toBe('service')
  })

  it('treats people on the owner’s work domain as colleagues', () => {
    const people = build([from('sam@cooperbuild.com', 'Sam Ortiz', 2)])
    expect(byKey(people, 'sam@cooperbuild.com').role).toBe('colleague')
  })

  it('separates vendors from clients by who is invoicing whom', () => {
    const cats: Record<string, Category> = {}
    const messages = [
      from('ap@lumberco.com', 'Lumber Co', 4, { id: 'v1', subject: 'Invoice #4432 for your order' }),
      from('ap@lumberco.com', 'Lumber Co', 2, { id: 'v2', subject: 'Statement for August' }),
      from('jane@homeowner.org', 'Jane Park', 6, { id: 'c1', subject: 'Deck project', snippet: 'Can you send a quote for the deck?' }),
      mine('Jane Park <jane@homeowner.org>', 5, { id: 'c2', subject: 'Re: Deck project — estimate attached' })
    ]
    for (const id of ['v1', 'v2', 'c1', 'c2']) cats[id] = 'work'
    const people = build(messages, {}, cats)
    expect(byKey(people, 'ap@lumberco.com').role).toBe('vendor')
    expect(byKey(people, 'jane@homeowner.org').role).toBe('client')
  })

  it('finds family via kin words and via a shared surname in personal mail', () => {
    const cats: Record<string, Category> = { k1: 'personal', s1: 'personal', s2: 'personal' }
    const people = build(
      [
        from('linda@gmail.com', 'Linda', 3, { id: 'k1', bodyText: 'Hi honey, call your dad this weekend. Love you!' }),
        from('bill.cooper@yahoo.com', 'Bill Cooper', 4, { id: 's1', subject: 'Fishing trip' }),
        mine('Bill Cooper <bill.cooper@yahoo.com>', 3, { id: 's2' })
      ],
      { ownerName: 'Chad Cooper' },
      cats
    )
    expect(byKey(people, 'linda@gmail.com').role).toBe('family')
    expect(byKey(people, 'bill.cooper@yahoo.com').role).toBe('family')
  })

  it('calls two-way personal correspondents friends and one-way strangers unknown', () => {
    const cats: Record<string, Category> = { f1: 'personal', f2: 'personal', u1: 'personal' }
    const people = build(
      [
        from('joe@example.com', 'Joe', 4, { id: 'f1', threadKey: 'J' }),
        mine('joe@example.com', 3, { id: 'f2', threadKey: 'J' }),
        from('stranger@example.com', 'Stranger', 2, { id: 'u1' })
      ],
      {},
      cats
    )
    expect(byKey(people, 'joe@example.com').role).toBe('friend')
    expect(byKey(people, 'stranger@example.com').role).toBe('unknown')
  })
})

describe('tiers, quiet and new', () => {
  it('puts people with replies both ways in the inner circle and never automated senders', () => {
    const messages = [
      ...conversation('amy@example.com', 'Amy Chen', 20, 3),
      from('joe@example.com', 'Joe', 4, { threadKey: 'J' }),
      mine('joe@example.com', 3, { threadKey: 'J' }),
      from('cold@example.com', 'Cold Pitch', 1)
    ]
    for (let i = 0; i < 6; i++) messages.push(from('noreply@bank.com', 'Bank', 12 - i))
    const people = build(messages)
    expect(byKey(people, 'amy@example.com').tier).toBe('inner')
    expect(byKey(people, 'joe@example.com').tier).toBe('regular')
    expect(byKey(people, 'cold@example.com').tier).toBe('occasional')
    expect(byKey(people, 'noreply@bank.com').tier).toBe('occasional')
    expect(people[0].key).toBe('amy@example.com') // sorted by score
  })

  it('caps the inner circle at eight and ranks by score', () => {
    const messages: MessageRecord[] = []
    for (let i = 0; i < 10; i++) messages.push(...conversation(`p${i}@example.com`, `Person ${i}`, 80, i + 1))
    const people = build(messages)
    const inner = people.filter((p) => p.tier === 'inner')
    expect(inner).toHaveLength(8)
    expect(inner.map((p) => p.key)).not.toContain('p0@example.com')
    expect(inner.map((p) => p.key)).not.toContain('p1@example.com')
    expect(people.filter((p) => p.tier === 'regular').map((p) => p.key).sort()).toEqual(['p0@example.com', 'p1@example.com'])
  })

  it('demotes quietPeople to occasional and keeps them out of the VIP list', () => {
    const people = build(conversation('amy@example.com', 'Amy Chen', 20, 3), { quietPeople: ['Amy@Example.com'] })
    expect(byKey(people, 'amy@example.com').tier).toBe('occasional')
    expect(inferVipAddresses(people)).toEqual([])
  })

  it('marks regulars who have gone quiet relative to their cadence', () => {
    const messages = [
      ...pingPong('mom@gmail.com', 'Mom', 60, 4, { bodyText: 'love you, Mom' }),
      ...conversation('steady@example.com', 'Steady Sue', 20, 3)
    ]
    const people = build(messages)
    const mom = byKey(people, 'mom@gmail.com')
    expect(mom.role).toBe('family')
    expect(mom.cadenceDays).toBe(7)
    expect(mom.quietDays).toBe(38)
    expect(mom.goingQuiet).toBe(true)
    expect(byKey(people, 'steady@example.com').goingQuiet).toBe(false)
  })

  it('spots new faces who have already written more than once', () => {
    const people = build([
      from('dana@northwind.com', 'Dana Ruiz', 4),
      from('dana@northwind.com', 'Dana Ruiz', 1),
      from('once@example.com', 'Once', 2),
      from('old@example.com', 'Old Timer', 40),
      from('old@example.com', 'Old Timer', 1),
      from('noreply@new.com', 'Bot', 3),
      from('noreply@new.com', 'Bot', 1)
    ])
    expect(byKey(people, 'dana@northwind.com').isNew).toBe(true)
    expect(byKey(people, 'once@example.com').isNew).toBe(false)
    expect(byKey(people, 'old@example.com').isNew).toBe(false)
    expect(byKey(people, 'noreply@new.com').isNew).toBe(false)
  })

  it('lists every address of inner-circle people as VIPs', () => {
    const people = build([
      ...conversation('amy@example.com', 'Amy Chen', 10, 2),
      from('amy.chen@example.com', 'Amy Chen', 1)
    ])
    expect(inferVipAddresses(people).sort()).toEqual(['amy.chen@example.com', 'amy@example.com'])
  })
})

describe('summarizePeople', () => {
  it('writes short, warm lines backed by the numbers', () => {
    const messages = [
      ...conversation('amy@example.com', 'Amy Chen', 28, 4),
      ...pingPong('mom@gmail.com', 'Mom', 60, 4, { bodyText: 'love you, Mom' }),
      from('dana@northwind.com', 'Dana Ruiz', 4),
      from('dana@northwind.com', 'Dana Ruiz', 3),
      from('dana@northwind.com', 'Dana Ruiz', 1)
    ]
    const brief = summarizePeople(build(messages), NOW)
    expect(brief.inner.length).toBeGreaterThanOrEqual(1)
    const amy = brief.inner.find((l) => l.address === 'amy@example.com')!
    expect(amy.name).toBe('Amy Chen')
    expect(amy.note).toContain('12 emails this month')
    expect(amy.note).toContain('you both reply within a day')

    expect(brief.goingQuiet).toHaveLength(1)
    expect(brief.goingQuiet[0]).toMatch(/^You usually hear from Mom \(mom@gmail\.com\) every week — it's been 5 weeks\.$/)

    expect(brief.newFaces).toHaveLength(1)
    expect(brief.newFaces[0]).toBe(`New: Dana Ruiz at Northwind (3 emails since ${shortDate(daysAgo(4))})`)

    for (const line of [...brief.goingQuiet, ...brief.newFaces, ...brief.inner.map((l) => l.note)]) {
      expect(line.length).toBeLessThanOrEqual(120)
    }
  })

  it('caps counts and clips very long names', () => {
    const messages: MessageRecord[] = []
    for (let i = 0; i < 9; i++) messages.push(...conversation(`p${i}@example.com`, `Person Number ${i} With A Truly Ridiculously Long Display Name That Goes On And On`, 10, 2))
    const brief = summarizePeople(build(messages), NOW)
    expect(brief.inner).toHaveLength(6)
    for (const l of brief.inner) expect(l.name.length).toBeLessThanOrEqual(60)
  })

  it('never throws on empty or junk input', () => {
    expect(build([])).toEqual([])
    expect(summarizePeople([], NOW)).toEqual({ inner: [], goingQuiet: [], newFaces: [] })
    const junk = build([
      msg({ date: 'not a date', fromAddress: '', fromName: '', toAddresses: '' }),
      msg({ date: daysAgo(1), fromAddress: 'weird', toAddresses: 'nothing here' }),
      mine('', 1)
    ])
    expect(Array.isArray(junk)).toBe(true)
    expect(junk).toHaveLength(0)
    expect(() => summarizePeople(junk, new Date('invalid'))).not.toThrow()
  })
})

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`
}
