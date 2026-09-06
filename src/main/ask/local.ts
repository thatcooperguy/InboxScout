import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { parseLooseDate } from '../reports/exports'
import { briefToSpeech } from '../../shared/speech'
import { redactText } from './redact'
import type { Answer, AskAction, AskSource, Brief, HealthReport, MessageRecord, PromiseLine, ScheduleEvent } from '../../shared/types'
// Reads attachments (v1.5): "what was in the pdf from Jane?"
import { attachmentsFor, searchAttachments } from '../attachments/index'
import type { StoredAttachment } from '../attachments/types'
import { recentMessageIdsWithAttachments } from '../pipeline/attachments'

/**
 * Conversation (v1.4, Part B): the local answerer. Always runs first and must return in < 2 s:
 * ordered intent rules over the question, FTS over mail, and lookups over the latest brief, issues,
 * people, schedule, and promises. Pure code, no network, Electron-free — the built-in engine of "Ask".
 *
 * Intents (first match wins, B2): wrote_back, owe, when_is, waiting, promises, tell, whats_new, from_x,
 * schedule_day, health, read, attachment (v1.5), then the FTS fallback (marked `unsure`).
 */

export interface LocalDeps {
  db: DB
  /** Health items, for "is anything wrong?". Optional: without it the answer says it cannot check. */
  healthStatus?: () => HealthReport | Promise<HealthReport>
  /** The previous answer's text, for "read it to me". */
  lastAnswer?: () => string | null
  /** Name used to sign drafts ("Best, Ann"). Empty = unsigned. */
  ownerName?: string
  now?: () => Date
}

export type AskIntent =
  | 'wrote_back'
  | 'owe'
  | 'when_is'
  | 'waiting'
  | 'promises'
  | 'tell'
  | 'whats_new'
  | 'from_x'
  | 'schedule_day'
  | 'health'
  | 'read'
  | 'attachment'
  | 'fallback'

// ---- Latest brief, cached per run (B6). ----
// The cache is keyed by the newest report id, which is a one-row indexed lookup, so a stale cache can never
// survive a finished run even if nobody calls invalidateAskCache(). Call it anyway on run:finished
// (ipc.ts does, inside the afterRun hook) to drop the parsed brief right away.

let briefCache: { reportId: string; brief: Brief; createdAt: string } | null = null

/** Forget the cached brief. Call after every finished run (see docs/ASK.md → Integration). */
export function invalidateAskCache(): void {
  briefCache = null
}

function latestBrief(db: DB): { brief: Brief; createdAt: string; reportId: string } | null {
  const head = db.prepare('SELECT id FROM reports ORDER BY created_at DESC LIMIT 1').get() as { id: string } | undefined
  if (!head) {
    briefCache = null
    return null
  }
  if (briefCache && briefCache.reportId === head.id) return briefCache
  const latest = repo.latestBrief(db)
  if (!latest) return null
  briefCache = { reportId: latest.reportId, brief: latest.brief as Brief, createdAt: latest.createdAt }
  return briefCache
}

// ---- Small helpers ----

const DAY_MS = 86400000
const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'is', 'was', 'thing', 'things', 'stuff', 'email', 'mail', 'about', 'for', 'of', 'to', 'in', 'on', 'at'])

const words = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/'s$/, ''))
const topicWords = (s: string): string[] => words(s).filter((w) => w.length > 1 && !STOP.has(w))
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)
const clip = (s: string, n: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`
}
const localDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "today" / "yesterday" / "Tuesday" (within a week) / "Sep 2". */
export function sayDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((dayStart - start) / DAY_MS)
  if (diff === 0) return 'today'
  if (diff === -1) return 'yesterday'
  if (diff === 1) return 'tomorrow'
  if (diff > -7 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const daysAgo = (iso: string, now: Date): number => Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / DAY_MS))
const sayAgo = (iso: string, now: Date): string => {
  const n = daysAgo(iso, now)
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}

function sourceOf(m: { id: string; subject: string; from_name?: string; fromName?: string; from_address?: string; fromAddress?: string; date: string }, now: Date): AskSource {
  const who = m.fromName ?? m.from_name ?? m.fromAddress ?? m.from_address ?? ''
  return { messageId: m.id, label: `${clip(m.subject || '(no subject)', 60)} · ${clip(who, 30)} · ${sayDate(m.date, now)}` }
}

function answer(text: string, extra: Partial<Answer> = {}): Answer {
  return { text: redactText(text), sources: [], actions: [], engine: 'local', unsure: false, ...extra }
}

/** A mailto: whose body is the person's own words, first person, signed like replyMailto does. */
export function wordsMailto(to: string, subject: string, counterpart: string, body: string, ownerName = ''): string {
  const firstName = (counterpart.split(/[\s<@]/)[0] || '').replace(/[^a-zA-Z'-]/g, '') || 'there'
  const text = `Hi ${firstName},\n\n${body.trim()}\n\nBest,\n${ownerName}`
  const params = new URLSearchParams({ subject: subject ? (/^re:/i.test(subject) ? subject : `Re: ${subject}`) : '', body: text })
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, '%20')}`
}

/** replyMailto from src/shared/mailto.ts, inlined so main never imports renderer-side helpers by accident. */
function replyMailto(to: string, subject: string, counterpart: string): string {
  const firstName = (counterpart.split(/[\s<@]/)[0] || '').replace(/[^a-zA-Z'-]/g, '') || 'there'
  const body = `Hi ${firstName},\n\nThanks for your note about "${subject}".\n\n\n\nBest,\n`
  const params = new URLSearchParams({ subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, body })
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, '%20')}`
}

// ---- Name resolution (B2): people.name / first token of an address, case-insensitive prefix, then senders by name ----

export interface Candidate {
  name: string
  address: string
  role?: string
}

export type Resolved = { kind: 'one'; person: Candidate } | { kind: 'many'; people: Candidate[] } | { kind: 'none' }

export function resolvePerson(db: DB, raw: string): Resolved {
  const wanted = raw.trim().toLowerCase().replace(/[?.!,]+$/, '').replace(/^(the|my|our|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/, '')
  if (!wanted) return { kind: 'none' }
  const tokens = wanted.split(/\s+/).filter(Boolean)
  const first = tokens[0]
  const matches = (name: string, address: string): boolean => {
    const n = name.toLowerCase()
    if (n === wanted || n.startsWith(wanted)) return true
    const parts = n.split(/[\s,]+/).filter(Boolean)
    if (tokens.length > 1) return tokens.every((t) => parts.some((p) => p.startsWith(t)))
    if (parts.some((p) => p.startsWith(first))) return true
    const local = address.toLowerCase().split('@')[0] ?? ''
    const localFirst = local.split(/[._-]/)[0] ?? ''
    return localFirst.length >= 2 && localFirst.startsWith(first)
  }
  const found: Candidate[] = []
  const seen = new Set<string>()
  const add = (c: Candidate): void => {
    const key = c.address.toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    found.push(c)
  }
  for (const p of repo.listPeople(db, 300)) {
    if (p.role === 'automated') continue
    const address = p.addresses[0] ?? ''
    if (matches(p.name, address) || p.addresses.some((a) => matches('', a))) add({ name: p.name || address, address, role: p.role })
  }
  if (found.length === 0) for (const s of repo.findSendersByName(db, first, 5)) if (matches(s.name, s.address)) add({ name: s.name, address: s.address })
  // An exact full-name match beats every prefix match ("Jane Park" when both Janes exist).
  const exact = found.filter((c) => c.name.toLowerCase() === wanted)
  if (exact.length === 1) return { kind: 'one', person: exact[0] }
  // Several addresses under the same name are one person (work + home); keep the best-scored one.
  const byName = new Map<string, Candidate>()
  for (const c of found) if (!byName.has(c.name.toLowerCase())) byName.set(c.name.toLowerCase(), c)
  const distinct = [...byName.values()]
  if (distinct.length === 0) return { kind: 'none' }
  if (distinct.length === 1) return { kind: 'one', person: distinct[0] }
  return { kind: 'many', people: distinct.slice(0, 2) }
}

/** "Which Jane — Jane Park or Jane Ruiz?" with two chips that re-ask the question with the full name. */
function whichOne(raw: string, people: Candidate[], question: string): Answer {
  const short = cap(raw.trim().replace(/[?.!,]+$/, ''))
  const [a, b] = people
  return answer(`Which ${short} — ${a.name} or ${b.name}?`, {
    actions: people.map((p) => ({
      kind: 'ask' as const,
      label: p.name,
      question: question.replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), p.name)
    }))
  })
}

// ---- Intent patterns (case-insensitive, first match wins) ----

const P = {
  wrote_back: /\bdid (?:the |my |our )?(.+?) (?:write|get|reply|respond|answer|call)\b/i,
  owe: /what do i owe|\bbills?\b|\bdue (?:this|next) (?:week|month)\b|how much/i,
  when_is: /^when(?:'s| is| was| does| will)?\s+(?:the |my |our |is )?(.+?)\??$/i,
  waiting: /who(?:'s| is| are| else is)? waiting|what do i (?:need to|have to|still need to) (?:reply|answer|respond)|who (?:do i owe|needs? (?:a |an )?(?:reply|answer))/i,
  promises: /what did i promise|did i (?:say|promise) i(?:'d| would| will)|what (?:did|have) i (?:say|said) i(?:'d| would)|my promises/i,
  tell: /^(?:tell|let|email|e-mail|write to|write|reply to|message|text|ask) (.+?)(?: know)?(?: that\b| i'?ll\b| i will\b| i'?m\b| i\b| to\b| we\b)(.*)$/i,
  whats_new: /what(?:'s| is) new|anything (?:important|urgent|new)|what needs me|what do i need to (?:do|know)|what(?:'s| is) (?:going on|happening)\s*\??$/i,
  from_x: /anything (?:new )?from (.+)|(?:emails?|mails?|messages?|news|word) from (.+)|did (.+?) (?:send|email|write) (?:me )?anything/i,
  schedule_day: /what(?:'s| is| do i have)?(?: on| happening| scheduled| up| planned)?(?: on| for)? (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week)\b/i,
  health: /is (?:anything|something) (?:wrong|broken|off)|why (?:didn'?t|hasn'?t|isn'?t|is not|won'?t|did not|has not)|is it working|are you (?:working|ok|okay)/i,
  read: /^(?:please )?read (?:it|that|this|the brief|my brief|my mail|it back)(?: to me| aloud| out loud| again)?\s*[.!?]*$|^say (?:it|that) again/i,
  // Reads attachments (v1.5): "what was in the pdf from Jane?", "what did the invoice say?", "show me the photo from Mom".
  attachment:
    /(?:what(?:'s| is| was| does| did)?|show(?: me)?|read(?: me)?|open|summari[sz]e)\s+(?:(?:is |was )?(?:in|inside|on) )?(?:the |that |this |my |her |his |their )?(?:(?:attached|latest|last|new) )?(pdf|attachment|attached file|file|photo|picture|scan|image|document|invoice|form|contract|statement|receipt|spreadsheet|bill)s?(?:\s+(?:say|show|says|showed|contain|contains|about|for))?(?:\s+(?:from|that|by)\s+(.+?))?\s*[?.!]*$/i
}

/** The file words the attachment intent understands, so a bare "what was in the file?" still routes. */
export const ATTACHMENT_WORDS = /\b(pdf|attachment|attached file|file|photo|picture|scan|image|document|invoice|form|contract|statement|receipt|spreadsheet|bill)s?\b/i

export function detectIntent(q: string): AskIntent {
  const s = q.trim()
  if (P.read.test(s)) return 'read'
  if (P.attachment.test(s) && ATTACHMENT_WORDS.test(s)) return 'attachment'
  if (P.wrote_back.test(s)) return 'wrote_back'
  if (P.owe.test(s)) return 'owe'
  if (P.schedule_day.test(s)) return 'schedule_day'
  if (P.when_is.test(s)) return 'when_is'
  if (P.waiting.test(s)) return 'waiting'
  if (P.promises.test(s)) return 'promises'
  if (P.tell.test(s)) return 'tell'
  if (P.whats_new.test(s)) return 'whats_new'
  if (P.from_x.test(s)) return 'from_x'
  if (P.health.test(s)) return 'health'
  return 'fallback'
}

// ---- The answerer ----

export async function answerLocally(deps: LocalDeps, question: string): Promise<Answer> {
  const q = String(question ?? '').trim().slice(0, 500)
  if (!q) return answer('Ask me something about your mail — for example "Who is waiting on me?"')
  const ctx: Ctx = { ...deps, now: deps.now ? deps.now() : new Date() }
  switch (detectIntent(q)) {
    case 'read':
      return readIt(ctx)
    case 'wrote_back':
      return wroteBack(ctx, q)
    case 'owe':
      return owe(ctx)
    case 'schedule_day':
      return scheduleDay(ctx, q)
    case 'when_is':
      return whenIs(ctx, q)
    case 'waiting':
      return waiting(ctx)
    case 'promises':
      return promises(ctx, q)
    case 'tell':
      return tell(ctx, q)
    case 'whats_new':
      return whatsNew(ctx)
    case 'from_x':
      return fromX(ctx, q)
    case 'health':
      return health(ctx)
    case 'attachment':
      return attachment(ctx, q)
    default:
      return fallback(ctx, q)
  }
}

type Ctx = Omit<LocalDeps, 'now'> & { now: Date }

function wroteBack(ctx: Ctx, q: string): Answer {
  const m = q.match(P.wrote_back)
  const raw = (m?.[1] ?? '').trim()
  const r = resolvePerson(ctx.db, raw)
  if (r.kind === 'many') return whichOne(raw, r.people, q)
  let person: Candidate | null = r.kind === 'one' ? r.person : null
  if (!person) {
    // "the dentist": no such name, so let the mail say who that is.
    const hit = repo.searchMessages(ctx.db, raw, 5).find((h) => h.from_address)
    if (hit) person = { name: hit.from_name || hit.from_address, address: hit.from_address }
  }
  if (!person) return answer(`I can't find anyone called "${raw}" in your mail.`, { unsure: true })
  const inbound = repo.latestInboundFrom(ctx.db, person.address)
  const sent = repo.latestSentTo(ctx.db, person.address)
  if (inbound && (!sent || inbound.date >= sent.date)) {
    return answer(`Yes — ${person.name} wrote ${sayDate(inbound.date, ctx.now)}: "${clip(inbound.snippet || inbound.subject, 120)}"`, {
      sources: [sourceOf(inbound, ctx.now)],
      actions: [{ kind: 'open_message', messageId: inbound.id, label: 'Open it' }]
    })
  }
  if (sent) {
    const waitingLine = (latestBrief(ctx.db)?.brief.waitingOnThem ?? []).find((w) => w.toLowerCase().includes(person!.name.toLowerCase().split(' ')[0]))
    return answer(`Not yet. You wrote to ${person.name} ${sayAgo(sent.date, ctx.now)}${waitingLine ? ` — "${clip(sent.subject, 60)}" is still waiting on them.` : '.'}`, {
      sources: [sourceOf(sent, ctx.now)]
    })
  }
  return answer(`Not yet — I can't see any mail between you and ${person.name}.`, { unsure: true })
}

const amountOf = (s: string): number | null => {
  const m = s.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

function owe(ctx: Ctx): Answer {
  const latest = latestBrief(ctx.db)
  const lines: string[] = []
  const sources: AskSource[] = []
  const seen = new Set<string>()
  const push = (line: string): void => {
    const key = line.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    lines.push(line)
  }
  for (const s of latest?.brief.skillSections ?? []) if (s.skillId === 'bills' || /bill/i.test(s.title)) for (const l of s.lines) push(l)
  for (const i of repo.listIssues(ctx.db, true)) {
    const text = `${i.title}${i.ownerAction ? ` — ${i.ownerAction}` : ''}`
    if (/\$\s?\d/.test(text)) push(`${text}${i.deadline ? ` (${i.deadline})` : ''}`)
  }
  for (const day of latest?.brief.schedule?.days ?? []) {
    for (const e of day.events) {
      if (!/bill|payment|invoice/i.test(`${e.sourceLabel ?? ''} ${e.title}`)) continue
      push(`${e.title} — ${day.label}${e.time ? ` ${e.time}` : ''}`)
      if (e.messageId) sources.push({ messageId: e.messageId, label: `${clip(e.title, 60)} · ${day.label}` })
    }
  }
  if (lines.length === 0) return answer('Nothing due that I can see.', { unsure: !latest })
  const amounts = lines.map(amountOf)
  const total = amounts.every((a) => a !== null) ? amounts.reduce((n, a) => n + (a ?? 0), 0) : null
  const shown = lines.slice(0, 8)
  return answer(
    `Here is what looks due:\n${shown.map((l) => `• ${l}`).join('\n')}${lines.length > 8 ? `\n…and ${lines.length - 8} more` : ''}${total !== null ? `\nTotal: $${total.toFixed(2).replace(/\.00$/, '')}` : ''}`,
    { sources: sources.slice(0, 3) }
  )
}

function eventLine(e: ScheduleEvent, dayLabel?: string): string {
  return `${e.conflict ? '‼ ' : ''}${e.title}: ${dayLabel ? `${dayLabel}${e.time ? ` at ${e.time}` : ''}` : e.time ?? 'all day'}${e.person ? ` (${e.person})` : ''}${e.conflict ? ' — overlaps another event' : ''}`
}

function whenIs(ctx: Ctx, q: string): Answer {
  const raw = (q.match(P.when_is)?.[1] ?? '').trim()
  const topic = topicWords(raw)
  const latest = latestBrief(ctx.db)
  if (topic.length > 0) {
    for (const day of latest?.brief.schedule?.days ?? []) {
      for (const e of day.events) {
        const hay = `${e.title} ${e.person ?? ''} ${e.sourceLabel ?? ''}`.toLowerCase()
        if (!topic.some((t) => hay.includes(t))) continue
        const label = new Date(e.iso).toLocaleDateString(undefined, { weekday: 'long' })
        const src = e.messageId ? repo.getMessages(ctx.db, [e.messageId])[0] : null
        const from = src ? ` (from ${src.fromName || src.fromAddress}'s email of ${sayDate(src.date, ctx.now)})` : e.person ? ` (${e.person})` : ''
        return answer(`${e.title}: ${day.label === 'Today' || day.label === 'Tomorrow' ? day.label : label}${e.time ? ` at ${e.time}` : ''}${from}.`, {
          sources: src ? [sourceOf(src, ctx.now)] : e.messageId ? [{ messageId: e.messageId, label: e.title }] : []
        })
      }
    }
  }
  // Not on the schedule: look in the mail itself for a date near the words.
  const hits = repo.searchMessages(ctx.db, raw || q, 5)
  for (const h of hits) {
    const msg = repo.getMessages(ctx.db, [h.id])[0]
    if (!msg) continue
    const text = `${msg.subject}\n${msg.bodyText || msg.snippet}`.slice(0, 4000)
    const found = text.match(DATE_PATTERN)
    if (!found) continue
    const d = parseLooseDate(found[0], new Date(msg.date))
    const when = d ? `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}` : found[0]
    const time = text.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i)?.[0]
    return answer(`${clip(msg.subject, 60)}: ${when}${time ? ` at ${time}` : ''} (from ${msg.fromName || msg.fromAddress}, ${sayDate(msg.date, ctx.now)}).`, {
      sources: [sourceOf(msg, ctx.now)],
      actions: [{ kind: 'open_message', messageId: msg.id, label: 'Open it' }],
      unsure: true
    })
  }
  if (hits.length > 0) return fallback(ctx, raw || q)
  return answer(`I can't find a date for "${raw || q}".`, { unsure: true })
}

const DATE_PATTERN =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\btomorrow\b|\bnext (?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i

function waiting(ctx: Ctx): Answer {
  const brief = latestBrief(ctx.db)?.brief
  if (!brief) return answer('No brief yet. Press Check my email first.', { actions: [{ kind: 'go_to', tab: 'today', label: 'Go to Today' }] })
  const details = brief.waitingOnYouDetails?.length ? brief.waitingOnYouDetails : brief.waitingOnYou.map((s) => ({ subject: s, counterpart: '', address: '' }))
  if (details.length === 0) return answer('Nobody is waiting on you right now.')
  const shown = details.slice(0, 5)
  const actions: AskAction[] = shown
    .filter((w) => w.address)
    .map((w) => ({ kind: 'open_draft' as const, mailto: replyMailto(w.address, w.subject, w.counterpart), label: `Draft reply to ${w.counterpart.split(/[\s<@]/)[0] || w.counterpart}` }))
  return answer(
    `${details.length === 1 ? 'One person is' : `${details.length} people are`} waiting on you:\n${shown.map((w) => `• ${w.counterpart ? `${w.counterpart} — ` : ''}${w.subject}`).join('\n')}${details.length > 5 ? `\n…and ${details.length - 5} more` : ''}`,
    { actions }
  )
}

function promises(ctx: Ctx, q: string): Answer {
  const brief = latestBrief(ctx.db)?.brief
  const all: PromiseLine[] = brief?.promises ?? []
  const nameMatch = q.match(/(?:promise|promised|tell|told)\s+(?:to\s+)?([A-Za-z][\w'-]*)\s*\??$/i)
  const name = nameMatch && !/^(?:that|to|i|about)$/i.test(nameMatch[1]) ? nameMatch[1].toLowerCase() : ''
  let list = name ? all.filter((p) => p.to.toLowerCase().includes(name) || p.address.toLowerCase().includes(name)) : all
  list = [...list].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due ?? '9').localeCompare(b.due ?? '9'))
  if (list.length === 0) return answer(name ? `I can't see anything you promised ${cap(name)}.` : brief ? 'No open promises that I can see.' : 'No brief yet. Press Check my email first.', { unsure: !brief })
  const shown = list.slice(0, 5)
  const line = (p: PromiseLine): string => `You told ${p.to} "${p.text}" ${sayDate(p.madeOn, ctx.now)}${p.due ? ` — due ${sayDate(p.due, ctx.now)}` : ''}${p.overdue ? ' — overdue' : ''}.`
  return answer(shown.length === 1 ? line(shown[0]) : shown.map((p) => `• ${line(p)}`).join('\n'), {
    sources: shown.map((p) => ({ messageId: p.messageId, label: `${clip(p.subject, 60)} · to ${p.to} · ${sayDate(p.madeOn, ctx.now)}` })),
    actions: shown.filter((p) => p.address).map((p) => ({ kind: 'open_draft' as const, mailto: replyMailto(p.address, p.subject, p.to), label: `Follow up with ${p.to.split(/[\s<@]/)[0]}` }))
  })
}

function tell(ctx: Ctx, q: string): Answer {
  const m = q.match(P.tell)
  if (!m) return fallback(ctx, q)
  const raw = m[1].trim()
  // The words after the name, in the person's own voice: "that the roof is fixed" → "The roof is fixed"; "I'll sign it Friday" stays.
  const afterName = q.slice(q.toLowerCase().indexOf(raw.toLowerCase()) + raw.length).replace(/^\s+know\b/i, '').trim()
  let body = afterName.replace(/^that\s+/i, '').trim()
  if (/^to\s+/i.test(body)) body = body.replace(/^to\s+/i, 'Could you ')
  body = cap(body).replace(/\s+/g, ' ').replace(/[.!?]*$/, '.')
  if (!body || body === '.') return answer(`What should I tell ${cap(raw)}? Say it like "Tell ${cap(raw)} I'll call on Friday."`)
  const r = resolvePerson(ctx.db, raw)
  if (r.kind === 'many') return whichOne(raw, r.people, q)
  if (r.kind === 'none') return answer(`I don't know anyone called "${cap(raw)}". Try their full name, or write to them from your mail app.`, { unsure: true })
  const person = r.person
  const thread = repo.latestInboundFrom(ctx.db, person.address) ?? repo.latestSentTo(ctx.db, person.address)
  const subject = thread?.subject ?? ''
  const mailto = wordsMailto(person.address, subject, person.name, body, ctx.ownerName ?? '')
  const first = person.name.split(/[\s<@]/)[0] || person.name
  return answer(`I opened a draft to ${first}. Read it, then press Send in your mail app.`, {
    sources: thread ? [sourceOf(thread, ctx.now)] : [],
    actions: [{ kind: 'open_draft', mailto, label: `Open the draft to ${first}`, auto: true }]
  })
}

function whatsNew(ctx: Ctx): Answer {
  const latest = latestBrief(ctx.db)
  if (!latest) return answer('No brief yet. Press Check my email first.', { actions: [{ kind: 'go_to', tab: 'today', label: 'Go to Today' }] })
  return answer(briefToSpeech(latest.brief, { short: true }), { actions: [{ kind: 'go_to', tab: 'today', label: 'Show Today' }] })
}

function fromX(ctx: Ctx, q: string): Answer {
  const m = q.match(P.from_x)
  const raw = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim().replace(/[?.!]+$/, '').replace(/^(?:the|my|our)\s+/i, '')
  if (!raw) return fallback(ctx, q)
  const r = resolvePerson(ctx.db, raw)
  if (r.kind === 'many') return whichOne(raw, r.people, q)
  let hits: MessageRecord[] = []
  let who = cap(raw)
  if (r.kind === 'one') {
    who = r.person.name
    hits = repo.searchMessagesFrom(ctx.db, r.person.address, 3)
  }
  if (hits.length === 0) hits = repo.searchMessagesFrom(ctx.db, raw, 3)
  if (hits.length === 0) {
    const fts = repo.searchMessages(ctx.db, raw, 3)
    hits = repo.getMessages(ctx.db, fts.map((h) => h.id)).sort((a, b) => b.date.localeCompare(a.date))
  }
  if (hits.length === 0) return answer(`Nothing from ${who} that I can see.`, { unsure: true })
  const sensitive = new Set(repo.getClassifications(ctx.db, hits.map((h) => h.id)).filter((c) => c.sensitivity.length > 0).map((c) => c.messageId))
  const lines = hits.map((h) => `• ${sayDate(h.date, ctx.now)} — ${clip(h.subject || '(no subject)', 70)}${sensitive.has(h.id) ? '' : h.snippet ? `: ${clip(h.snippet, 100)}` : ''}`)
  const note = sensitive.size > 0 ? `\n${sensitive.size === 1 ? 'One of these contains' : 'Some of these contain'} private details — open it to read.` : ''
  return answer(`${hits.length === 1 ? 'The latest' : `The latest ${hits.length}`} from ${who}:\n${lines.join('\n')}${note}`, {
    sources: hits.map((h) => sourceOf(h, ctx.now)),
    actions: hits.slice(0, 1).map((h) => ({ kind: 'open_message' as const, messageId: h.id, label: 'Open the latest' }))
  })
}

function scheduleDay(ctx: Ctx, q: string): Answer {
  const which = (q.match(P.schedule_day)?.[1] ?? 'today').toLowerCase()
  const latest = latestBrief(ctx.db)
  const schedule = latest?.brief.schedule
  if (!latest) return answer('No brief yet. Press Check my email first.', { actions: [{ kind: 'go_to', tab: 'today', label: 'Go to Today' }] })
  const today = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate())
  let days = schedule?.days ?? []
  let label = which
  if (which === 'this week' || which === 'next week') {
    const from = which === 'this week' ? today : new Date(today.getTime() + (7 - today.getDay()) * DAY_MS)
    const to = new Date(from.getTime() + 7 * DAY_MS)
    days = days.filter((d) => new Date(`${d.date}T12:00:00`) >= from && new Date(`${d.date}T12:00:00`) < to)
  } else {
    const target = parseLooseDate(which, ctx.now)
    const iso = target ? localDate(target) : ''
    days = days.filter((d) => d.date === iso || d.label.toLowerCase() === which)
    label = which === 'today' || which === 'tomorrow' ? which : cap(which)
  }
  const events = days.flatMap((d) => d.events.map((e) => ({ e, day: d })))
  if (events.length === 0) return answer(`Nothing on ${label} that I can see.`, { unsure: !schedule })
  const lines = events.slice(0, 8).map(({ e, day }) => `• ${eventLine(e, days.length > 1 ? day.label : undefined)}`)
  const overlaps = (schedule?.conflicts ?? []).filter((c) => events.some(({ e }) => c.toLowerCase().includes(e.title.toLowerCase().slice(0, 20))))
  return answer(`${cap(label)}:\n${lines.join('\n')}${events.length > 8 ? `\n…and ${events.length - 8} more` : ''}${overlaps.length ? `\n${overlaps.join('\n')}` : ''}`, {
    sources: events.filter(({ e }) => e.messageId).slice(0, 3).map(({ e, day }) => ({ messageId: e.messageId, label: `${clip(e.title, 60)} · ${day.label}` })),
    actions: [{ kind: 'go_to', tab: 'today', label: 'Show the week' }]
  })
}

async function health(ctx: Ctx): Promise<Answer> {
  if (!ctx.healthStatus) return answer("I can't check that from here. Open Settings → Health on the computer.", { unsure: true })
  let report: HealthReport
  try {
    report = await ctx.healthStatus()
  } catch {
    return answer("I couldn't run the checks just now. Open Settings → Health.", { unsure: true })
  }
  const wrong = report.items.filter((i) => i.status !== 'ok')
  if (wrong.length === 0) return answer('Everything is working.')
  const fixed = wrong.filter((i) => i.status === 'fixed')
  const still = wrong.filter((i) => i.status !== 'fixed')
  const parts: string[] = []
  if (still.length) parts.push(still.map((i) => `• ${i.title}: ${i.detail}`).join('\n'))
  if (fixed.length) parts.push(`Fixed on its own: ${fixed.map((i) => i.fixedBy || i.title).join('; ')}.`)
  return answer(parts.join('\n'), { actions: [{ kind: 'go_to', tab: 'setup', label: 'Open Setup' }] })
}

// ---- Reads attachments (v1.5): what was in the file ----

/** Attachments that were actually read, newest message first. */
function readableAttachments(db: DB, messageId: string): StoredAttachment[] {
  try {
    return attachmentsFor(db, messageId).filter((a) => a.status === 'done' && (a.summary || a.text))
  } catch {
    return []
  }
}

function attachmentLine(a: StoredAttachment): string {
  const facts: string[] = []
  if (a.facts?.amounts?.length) facts.push(`amounts: ${a.facts.amounts.slice(0, 3).join(', ')}`)
  if (a.facts?.dates?.length) facts.push(`dates: ${a.facts.dates.slice(0, 3).join(', ')}`)
  const summary = clip(a.summary || a.text || '', 220)
  return `${a.filename}: ${summary}${facts.length ? ` (${facts.join('; ')})` : ''}`
}

function attachment(ctx: Ctx, q: string): Answer {
  const m = q.match(P.attachment)
  const kind = (m?.[1] ?? 'file').toLowerCase()
  const raw = (m?.[2] ?? '').trim().replace(/[?.!]+$/, '').replace(/^(?:the|my|our)\s+/i, '')
  // The file kind narrows the list when the person named one ("the invoice", "the photo").
  const kindMatches = (a: StoredAttachment): boolean => {
    if (/^(?:attachment|attached file|file|document)$/.test(kind)) return true
    if (/^(?:photo|picture|image|scan)$/.test(kind)) return a.kind === 'image' || /photo|screenshot|scan/i.test(a.facts?.documentType ?? '')
    if (kind === 'pdf') return /pdf/i.test(a.contentType) || /\.pdf$/i.test(a.filename)
    if (kind === 'spreadsheet') return /sheet|excel|csv/i.test(a.contentType) || /\.(xlsx?|csv)$/i.test(a.filename)
    const type = a.facts?.documentType ?? ''
    return new RegExp(kind === 'bill' ? 'invoice|bill|statement' : kind, 'i').test(`${type} ${a.filename} ${a.summary ?? ''}`)
  }
  let candidateIds: string[] = []
  let who = ''
  if (raw) {
    const r = resolvePerson(ctx.db, raw)
    if (r.kind === 'many') return whichOne(raw, r.people, q)
    if (r.kind === 'one') {
      who = r.person.name
      candidateIds = repo.searchMessagesFrom(ctx.db, r.person.address, 15).map((h) => h.id)
    }
    if (candidateIds.length === 0) candidateIds = repo.searchMessagesFrom(ctx.db, raw, 15).map((h) => h.id)
    if (candidateIds.length === 0) {
      // Not a person: maybe a topic ("the invoice from the roof job") — search the file text itself.
      try {
        candidateIds = searchAttachments(ctx.db, raw, 10).map((h) => h.attachment.messageId)
      } catch {
        candidateIds = []
      }
    }
  } else {
    candidateIds = recentMessageIdsWithAttachments(ctx.db, 20)
  }
  const seen = new Set<string>()
  for (const id of candidateIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const files = readableAttachments(ctx.db, id)
    const matching = files.filter(kindMatches)
    const chosen = matching.length ? matching : []
    if (chosen.length === 0) continue
    const msg = repo.getMessages(ctx.db, [id])[0]
    if (!msg) continue
    const from = who || msg.fromName || msg.fromAddress
    const lines = chosen.slice(0, 3).map(attachmentLine)
    const sensitive = repo.getClassifications(ctx.db, [id]).some((c) => c.sensitivity.length > 0)
    const head = `${chosen.length === 1 ? `The ${kind === 'file' ? 'attachment' : kind}` : `${chosen.length} files`} from ${from} (${sayDate(msg.date, ctx.now)}, "${clip(msg.subject || '(no subject)', 60)}"):`
    return answer(`${head}\n${lines.map((l) => `• ${l}`).join('\n')}${sensitive ? '\nThis one looks private — open it to read the details.' : ''}`, {
      sources: [sourceOf(msg, ctx.now)],
      actions: [{ kind: 'open_message', messageId: msg.id, label: 'Open it' }]
    })
  }
  if (raw && !who && candidateIds.length === 0) return answer(`I can't find a ${kind === 'file' ? 'file' : kind} from "${cap(raw)}".`, { unsure: true })
  return answer(who ? `I can't see a ${kind === 'file' ? 'file' : kind} from ${who} that I have read.` : `I can't see a ${kind === 'file' ? 'file' : kind} I have read yet.`, { unsure: true })
}

function readIt(ctx: Ctx): Answer {
  const last = ctx.lastAnswer?.() ?? null
  const latest = last ? null : latestBrief(ctx.db)
  const text = last ?? (latest ? briefToSpeech(latest.brief, { short: true }) : 'There is nothing to read yet. Press Check my email first.')
  return answer(text, { actions: [{ kind: 'speak', text, label: 'Read it', auto: true }] })
}

function fallback(ctx: Ctx, q: string): Answer {
  const hits = repo.searchMessages(ctx.db, q, 5)
  if (hits.length === 0) return answer(`I couldn't find anything about "${clip(q, 60)}".`, { unsure: true })
  // "Summarise what happened with…" reads best as a timeline: oldest first.
  const timeline = /summar|what happened|history|timeline/i.test(q)
  const ordered = timeline ? [...hits].sort((a, b) => String(a.date).localeCompare(String(b.date))) : hits
  const lines = ordered.map((h) => `• ${clip(h.subject || '(no subject)', 70)} — ${h.from_name || h.from_address} — ${sayDate(h.date, ctx.now)}${h.snippet ? `: ${clip(h.snippet, 160)}` : ''}`)
  return answer(`Here is what I found about "${clip(q, 60)}":\n${lines.join('\n')}`, {
    sources: ordered.map((h) => sourceOf(h, ctx.now)),
    actions: ordered.slice(0, 1).map((h) => ({ kind: 'open_message' as const, messageId: h.id, label: 'Open the first one' })),
    unsure: true
  })
}
