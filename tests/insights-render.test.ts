import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/main/reports/render'
import { eventsFromBrief } from '../src/main/reports/exports'
import { briefToSpeech } from '../src/shared/speech'
import { PROFILES } from '../src/main/profiles/profiles'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import type { Brief } from '../src/shared/types'

function brief(extra: Partial<Brief> = {}): Brief {
  return {
    headline: 'Two things need you.',
    topIssues: [],
    pulse: [],
    waitingOnYou: [],
    waitingOnThem: [],
    deadlines: ['Sep 20 — Old-style deadline'],
    personal: [],
    sensitiveNotices: [],
    skillSections: [],
    ...extra
  }
}

const schedule = {
  days: [
    { date: '2026-09-08', label: 'Today', events: [{ title: 'Dentist', iso: '2026-09-08T14:00:00', time: '2:00 pm', source: 'appointment' as const, person: 'Dr. Lee', conflict: true }] },
    { date: '2026-09-09', label: 'Tomorrow', events: [{ title: 'Electric bill due', iso: '2026-09-09T09:00:00', time: null, source: 'skill' as const, sourceLabel: 'Bills & invoices' }] }
  ],
  recurring: ['Every Tuesday around 6:00 pm — Soccer practice'],
  conflicts: ['Today: Dentist (2:00 pm) overlaps Parent conference (2:30 pm)'],
  overdue: ['Overdue: Water bill — was due Sep 2']
}

describe('quiet intelligence in briefs', () => {
  it('renders schedule, promises, circle, and inbox sections only when present', () => {
    const plain = renderMarkdown(brief(), PROFILES.general, 'daily', new Date('2026-09-08'))
    expect(plain).toContain('Dates & deadlines')
    expect(plain).not.toContain('This week')
    expect(plain).not.toContain('Your circle')

    const rich = renderMarkdown(
      brief({
        schedule,
        promises: [{ text: "I'll send the contract by Friday", to: 'Jane', address: 'jane@acme.com', due: '2026-09-12T09:00:00', subject: 'Contract', messageId: 'm1', madeOn: '2026-09-07', overdue: false }],
        people: { inner: [{ name: 'Mom', address: 'mom@example.com', role: 'family', note: 'family · writes every ~5 days' }], goingQuiet: ['You usually hear from Mom every week — it has been 3 weeks.'], newFaces: [] },
        inboxes: [
          { accountId: 'a', label: 'Work', email: 'w@x.com', role: 'work', newCount: 5, needsYou: 2, waitingOnYou: 1 },
          { accountId: 'b', label: 'Home', email: 'h@x.com', role: 'personal', newCount: 3, needsYou: 0, waitingOnYou: 0 }
        ]
      }),
      PROFILES.general,
      'weekly',
      new Date('2026-09-08')
    )
    expect(rich).toContain('## 🗓 This week')
    expect(rich).toContain('‼ 2:00 pm · Dentist (Dr. Lee)')
    expect(rich).toContain('Overdue: Water bill')
    expect(rich).toContain('Every Tuesday around 6:00 pm')
    expect(rich).not.toContain('Dates & deadlines')
    expect(rich).toContain('## 🤝 Promises you made')
    expect(rich).toContain('To Jane')
    expect(rich).toContain('## 👥 Your circle')
    expect(rich).toContain('**Mom**')
    expect(rich).toContain('## 📥 By inbox')
    expect(rich).toContain('**Work** (work) — 5 new, 2 need you, 1 waiting for your reply')
  })

  it('exports schedule events to the calendar without duplicating deadline lines', () => {
    const events = eventsFromBrief(brief({ schedule, deadlines: ['Sep 9 — Electric bill due', 'Sep 20 — Old-style deadline'] }), new Date('2026-09-08'))
    const titles = events.map((e) => e.title)
    expect(titles).toContain('2:00 pm Dentist')
    expect(titles).toContain('Electric bill due')
    expect(titles).toContain('Old-style deadline')
    expect(titles.filter((t) => /Electric bill/.test(t))).toHaveLength(1)
  })

  it('speaks today, overdue promises, and going-quiet people', () => {
    const text = briefToSpeech(
      brief({
        schedule,
        promises: [{ text: "I'll call you back", to: 'Dad', address: 'dad@example.com', due: '2026-09-01', subject: 'Call', messageId: 'm2', madeOn: '2026-08-30', overdue: true }],
        people: { inner: [], goingQuiet: ['You usually hear from Mom every week — it has been 3 weeks.'], newFaces: [] }
      }),
      { short: true }
    )
    expect(text).toContain('Today: 2:00 pm, Dentist')
    expect(text).toContain("You promised Dad: I'll call you back")
    expect(text).toContain('hear from Mom')
  })

  it('stores and lists people', () => {
    const db = openDatabase(':memory:')
    repo.replacePeople(db, [
      { key: 'mom@example.com', name: 'Mom', addresses: ['mom@example.com'], domain: 'example.com', received: 12, sent: 10, repliedByMe: 8, repliedToMe: 7, firstSeen: '2026-06-01', lastSeen: '2026-09-01', cadenceDays: 5, accounts: ['a'], role: 'family', tier: 'inner', score: 9.5, goingQuiet: false, quietDays: 7, isNew: false },
      { key: 'noreply@shop.com', name: 'Shop', addresses: ['noreply@shop.com'], domain: 'shop.com', received: 30, sent: 0, repliedByMe: 0, repliedToMe: 0, firstSeen: '2026-06-01', lastSeen: '2026-09-07', cadenceDays: 2, accounts: ['a', 'b'], role: 'automated', tier: 'occasional', score: 1, goingQuiet: false, quietDays: 1, isNew: false }
    ])
    const people = repo.listPeople(db)
    expect(people.map((p) => p.key)).toEqual(['mom@example.com', 'noreply@shop.com'])
    expect(people[0].accounts).toEqual(['a'])
    expect(people[1].accounts).toEqual(['a', 'b'])
    repo.replacePeople(db, [])
    expect(repo.listPeople(db)).toEqual([])
  })
})
