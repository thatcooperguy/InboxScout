import type { BriefSchedule, ScheduleDay, ScheduleEvent, ScheduleSource } from '../../shared/types'
import { parseLooseDate } from '../reports/exports'

/**
 * Unified schedule across every inbox: deadlines, appointments, travel, skill
 * dates, promises. Pure and electron-free.
 *
 * Everything here works with LOCAL date parts (new Date(y, m, d, h, mi)) so the
 * result reads the same in any timezone, and nothing throws on garbage input —
 * an item we cannot date is simply skipped.
 */
export interface ScheduleItem {
  title: string
  /** Loose date text as found in mail ("Sep 12", "9/12", "next Tuesday at 3pm", "tomorrow"). */
  dateText: string
  source: ScheduleSource
  sourceLabel?: string
  person?: string
  accountId?: string
  messageId?: string
  /** When the message was received (anchors relative phrases like "tomorrow"). */
  seenOn?: string
}

export interface RecurringPattern {
  title: string
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
  time: string | null
  occurrences: number
  /** "Every Tuesday around 6:00 pm — Soccer practice" */
  description: string
}

export interface ScheduleResult extends BriefSchedule {
  patterns: RecurringPattern[]
  /** Every dated event in the horizon (for calendar export). */
  events: ScheduleEvent[]
}

// ---------------------------------------------------------------------------
// Constants & small helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86400000
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_LONG = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'at', 'on', 'in', 'with', 'and', 'your', 'my', 'our', 'is', 're', 'fwd', 'fw', 'reminder', 'due'])

/** How many minutes apart two timed events may be and still "overlap". */
const CONFLICT_MINUTES = 60
/** How far back we look for things that slipped past. */
const OVERDUE_DAYS = 14
/** How far back we look when spotting weekly habits. */
const PATTERN_LOOKBACK_DAYS = 90
/** Times within ±45 minutes count as "the same time" for a weekly habit. */
const PATTERN_TIME_SLACK = 45
const PATTERN_MIN_OCCURRENCES = 3
const TITLE_SIMILARITY = 0.6

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayNumber(d: Date): number {
  // Whole days since epoch using local parts; DST-safe because we round.
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

function localIso(d: Date): string {
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

/** "6:00 pm" from minutes since midnight. */
export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const suffix = h24 >= 12 ? 'pm' : 'am'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

function shortDate(d: Date): string {
  return `${MON_SHORT[d.getMonth()]} ${d.getDate()}`
}

function isValidDate(d: Date | null | undefined): d is Date {
  return !!d && !isNaN(d.getTime())
}

function safeDate(s: string | undefined): Date | null {
  if (!s || typeof s !== 'string') return null
  const d = new Date(s)
  return isValidDate(d) ? d : null
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedWhen {
  /** Local midnight of the day. */
  date: Date
  /** Minutes since midnight, or null when only the day is known. */
  minutes: number | null
  /** True when the text was relative ("tomorrow", "next Tuesday"). */
  relative: boolean
}

interface TimeHit {
  minutes: number
  start: number
  end: number
}

/** Pull a clock time out of the text ("3pm", "3:30 PM", "15:00", "at noon"). */
function extractTime(text: string): TimeHit | null {
  let m = /(?<![a-z0-9:])(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i.exec(text)
  if (m) {
    const h = Number(m[1])
    const mi = m[2] ? Number(m[2]) : 0
    if (h >= 1 && h <= 12 && mi < 60) {
      const pm = m[3].toLowerCase().startsWith('p')
      return { minutes: ((h % 12) + (pm ? 12 : 0)) * 60 + mi, start: m.index, end: m.index + m[0].length }
    }
  }
  m = /\b(noon|midday|midnight)\b/i.exec(text)
  if (m) return { minutes: m[1].toLowerCase() === 'midnight' ? 0 : 12 * 60, start: m.index, end: m.index + m[0].length }
  m = /(?<![\d:/.-])(\d{1,2}):(\d{2})(?::\d{2})?(?![\d:/])/.exec(text)
  if (m) {
    let h = Number(m[1])
    const mi = Number(m[2])
    if (h <= 23 && mi < 60) {
      // "3:30" with no am/pm: small hours are almost always afternoon.
      if (h >= 1 && h <= 6 && !/\b(?:morning|am)\b/i.test(text)) h += 12
      return { minutes: h * 60 + mi, start: m.index, end: m.index + m[0].length }
    }
  }
  m = /\b(?:at|@)\s*(\d{1,2})(?![\d:/.-])(?!\s*(?:st|nd|rd|th)\b)(?!\s+[a-z]+\s+(?:st|street|ave|avenue|rd|road|blvd)\b)/i.exec(text)
  if (m) {
    let h = Number(m[1])
    if (h >= 1 && h <= 12) {
      if (h <= 6 || /\b(?:afternoon|evening|tonight)\b/i.test(text)) h += 12
      if (/\bmorning\b/i.test(text) && h >= 12) h -= 12
      return { minutes: h * 60, start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

function monthFromWord(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '')
  if (w.length < 3) return -1
  if (w === 'sept') return 8
  for (let i = 0; i < 12; i++) if (MON_LONG[i].startsWith(w)) return i
  return -1
}

function makeDate(y: number, mo: number, d: number): Date | null {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1970 || y > 2100) return null
  const out = new Date(y, mo, d)
  return out.getMonth() === mo && out.getDate() === d ? out : null
}

/** Resolve a month/day with no year: the year that keeps it near the anchor (roll forward when clearly past). */
function resolveYearless(mo: number, d: number, anchor: Date): Date | null {
  const today = startOfDay(anchor)
  let out = makeDate(today.getFullYear(), mo, d)
  if (!out) return null
  if (out.getTime() < today.getTime() - 30 * DAY_MS) out = makeDate(today.getFullYear() + 1, mo, d)
  return out
}

function parseYear(s: string | undefined, fallback: number): number {
  if (!s) return fallback
  return s.length === 2 ? 2000 + Number(s) : Number(s)
}

const RELATIVE_WORDS = /\b(today|tonight|tomorrow|yesterday|next|this|coming|in \w+ (?:days?|weeks?)|end of|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i

interface DateHit {
  date: Date | null
  /** True when the phrase leans on "when it was said" (tomorrow, next week, Friday…). */
  relative: boolean
}

const absolute = (date: Date | null): DateHit => ({ date, relative: false })
const relative = (date: Date | null): DateHit => ({ date, relative: true })

function parseDatePart(s: string, anchor: Date): DateHit {
  const today = startOfDay(anchor)
  let m: RegExpExecArray | null

  // ISO 2026-09-12
  m = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s)
  if (m) return absolute(makeDate(Number(m[1]), Number(m[2]) - 1, Number(m[3])))

  // "Sep 12", "September 12th, 2026", "sept. 12"
  for (const hit of s.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4})\b)?/gi)) {
    const mo = monthFromWord(hit[1])
    if (mo < 0) continue
    return absolute(hit[3] ? makeDate(Number(hit[3]), mo, Number(hit[2])) : resolveYearless(mo, Number(hit[2]), anchor))
  }
  // "12 Sep", "12th of September 2026"
  for (const hit of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?\b(?:,?\s*(\d{4})\b)?/gi)) {
    const mo = monthFromWord(hit[2])
    if (mo < 0) continue
    return absolute(hit[3] ? makeDate(Number(hit[3]), mo, Number(hit[1])) : resolveYearless(mo, Number(hit[1]), anchor))
  }
  // 9/12, 9/12/26, 9-12-2026, 9.12.2026
  m = /(?<![\d/.-])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/.exec(s) ?? /(?<![\d/.-])(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})(?![\d/.-])/.exec(s)
  if (m) {
    let mo = Number(m[1]) - 1
    let d = Number(m[2])
    if (mo > 11 && d <= 12) [mo, d] = [d - 1, mo + 1] // day-first written form
    return absolute(m[3] ? makeDate(parseYear(m[3], today.getFullYear()), mo, d) : resolveYearless(mo, d, anchor))
  }

  // Relative phrases
  if (/\bday after tomorrow\b/i.test(s)) return relative(addDays(today, 2))
  if (/\b(today|tonight|this (?:morning|afternoon|evening))\b/i.test(s)) return relative(today)
  if (/\btomorrow\b/i.test(s)) return relative(addDays(today, 1))
  if (/\byesterday\b/i.test(s)) return relative(addDays(today, -1))
  m = /\bin\s+(\d{1,3}|[a-z]+)\s+(day|week)s?\b/i.exec(s)
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()]
    if (n !== undefined) return relative(addDays(today, n * (m[2].toLowerCase() === 'week' ? 7 : 1)))
  }
  if (/\bnext week\b/i.test(s)) return relative(addDays(today, 7))
  if (/\bnext month\b/i.test(s)) return relative(new Date(today.getFullYear(), today.getMonth() + 1, 1))
  if (/\bend of (?:the )?(?:this )?month\b/i.test(s)) return relative(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  if (/\bend of (?:the )?(?:this )?week\b/i.test(s)) return relative(addDays(today, (5 - today.getDay() + 7) % 7))
  m = /\b(next|this|coming)?\s*(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.exec(s)
  if (m) {
    const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[2].toLowerCase().slice(0, 3))
    let diff = (dow - today.getDay() + 7) % 7
    if (diff === 0 && m[1]?.toLowerCase() === 'next') diff = 7
    return relative(addDays(today, diff))
  }
  if (/\b(this|next)?\s*weekend\b/i.test(s)) {
    let diff = (6 - today.getDay() + 7) % 7
    if (/\bnext weekend\b/i.test(s) && diff < 7) diff += 7
    return relative(addDays(today, diff))
  }
  m = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(s)
  if (m) {
    const d = Number(m[1])
    let out = makeDate(today.getFullYear(), today.getMonth(), d)
    if (out && out.getTime() < today.getTime()) out = makeDate(today.getFullYear(), today.getMonth() + 1, d)
    return relative(out)
  }
  // Last resort: the shared loose parser.
  try {
    const d = parseLooseDate(s.trim().replace(/^(?:on|by|due|before|until|at)\s+/i, ''), anchor)
    return { date: isValidDate(d) ? startOfDay(d) : null, relative: RELATIVE_WORDS.test(s) }
  } catch {
    return absolute(null)
  }
}

/**
 * Parse loose schedule text into a local day plus optional clock time.
 * `anchor` is the day relative phrases count from (when the mail arrived).
 * Returns null when there is no usable date; never throws.
 */
export function parseScheduleText(text: string, anchor: Date): ParsedWhen | null {
  try {
    if (typeof text !== 'string' || !isValidDate(anchor)) return null
    const raw = text.replace(/\s+/g, ' ').trim()
    if (!raw || raw.length > 200) return null
    const time = extractTime(raw)
    let rest = raw
    if (time) rest = (raw.slice(0, time.start) + ' ' + raw.slice(time.end)).replace(/\b(?:at|@|from)\s*$/i, '')
    const hit = parseDatePart(rest, anchor)
    if (!hit.date) return null
    return { date: hit.date, minutes: time ? time.minutes : null, relative: hit.relative }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Title similarity
// ---------------------------------------------------------------------------

function tokens(title: string): Set<string> {
  const out = new Set<string>()
  for (const w of title.toLowerCase().split(/[^a-z0-9']+/)) {
    const t = w.replace(/'/g, '')
    if (t.length >= 2 && !STOPWORDS.has(t)) out.add(t)
  }
  return out
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Overlap coefficient of title tokens (shared / smaller set). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return normalizeTitle(a) === normalizeTitle(b) ? 1 : 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / Math.min(ta.size, tb.size)
}

function similarTitles(a: string, b: string): boolean {
  return titleSimilarity(a, b) >= TITLE_SIMILARITY
}

// ---------------------------------------------------------------------------
// Internal event model
// ---------------------------------------------------------------------------

interface Dated {
  event: ScheduleEvent
  day: Date
  dayNum: number
  minutes: number | null
  seen: number
  /** Every message this event was seen in (kept through merges). */
  ids: Set<string>
}

function toEvent(item: ScheduleItem, when: ParsedWhen): ScheduleEvent {
  const minutes = when.minutes ?? 9 * 60
  const at = new Date(when.date.getFullYear(), when.date.getMonth(), when.date.getDate(), Math.floor(minutes / 60), minutes % 60)
  const ev: ScheduleEvent = {
    title: item.title.replace(/\s+/g, ' ').trim().slice(0, 140),
    iso: localIso(at),
    time: when.minutes === null ? null : formatTime(when.minutes),
    source: item.source
  }
  if (item.sourceLabel) ev.sourceLabel = item.sourceLabel
  if (item.person) ev.person = item.person
  if (item.accountId) ev.accountId = item.accountId
  if (item.messageId) ev.messageId = item.messageId
  return ev
}

function dateItems(items: ScheduleItem[], now: Date): Dated[] {
  const out: Dated[] = []
  for (const item of items ?? []) {
    try {
      if (!item || typeof item.title !== 'string' || !item.title.trim() || typeof item.dateText !== 'string') continue
      const seen = safeDate(item.seenOn)
      // Relative phrases count from when the mail arrived; year-less dates lean on it too.
      const anchor = seen ?? now
      const when = parseScheduleText(item.dateText, anchor)
      if (!when) continue
      const ids = new Set(item.messageId ? [item.messageId] : [])
      out.push({ event: toEvent(item, when), day: when.date, dayNum: dayNumber(when.date), minutes: when.minutes, seen: seen ? seen.getTime() : now.getTime(), ids })
    } catch {
      /* skip garbage */
    }
  }
  return out
}

function isDuplicate(a: Dated, b: Dated): boolean {
  if (a.dayNum !== b.dayNum) return false
  const same = a.minutes === b.minutes
  let sameMessage = false
  for (const id of b.ids) if (a.ids.has(id)) sameMessage = true
  if (!same && !sameMessage) return false
  return similarTitles(a.event.title, b.event.title)
}

function merge(keep: Dated, other: Dated): Dated {
  // Prefer the timed one, then the longer title; fill in missing details from the other.
  let [k, o] = [keep, other]
  if (k.minutes === null && o.minutes !== null) [k, o] = [o, k]
  else if (k.minutes === o.minutes && o.event.title.length > k.event.title.length) [k, o] = [o, k]
  if (!k.event.person && o.event.person) k.event.person = o.event.person
  if (!k.event.sourceLabel && o.event.sourceLabel) k.event.sourceLabel = o.event.sourceLabel
  if (!k.event.accountId && o.event.accountId) k.event.accountId = o.event.accountId
  if (!k.event.messageId && o.event.messageId) k.event.messageId = o.event.messageId
  for (const id of o.ids) k.ids.add(id)
  return k
}

/** Collapse near-identical events: same day and (same time or same message) with similar titles. */
function dedupe(dated: Dated[]): Dated[] {
  const byDay = new Map<number, Dated[]>()
  for (const d of dated) {
    const bucket = byDay.get(d.dayNum)
    if (!bucket) byDay.set(d.dayNum, [d])
    else bucket.push(d)
  }
  const out: Dated[] = []
  for (const bucket of byDay.values()) {
    const kept: Dated[] = []
    for (const d of bucket) {
      const idx = kept.findIndex((k) => isDuplicate(k, d))
      if (idx < 0) kept.push(d)
      else kept[idx] = merge(kept[idx], d)
    }
    out.push(...kept)
  }
  return out
}

function compareEvents(a: Dated, b: Dated): number {
  if (a.dayNum !== b.dayNum) return a.dayNum - b.dayNum
  if ((a.minutes === null) !== (b.minutes === null)) return a.minutes === null ? -1 : 1
  if (a.minutes !== null && b.minutes !== null && a.minutes !== b.minutes) return a.minutes - b.minutes
  return a.event.title.localeCompare(b.event.title)
}

// ---------------------------------------------------------------------------
// Recurring patterns
// ---------------------------------------------------------------------------

interface PatternHit {
  pattern: RecurringPattern
  members: Dated[]
  minutes: number | null
}

function findPatterns(dated: Dated[], todayNum: number, horizonDays: number): PatternHit[] {
  const groups = new Map<string, Dated[]>()
  for (const d of dated) {
    if (d.dayNum < todayNum - PATTERN_LOOKBACK_DAYS || d.dayNum > todayNum + horizonDays) continue
    const key = `${normalizeTitle(d.event.title)}|${d.day.getDay()}`
    const g = groups.get(key)
    if (!g) groups.set(key, [d])
    else g.push(d)
  }
  const hits: PatternHit[] = []
  for (const g of groups.values()) {
    if (g.length < PATTERN_MIN_OCCURRENCES) continue
    const timed = g.filter((d) => d.minutes !== null).sort((a, b) => a.minutes! - b.minutes!)
    const untimed = g.filter((d) => d.minutes === null)
    let best: Dated[] = []
    // Widest window of timed entries whose times all sit within ±45 min of each other.
    let lo = 0
    for (let hi = 0; hi < timed.length; hi++) {
      while (timed[hi].minutes! - timed[lo].minutes! > PATTERN_TIME_SLACK * 2) lo++
      const window = timed.slice(lo, hi + 1)
      if (distinctDays(window) > distinctDays(best)) best = window
    }
    let members: Dated[]
    let minutes: number | null
    if (distinctDays(best) >= PATTERN_MIN_OCCURRENCES) {
      members = best
      minutes = best[Math.floor(best.length / 2)].minutes
    } else if (distinctDays(untimed) >= PATTERN_MIN_OCCURRENCES) {
      members = untimed
      minutes = null
    } else continue
    const weekday = members[0].day.getDay()
    const title = mostCommon(members.map((d) => d.event.title))
    const time = minutes === null ? null : formatTime(minutes)
    const occurrences = distinctDays(members)
    const description = time ? `Every ${DOW_LONG[weekday]} around ${time} — ${title}` : `Every ${DOW_LONG[weekday]} — ${title}`
    hits.push({ pattern: { title, weekday, time, occurrences, description }, members, minutes })
  }
  hits.sort((a, b) => b.pattern.occurrences - a.pattern.occurrences || a.pattern.weekday - b.pattern.weekday || a.pattern.title.localeCompare(b.pattern.title))
  return hits
}

function distinctDays(list: Dated[]): number {
  return new Set(list.map((d) => d.dayNum)).size
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  let best = values[0] ?? ''
  let bestN = 0
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (n > bestN) [best, bestN] = [v, n]
  }
  return best
}

/** The next calendar day on/after today with this weekday (today itself only if the time is still ahead). */
function nextOccurrence(hit: PatternHit, now: Date): Date {
  const today = startOfDay(now)
  let diff = (hit.pattern.weekday - today.getDay() + 7) % 7
  if (diff === 0 && hit.minutes !== null && hit.minutes <= now.getHours() * 60 + now.getMinutes()) diff = 7
  return addDays(today, diff)
}

function projectPattern(hit: PatternHit, now: Date, existing: Dated[]): Dated | null {
  const day = nextOccurrence(hit, now)
  const num = dayNumber(day)
  const already = existing.some(
    (d) => d.dayNum === num && similarTitles(d.event.title, hit.pattern.title) && (hit.minutes === null || d.minutes === null || Math.abs(d.minutes - hit.minutes) <= PATTERN_TIME_SLACK)
  )
  if (already) return null
  const latest = hit.members.reduce((a, b) => (b.dayNum > a.dayNum ? b : a))
  const source = mostCommon(hit.members.map((d) => d.event.source)) as ScheduleSource
  const minutes = hit.minutes ?? 9 * 60
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60)
  const event: ScheduleEvent = { title: hit.pattern.title, iso: localIso(at), time: hit.pattern.time, source }
  if (latest.event.sourceLabel) event.sourceLabel = latest.event.sourceLabel
  if (latest.event.person) event.person = latest.event.person
  if (latest.event.accountId) event.accountId = latest.event.accountId
  if (latest.event.messageId) event.messageId = latest.event.messageId
  return { event, day, dayNum: num, minutes: hit.minutes, seen: latest.seen, ids: new Set(latest.ids) }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function dayLabel(day: Date, todayNum: number): string {
  const off = dayNumber(day) - todayNum
  if (off === 0) return 'Today'
  if (off === 1) return 'Tomorrow'
  return `${DOW_SHORT[day.getDay()]} ${shortDate(day)}`
}

export function buildSchedule(items: ScheduleItem[], now: Date, opts: { horizonDays?: number } = {}): ScheduleResult {
  const empty: ScheduleResult = { days: [], recurring: [], conflicts: [], overdue: [], patterns: [], events: [] }
  try {
    if (!isValidDate(now)) return empty
    const horizonDays = Math.max(0, Math.floor(opts.horizonDays ?? 14)) || 0
    const todayNum = dayNumber(now)

    const dated = dedupe(dateItems(items, now))

    // Weekly habits, and the next time each one comes around.
    const hits = findPatterns(dated, todayNum, horizonDays)
    const habitual = new Set<Dated>()
    for (const hit of hits) {
      for (const m of hit.members) habitual.add(m)
      const projected = projectPattern(hit, now, dated)
      if (projected && projected.dayNum <= todayNum + horizonDays) dated.push(projected)
    }

    dated.sort(compareEvents)

    // Days in the horizon.
    const days: ScheduleDay[] = []
    const events: ScheduleEvent[] = []
    let current: ScheduleDay | null = null
    for (const d of dated) {
      if (d.dayNum < todayNum || d.dayNum > todayNum + horizonDays) continue
      const key = dayKey(d.day)
      if (!current || current.date !== key) {
        current = { date: key, label: dayLabel(d.day, todayNum), events: [] }
        days.push(current)
      }
      current.events.push(d.event)
      events.push(d.event)
    }

    // Overlaps: two timed events on one day within the hour.
    const conflicts: string[] = []
    const inHorizon = dated.filter((d) => d.dayNum >= todayNum && d.dayNum <= todayNum + horizonDays && d.minutes !== null)
    for (let i = 0; i < inHorizon.length; i++) {
      for (let j = i + 1; j < inHorizon.length && inHorizon[j].dayNum === inHorizon[i].dayNum; j++) {
        const a = inHorizon[i]
        const b = inHorizon[j]
        if (b.minutes! - a.minutes! > CONFLICT_MINUTES) break
        a.event.conflict = true
        b.event.conflict = true
        conflicts.push(`${dayLabel(a.day, todayNum)}: ${a.event.title} (${a.event.time}) overlaps ${b.event.title} (${b.event.time})`)
      }
    }

    // Things that already slipped past (the caller drops ones marked done). A weekly
    // habit's past visits happened; they are not overdue.
    const overdue: string[] = []
    for (const d of dated) {
      if (d.dayNum >= todayNum || d.dayNum < todayNum - OVERDUE_DAYS || habitual.has(d)) continue
      overdue.push(`Overdue: ${d.event.title} — was due ${shortDate(d.day)}`)
    }

    const patterns = hits.map((h) => h.pattern)
    return { days, recurring: patterns.map((p) => p.description), conflicts, overdue, patterns, events }
  } catch {
    return empty
  }
}

/** Short plain lines ("Tue Sep 9 — 6:00 pm Soccer practice") for briefs and speech. */
export function scheduleToLines(result: BriefSchedule, max = 12): string[] {
  const lines: string[] = []
  const limit = Math.max(0, Math.floor(max ?? 12)) || 0
  for (const day of result?.days ?? []) {
    for (const ev of day.events ?? []) {
      if (lines.length >= limit) return lines
      const who = ev.person ? ` (${ev.person})` : ''
      const when = ev.time ? `${ev.time} ` : ''
      lines.push(`${day.label} — ${when}${ev.title}${who}${ev.conflict ? ' ‼' : ''}`)
    }
  }
  return lines
}
