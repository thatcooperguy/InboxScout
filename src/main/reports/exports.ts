import type { Brief, IssueRecord } from '../../shared/types'

/** Pure CSV builder (RFC 4180 quoting). */
export function toCsv(rows: string[][]): string {
  const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map((c) => cell(c ?? '')).join(',')).join('\r\n') + '\r\n'
}

export function trackerRows(issues: IssueRecord[], brief: Brief | null): string[][] {
  const rows: string[][] = [['Type', 'Title', 'Status / severity', 'Next step', 'Date', 'Section']]
  for (const i of issues) rows.push(['Issue', i.title, `${i.state} / ${i.severity}`, i.ownerAction ?? '', i.deadline ?? '', ''])
  if (brief) {
    for (const d of brief.deadlines) rows.push(['Deadline', d, '', '', '', 'Dates & deadlines'])
    for (const s of brief.skillSections ?? []) for (const l of s.lines) rows.push([s.title, l, '', '', '', s.title])
    for (const w of brief.waitingOnYou) rows.push(['Waiting on you', w, '', 'Reply', '', 'Reply tracker'])
  }
  return rows
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/**
 * Best-effort date parsing for the loose phrases we extract ("Sep 12",
 * "9/15/2026", "Sep 12, 2026", "tomorrow", "Friday"). Returns null when unsure.
 */
export function parseLooseDate(text: string, now: Date): Date | null {
  const t = text.trim().toLowerCase()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (t === 'today') return today
  if (t === 'tomorrow') return new Date(today.getTime() + 86400000)
  const isNext = t.startsWith('next ')
  const dayName = t.replace(/^next /, '')
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName)
  if (dow >= 0) {
    let diff = (dow - today.getDay() + 7) % 7
    if (isNext && diff === 0) diff = 7
    return new Date(today.getTime() + diff * 86400000)
  }
  let m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear()
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]))
    if (!m[3] && d.getTime() < today.getTime() - 30 * 86400000) d.setFullYear(year + 1)
    return isNaN(d.getTime()) ? null : d
  }
  m = t.match(/^([a-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/)
  if (m && MONTHS[m[1]] !== undefined) {
    const year = m[3] ? Number(m[3]) : today.getFullYear()
    const d = new Date(year, MONTHS[m[1]], Number(m[2]))
    if (!m[3] && d.getTime() < today.getTime() - 30 * 86400000) d.setFullYear(year + 1)
    return d
  }
  return null
}

export interface CalendarEvent {
  title: string
  date: Date
}

/** Deadlines in the brief look like "Sep 12 — Electric bill due"; split and parse. */
export function eventsFromBrief(brief: Brief, now: Date): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const seen = new Set<string>()
  // The unified schedule (every inbox, skills, promises) is the richest source when present.
  for (const day of brief.schedule?.days ?? []) {
    for (const e of day.events) {
      const date = new Date(e.iso)
      if (Number.isNaN(date.getTime())) continue
      const key = `${day.date}|${e.title.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      events.push({ title: e.time ? `${e.time} ${e.title}` : e.title, date })
    }
  }
  for (const line of brief.deadlines) {
    const [when, ...rest] = line.split(/\s[—-]\s/)
    const date = parseLooseDate(when, now)
    if (!date) continue
    const title = rest.join(' — ') || line
    const key = `${date.toISOString().slice(0, 10)}|${title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({ title, date })
  }
  return events
}

function icsDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Pure iCalendar export of all-day events - imports into Google/Apple/Outlook calendars. */
export function toIcs(events: CalendarEvent[], stamp: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//InboxScout//EN', 'CALSCALE:GREGORIAN']
  events.forEach((e, i) => {
    const next = new Date(e.date.getTime() + 86400000)
    lines.push(
      'BEGIN:VEVENT',
      `UID:inboxscout-${stamp.getTime()}-${i}@inboxscout`,
      `DTSTAMP:${icsDate(stamp)}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${esc(e.title)}`,
      'END:VEVENT'
    )
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

