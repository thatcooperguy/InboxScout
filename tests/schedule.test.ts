import { describe, expect, it } from 'vitest'
import { buildSchedule, parseScheduleText, scheduleToLines, titleSimilarity, type ScheduleItem } from '../src/main/schedule/engine'

// Sunday Sep 6 2026, 8:00 in the morning (local time).
const NOW = new Date(2026, 8, 6, 8, 0)
const iso = (d: Date): string => d.toISOString()
const day = (offset: number, h = 10): string => iso(new Date(2026, 8, 6 + offset, h, 0))

function item(partial: Partial<ScheduleItem> & { title: string; dateText: string }): ScheduleItem {
  return { source: 'appointment', ...partial }
}

describe('parseScheduleText', () => {
  it('reads absolute dates with and without times, using local parts', () => {
    const a = parseScheduleText('Sep 12', NOW)!
    expect([a.date.getFullYear(), a.date.getMonth(), a.date.getDate(), a.minutes]).toEqual([2026, 8, 12, null])
    expect(parseScheduleText('9/12 at 3pm', NOW)!.minutes).toBe(15 * 60)
    expect(parseScheduleText('September 12th, 2026 3:30 PM', NOW)!.minutes).toBe(15 * 60 + 30)
    expect(parseScheduleText('2026-09-12T15:00:00', NOW)!.minutes).toBe(15 * 60)
    expect(parseScheduleText('12 Sep at noon', NOW)!.minutes).toBe(12 * 60)
    expect(parseScheduleText('Tue Sep 15 15:00', NOW)!.date.getDate()).toBe(15)
    expect(parseScheduleText('Tue Sep 15 15:00', NOW)!.relative).toBe(false)
  })
  it('handles relative phrases relative to the anchor', () => {
    const tomorrow = parseScheduleText('tomorrow at 3', NOW)!
    expect(tomorrow.date.getDate()).toBe(7)
    expect(tomorrow.minutes).toBe(15 * 60)
    expect(tomorrow.relative).toBe(true)
    expect(parseScheduleText('next Tuesday at 6:00 pm', NOW)!.date.getDate()).toBe(8)
    expect(parseScheduleText('next week', NOW)!.date.getDate()).toBe(13)
    expect(parseScheduleText('in two weeks', NOW)!.date.getDate()).toBe(20)
    expect(parseScheduleText('end of month', NOW)!.date.getDate()).toBe(30)
    expect(parseScheduleText('the 20th', NOW)!.date.getDate()).toBe(20)
    expect(parseScheduleText('Friday 8am', NOW)!.date.getDate()).toBe(11)
    expect(parseScheduleText('Friday 8am', NOW)!.minutes).toBe(8 * 60)
  })
  it('never throws on garbage and returns null', () => {
    for (const bad of ['', 'soon', 'whenever you can', 'Feb 30', '13/45', '99:99', 'at 12 Main St', '   ', 'x'.repeat(500)]) {
      expect(parseScheduleText(bad, NOW)).toBeNull()
    }
    expect(parseScheduleText(undefined as unknown as string, NOW)).toBeNull()
    expect(parseScheduleText('Sep 12', new Date('nope'))).toBeNull()
  })
})

describe('buildSchedule', () => {
  it('builds days with Today / Tomorrow / "Tue Sep 8" labels and local ISO strings', () => {
    const r = buildSchedule(
      [
        item({ title: 'Dentist', dateText: 'Sep 6 at 2pm', person: 'Dr. Lee' }),
        item({ title: 'Call the plumber', dateText: 'tomorrow', source: 'promise', seenOn: day(0) }),
        item({ title: 'Parent conference', dateText: 'Tuesday 4:30 PM', seenOn: day(0) })
      ],
      NOW
    )
    expect(r.days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Tue Sep 8'])
    expect(r.days[0].date).toBe('2026-09-06')
    expect(r.days[0].events[0]).toMatchObject({ title: 'Dentist', iso: '2026-09-06T14:00:00', time: '2:00 pm', person: 'Dr. Lee' })
    expect(r.days[1].events[0]).toMatchObject({ title: 'Call the plumber', iso: '2026-09-07T09:00:00', time: null, source: 'promise' })
    expect(r.days[2].events[0].time).toBe('4:30 pm')
    expect(r.events).toHaveLength(3)
    expect(r.conflicts).toEqual([])
    expect(r.overdue).toEqual([])
  })
  it('anchors "tomorrow" on when the mail arrived, not on today', () => {
    const r = buildSchedule([item({ title: 'Return the library books', dateText: 'tomorrow', seenOn: day(-5) })], NOW)
    expect(r.days).toEqual([])
    expect(r.overdue).toEqual(['Overdue: Return the library books — was due Sep 2'])
  })
  it('skips items with garbage dates or empty titles without throwing', () => {
    const r = buildSchedule(
      [
        item({ title: 'Mystery', dateText: 'whenever' }),
        item({ title: '   ', dateText: 'Sep 8' }),
        { title: 'Broken', dateText: undefined as unknown as string, source: 'deadline' },
        null as unknown as ScheduleItem,
        item({ title: 'Real thing', dateText: 'Sep 8', seenOn: 'not a date' })
      ],
      NOW
    )
    expect(r.events.map((e) => e.title)).toEqual(['Real thing'])
    expect(buildSchedule([], new Date('garbage')).days).toEqual([])
  })
  it('sorts date-only events first, then by time', () => {
    const r = buildSchedule(
      [
        item({ title: 'Lunch with Sam', dateText: 'Sep 8 12:30pm' }),
        item({ title: 'Electric bill', dateText: 'Sep 8', source: 'deadline' }),
        item({ title: 'Yoga', dateText: 'Sep 8 7am' })
      ],
      NOW
    )
    expect(r.days[0].events.map((e) => e.title)).toEqual(['Electric bill', 'Yoga', 'Lunch with Sam'])
  })
  it('dedupes near-identical events across inboxes and messages', () => {
    const r = buildSchedule(
      [
        item({ title: 'Dentist appointment', dateText: 'Sep 8 2:00 pm', accountId: 'gmail', messageId: 'm1' }),
        item({ title: 'Dentist appointment with Dr. Lee', dateText: '9/8 at 2pm', accountId: 'outlook', messageId: 'm2', person: 'Dr. Lee' }),
        item({ title: 'Dentist appointment', dateText: 'Sep 8', source: 'deadline', messageId: 'm1' }),
        item({ title: 'Soccer practice', dateText: 'Sep 8 2pm' })
      ],
      NOW
    )
    const titles = r.days[0].events.map((e) => e.title)
    expect(titles).toHaveLength(2)
    expect(titles).toContain('Soccer practice')
    const dentist = r.days[0].events.find((e) => e.title.startsWith('Dentist'))!
    expect(dentist.time).toBe('2:00 pm')
    expect(dentist.person).toBe('Dr. Lee')
  })
  it('keeps different things at the same time apart', () => {
    const r = buildSchedule([item({ title: 'Dentist', dateText: 'Sep 8 2pm' }), item({ title: 'Parent conference', dateText: 'Sep 8 2pm' })], NOW)
    expect(r.days[0].events).toHaveLength(2)
  })
  it('flags two timed events within an hour as a conflict', () => {
    const r = buildSchedule(
      [
        item({ title: 'Dentist', dateText: 'Sep 8 at 2pm' }),
        item({ title: 'Parent conference', dateText: 'Sep 8 2:30 PM' }),
        item({ title: 'Dinner', dateText: 'Sep 8 6pm' }),
        item({ title: 'Trash day', dateText: 'Sep 8' })
      ],
      NOW
    )
    expect(r.conflicts).toEqual(['Tue Sep 8: Dentist (2:00 pm) overlaps Parent conference (2:30 pm)'])
    const byTitle = Object.fromEntries(r.days[0].events.map((e) => [e.title, e.conflict ?? false]))
    expect(byTitle).toEqual({ Dentist: true, 'Parent conference': true, Dinner: false, 'Trash day': false })
  })
  it('does not treat untimed events as conflicts', () => {
    const r = buildSchedule([item({ title: 'Bill due', dateText: 'Sep 8', source: 'deadline' }), item({ title: 'Rent due', dateText: 'Sep 8', source: 'deadline' })], NOW)
    expect(r.conflicts).toEqual([])
  })
  it('lists overdue items from the past two weeks only, oldest first', () => {
    const r = buildSchedule(
      [
        item({ title: 'Electric bill', dateText: 'Sep 2', source: 'deadline' }),
        item({ title: 'Water bill', dateText: 'Aug 30', source: 'deadline' }),
        item({ title: 'Ancient thing', dateText: 'Jul 1 2026', source: 'deadline' }),
        item({ title: 'Future thing', dateText: 'Sep 10', source: 'deadline' })
      ],
      NOW
    )
    expect(r.overdue).toEqual(['Overdue: Water bill — was due Aug 30', 'Overdue: Electric bill — was due Sep 2'])
    expect(r.events.map((e) => e.title)).toEqual(['Future thing'])
  })
  it('respects the horizon', () => {
    const items = [item({ title: 'Near', dateText: 'Sep 10' }), item({ title: 'Far', dateText: 'Oct 20' })]
    expect(buildSchedule(items, NOW).events.map((e) => e.title)).toEqual(['Near'])
    expect(buildSchedule(items, NOW, { horizonDays: 60 }).events.map((e) => e.title)).toEqual(['Near', 'Far'])
    expect(buildSchedule(items, NOW, { horizonDays: 2 }).events).toEqual([])
  })
  it('spots a weekly habit and projects the next one into the schedule', () => {
    // Soccer on the past three Tuesdays (Aug 18, 25, Sep 1) around 6pm, seen the day before each.
    const items = [
      item({ title: 'Soccer practice', dateText: 'Tuesday at 6pm', seenOn: iso(new Date(2026, 7, 17)), source: 'skill', sourceLabel: 'Kids', accountId: 'gmail', messageId: 'a' }),
      item({ title: 'Soccer practice', dateText: 'Aug 25 5:45 pm', source: 'skill', sourceLabel: 'Kids', accountId: 'gmail', messageId: 'b' }),
      item({ title: 'Soccer Practice', dateText: '9/1 6:15pm', source: 'skill', sourceLabel: 'Kids', accountId: 'gmail', messageId: 'c' })
    ]
    const r = buildSchedule(items, NOW)
    expect(r.patterns).toHaveLength(1)
    expect(r.patterns[0]).toMatchObject({ weekday: 2, time: '6:00 pm', occurrences: 3 })
    expect(r.recurring).toEqual(['Every Tuesday around 6:00 pm — Soccer practice'])
    // Projected onto Tue Sep 8 with the item's own source, not "ai".
    expect(r.days.map((d) => d.label)).toEqual(['Tue Sep 8'])
    expect(r.days[0].events[0]).toMatchObject({ title: 'Soccer practice', time: '6:00 pm', iso: '2026-09-08T18:00:00', source: 'skill', sourceLabel: 'Kids', accountId: 'gmail', messageId: 'c' })
    // Past occurrences are not "overdue" - they happened.
    expect(r.overdue).toEqual([])
  })
  it('does not double up when the next occurrence is already in the mail', () => {
    const items = [
      item({ title: 'Trash day', dateText: 'Aug 17', source: 'deadline' }),
      item({ title: 'Trash day', dateText: 'Aug 24', source: 'deadline' }),
      item({ title: 'Trash day', dateText: 'Aug 31', source: 'deadline' }),
      item({ title: 'Trash day', dateText: 'Sep 7', source: 'deadline' })
    ]
    const r = buildSchedule(items, NOW)
    expect(r.recurring).toEqual(['Every Monday — Trash day'])
    expect(r.patterns[0].time).toBeNull()
    expect(r.events.map((e) => e.iso)).toEqual(['2026-09-07T09:00:00'])
  })
  it('needs three occurrences on the same weekday at about the same time', () => {
    const scattered = [
      item({ title: 'Book club', dateText: 'Aug 18 7pm' }),
      item({ title: 'Book club', dateText: 'Aug 25 7pm' }),
      item({ title: 'Book club', dateText: 'Sep 2 7pm' }) // a Wednesday
    ]
    expect(buildSchedule(scattered, NOW).patterns).toEqual([])
    const drifting = [
      item({ title: 'Book club', dateText: 'Aug 18 7pm' }),
      item({ title: 'Book club', dateText: 'Aug 25 10am' }),
      item({ title: 'Book club', dateText: 'Sep 1 7pm' })
    ]
    expect(buildSchedule(drifting, NOW).patterns).toEqual([])
  })
  it('stays fast with thousands of items', () => {
    const items: ScheduleItem[] = []
    for (let i = 0; i < 5000; i++) {
      items.push(item({ title: `Task ${i % 700}`, dateText: `Sep ${1 + (i % 28)} ${1 + (i % 11)}pm`, messageId: `m${i}` }))
    }
    const t0 = Date.now()
    const r = buildSchedule(items, NOW)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r.days.length).toBeGreaterThan(0)
  })
})

describe('scheduleToLines', () => {
  it('renders warm short lines, in day order, marking conflicts', () => {
    const r = buildSchedule(
      [
        item({ title: 'Dentist', dateText: 'today 2pm', person: 'Dr. Lee', seenOn: day(0) }),
        item({ title: 'Parent conference', dateText: 'today 2:30pm', seenOn: day(0) }),
        item({ title: 'Electric bill', dateText: 'Sep 8', source: 'deadline' }),
        item({ title: 'Soccer practice', dateText: 'Sep 8 6pm' })
      ],
      NOW
    )
    expect(scheduleToLines(r)).toEqual([
      'Today — 2:00 pm Dentist (Dr. Lee) ‼',
      'Today — 2:30 pm Parent conference ‼',
      'Tue Sep 8 — Electric bill',
      'Tue Sep 8 — 6:00 pm Soccer practice'
    ])
    expect(scheduleToLines(r, 2)).toHaveLength(2)
    expect(scheduleToLines({ days: [], recurring: [], conflicts: [], overdue: [] })).toEqual([])
  })
})

describe('titleSimilarity', () => {
  it('measures token overlap ignoring filler words and case', () => {
    expect(titleSimilarity('Dentist appointment', 'dentist appointment with Dr. Lee')).toBe(1)
    expect(titleSimilarity('Soccer practice', 'Soccer game')).toBe(0.5)
    expect(titleSimilarity('Reminder: the electric bill', 'Electric bill due')).toBe(1)
    expect(titleSimilarity('', 'x')).toBe(0)
  })
})
