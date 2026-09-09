import type { StoredPerson } from '../db/repo'
import type { AccountConfig, Brief, Classification, MessageRecord } from '../../shared/types'

/**
 * Trusted helpers (v1.4, A2c): heads-ups. Six detectors over data the pipeline already produces,
 * each firing once per trigger key per seven days. Pure: the caller (src/main/helpers/index.ts)
 * supplies `lastSent` from the `meta` table and records sends afterwards.
 *
 * Heads-ups never include a message body. #1 and #2 name the sender and subject only.
 */

export interface Headsup {
  /** Stable key for the 7-day dedupe: `helper:sent:<triggerKey>` in meta. */
  triggerKey: string
  kind: 'sensitive' | 'pressure' | 'account' | 'quiet' | 'promise' | 'urgent' | 'scam'
  text: string
}

export interface FailingAccountLike {
  account: Pick<AccountConfig, 'id' | 'label' | 'email'>
  count: number
  error?: string
}

export interface HeadsupInput {
  /** The person's name as helpers see it. */
  person: string
  newClassifications: Classification[]
  /** The messages those classifications belong to (this run's new mail). */
  messages: MessageRecord[]
  people: StoredPerson[]
  brief: Brief | null
  failingAccounts: FailingAccountLike[]
  now: Date
  /** Issues created in this run (#6 fires only for those). */
  newIssueIds?: Set<string>
  /** When a trigger key last went out (ISO), or null. Missing = never sent. */
  lastSent?: (triggerKey: string) => string | null
}

export const HEADSUP_REPEAT_MS = 7 * 24 * 60 * 60 * 1000
export const helperSentKey = (triggerKey: string): string => `helper:sent:${triggerKey}`
export const helperDigestKey = (helperId: string): string => `helper:digest:${helperId}`

/** Payment or urgency pressure a stranger applies — the scam shape. */
export const PRESSURE = /gift card|wire|bitcoin|pay (now|today|immediately)|account (locked|suspended)|verify your (account|identity)/i
/** Mirrors `URGENT` in src/main/ai/builtin.ts (not exported there). */
export const URGENT = /\burgent\b|\basap\b|immediately|final notice|past due|action required|expiring|expires (today|tomorrow)|last chance to (sign|submit)/i

const normalize = (a: string): string => a.trim().toLowerCase()

/** Unknown to the person: not in their circle, or new, or only occasional. */
export function isStranger(address: string, people: StoredPerson[]): boolean {
  const a = normalize(address)
  if (!a) return true
  const p = people.find((x) => x.addresses.some((addr) => normalize(addr) === a))
  if (!p) return true
  return p.isNew || p.tier === 'occasional'
}

const senderName = (m: MessageRecord): string => m.fromName?.trim() || (m.fromAddress.split('@')[0] ?? 'someone')

export function cadenceWords(days: number | null): string {
  if (!days || days <= 0) return 'now and then'
  if (days < 2) return 'day'
  if (days < 5.5) return `${Math.round(days)} days`
  if (days < 10) return 'week'
  if (days < 24) return `${Math.round(days / 7)} weeks`
  if (days < 45) return 'month'
  return `${Math.round(days / 30)} months`
}

/** Sent within the last seven days? */
export function sentRecently(lastIso: string | null, now: Date): boolean {
  if (!lastIso) return false
  const t = new Date(lastIso).getTime()
  return Number.isFinite(t) && now.getTime() - t < HEADSUP_REPEAT_MS
}

export function detectHeadsups(input: HeadsupInput): Headsup[] {
  const { person, people, now } = input
  const out: Headsup[] = []
  const seen = new Set<string>()
  const add = (h: Headsup): void => {
    if (seen.has(h.triggerKey)) return
    if (input.lastSent && sentRecently(input.lastSent(h.triggerKey), now)) return
    seen.add(h.triggerKey)
    out.push(h)
  }
  const byId = new Map(input.messages.map((m) => [m.id, m]))

  // #0 scam guard (v1.6): a likely scam gets its own, more specific heads-up; #2 below skips those messages.
  const flagged = new Set<string>()
  for (const w of input.brief?.scamWarnings ?? []) {
    flagged.add(w.messageId)
    if (w.level !== 'likely') continue
    add({
      triggerKey: `scam:${w.messageId}`,
      kind: 'scam',
      text: `An email to ${person} looks like a scam ("${w.from.split(' <')[0]}", subject "${w.subject}"): ${w.reasons[0]} Please check with ${person} before they act on it.`
    })
  }

  // #1 sensitive request from a stranger · #2 pressure from a stranger
  for (const c of input.newClassifications) {
    const m = byId.get(c.messageId)
    if (!m || m.fromMe) continue
    const stranger = isStranger(m.fromAddress, people)
    if (!stranger) continue
    if (c.sensitivity.includes('personal_private')) {
      add({
        triggerKey: `sensitive:${m.id}`,
        kind: 'sensitive',
        text: `Someone ${person} doesn't usually hear from ("${senderName(m)}", subject "${m.subject}") asked for private details. Worth a phone call.`
      })
    }
    const probe = `${m.subject}\n${m.snippet}`
    if (!flagged.has(m.id) && (URGENT.test(probe) || PRESSURE.test(probe))) {
      add({
        triggerKey: `pressure:${m.id}`,
        kind: 'pressure',
        text: `An email from "${senderName(m)}" is pushing ${person} to pay or act fast. It looks like a scam. Please check with ${person}.`
      })
    }
  }

  // #3 an account keeps failing (from health data, so it works even without a brief)
  for (const f of input.failingAccounts) {
    const label = f.account.label || f.account.email
    add({
      triggerKey: `account:${f.account.id}`,
      kind: 'account',
      text: `InboxScout can't read ${person}'s ${label} email any more (it has failed ${f.count} times). ${person} may need a new app password; the app says how under Settings → Health.`
    })
  }

  // #4 inner circle gone quiet
  for (const p of people) {
    if (p.tier !== 'inner' || !p.goingQuiet) continue
    add({
      triggerKey: `quiet:${p.key}`,
      kind: 'quiet',
      text: `${person} usually hears from ${p.name} every ${cadenceWords(p.cadenceDays)}; it has been ${p.quietDays} days.`
    })
  }

  // #5 a promise is overdue · #6 something urgent, created in this run
  const brief = input.brief
  if (brief) {
    for (const pr of brief.promises ?? []) {
      if (!pr.overdue) continue
      add({ triggerKey: `promise:${pr.messageId}`, kind: 'promise', text: `${person} told ${pr.to} "${pr.text}" and the date has passed.` })
    }
    for (const i of brief.topIssues) {
      if (i.severity !== 'urgent' || !i.issueId || !input.newIssueIds?.has(i.issueId)) continue
      add({ triggerKey: `urgent:${i.issueId}`, kind: 'urgent', text: `${i.title} — ${i.nextStep}.` })
    }
  }
  return out
}
