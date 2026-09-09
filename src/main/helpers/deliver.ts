import { randomUUID } from 'node:crypto'
import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { loadSettings } from '../settings'
import { inferOwnerName } from '../people/engine'
import { pickOutbox, sendMail, smsAddress } from '../delivery/email'
import { shortReason } from '../health/checks'
import type { SecretsLike } from '../signins'
import type { AccountConfig, Brief, Helper, HelperLevel, HelperSend } from '../../shared/types'
import type { Headsup } from './headsups'

/**
 * Trusted helpers (v1.4, Part A): what goes to a helper and how it gets there.
 *
 * The compose functions are pure and tested: they build the exact plain text a helper receives.
 * They never see email bodies — only titles, next steps, dates, sender names, and subjects — and
 * every message ends by saying who set it up and that the person can stop it.
 *
 * `sendToHelper` writes the sent log (`helper_sends`) before it returns, tries email then SMS
 * through the person's own outbox account, and never throws: a helper problem must never cost
 * the person their brief.
 *
 * "Ask for help" waits in a pending queue for ten seconds with a visible Cancel — the undo-send
 * pattern — because there is no unsend for email.
 */

export type SendFn = (outbox: AccountConfig, password: string, to: string, subject: string, html: string | undefined, text: string) => Promise<void>

export interface HelperDeps {
  db: DB
  secrets: SecretsLike
  now?: () => Date
  /** Replaces nodemailer (tests). */
  send?: SendFn
  log?: (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void
  /** How long Ask for help waits before sending. Default 10 000 ms. */
  askDelayMs?: number
  /** The person's name as helpers see it; inferred from their sent mail when not given. */
  personName?: string
}

/** Mirrors `accountSecretName` in src/main/secrets.ts (not imported: that module pulls in Electron, and this one must stay testable). */
const accountSecretName = (accountId: string): string => `account:${accountId}`

export const ASK_DELAY_MS = 10_000
export const SMS_MAX = 150
export const NO_OUTBOX_ERROR = 'No account can send mail. Add a Gmail, Yahoo, or iCloud account with an app password (it becomes the outbox).'

export interface Composed {
  subject: string
  text: string
  html: string
}

// ---- Small helpers ----

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** Plain text → the simplest possible HTML (paragraphs and line breaks), so the two never disagree. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

/** Pure: the first `max` characters for a text message, one line, with an ellipsis when cut. */
export function smsClip(text: string, max = SMS_MAX): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** The whole text message: a clipped body plus the footer that says where replies work. */
export function smsBody(text: string): string {
  return `${smsClip(text, 120)} Reply by email, not text.`
}

const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

function footer(person: string, channel: 'email' | 'digest' = 'email'): string {
  const lines = [
    `Reply to this email to send ${person} a note back — it lands in their inbox and on their InboxScout screen.`,
    `You are getting this because ${person} added you as a trusted helper. ${person} can stop it any time.`
  ]
  if (channel === 'digest') lines.unshift(`If this stops arriving, ${possessive(person)} computer is probably off.`)
  return lines.join('\n')
}

const finish = (subject: string, text: string): Composed => ({ subject, text: text.trim(), html: textToHtml(text) })

// ---- Compose (pure) ----

export interface AskInput {
  person: string
  helper: Pick<Helper, 'name'>
  title: string
  nextStep?: string
  whyNow?: string
  note?: string
}

/** The "Ask for help" message: title, next step, why now, and the person's own note — never the email. */
export function composeAsk(input: AskInput): Composed {
  const { person } = input
  const lines = [`${person} asked InboxScout to send you this.`, '', `What: ${input.title.trim()}`]
  if (input.nextStep?.trim()) lines.push(`Next step: ${input.nextStep.trim()}`)
  if (input.whyNow?.trim()) lines.push(`Why now: ${input.whyNow.trim()}`)
  if (input.note?.trim()) lines.push(`${possessive(person)} note: ${input.note.trim()}`)
  lines.push('', footer(person))
  return finish(`${person} needs a hand: ${input.title.trim()}`, lines.join('\n'))
}

export interface DigestInput {
  person: string
  helper: Pick<Helper, 'name' | 'level'>
  brief: Brief
  /** The rendered brief for the `all` level (the same thing "Email me my brief" sends). Falls back to a plain rendering. */
  markdown?: string
}

/** What a quiet week says, per level (`all` keeps the brief's own headline). */
export function quietDigestText(level: HelperLevel, person: string): string {
  if (level === 'schedule') return `No appointments coming up for ${person} this week.`
  return `All fine. Nothing needed ${person} this week.`
}

function scheduleLines(brief: Brief): string[] {
  const out: string[] = []
  const s = brief.schedule
  if (!s) return out
  for (const o of s.overdue) out.push(`Already passed: ${o}`)
  for (const d of s.days) {
    for (const e of d.events) out.push(`${d.label}${e.time ? ` ${e.time}` : ''} — ${e.title}${e.sourceLabel ? ` (${e.sourceLabel})` : ''}`)
  }
  return out
}

/** The recurring digest. Null for `ask` helpers (they only hear from the person directly). */
export function composeDigest(input: DigestInput): Composed | null {
  const { person, brief } = input
  const level = input.helper.level
  if (level === 'ask') return null
  const subject = `How ${possessive(person)} week looks`
  const body: string[] = []
  if (level === 'schedule') {
    const lines = scheduleLines(brief)
    body.push(`Here is what ${person} has coming up this week.`, '')
    body.push(...(lines.length ? lines.map((l) => `- ${l}`) : [quietDigestText(level, person)]))
  } else if (level === 'needs') {
    const issues = brief.topIssues
    if (issues.length) {
      body.push(`Here is what needs ${person} right now.`, '')
      for (const i of issues) body.push(`- ${i.title}${i.nextStep ? ` — next step: ${i.nextStep}` : ''}`)
    } else {
      body.push(quietDigestText(level, person))
    }
  } else {
    // all: the normal brief. Its own headline already says "You're all caught up" when quiet.
    if (input.markdown?.trim()) body.push(input.markdown.trim())
    else body.push(...plainBrief(brief))
  }
  body.push('', footer(person, 'digest'))
  return finish(subject, body.join('\n'))
}

/** A plain-text brief for helpers at `all` when no rendered markdown is at hand. */
function plainBrief(brief: Brief): string[] {
  const out: string[] = [brief.headline, '']
  const section = (title: string, lines: string[]): void => {
    if (!lines.length) return
    out.push(`${title}:`, ...lines.map((l) => `- ${l}`), '')
  }
  section('Looks like a scam', (brief.scamWarnings ?? []).map((w) => `"${w.subject}" from ${w.from} — ${w.reasons[0]} ${w.advice}`))
  section('Needs you', brief.topIssues.map((i) => `${i.title}${i.nextStep ? ` — ${i.nextStep}` : ''}`))
  section('Waiting on a reply', brief.waitingOnYou)
  section('Coming up', scheduleLines(brief).length ? scheduleLines(brief) : brief.deadlines)
  section('Promises made', (brief.promises ?? []).map((p) => `To ${p.to}: "${p.text}"${p.overdue ? ' (date has passed)' : ''}`))
  for (const s of brief.skillSections ?? []) section(s.title, s.lines)
  section('Personal', brief.personal)
  section('Private or confidential mail spotted', brief.sensitiveNotices)
  return out
}

export interface ComposedHeadsup extends Composed {
  triggerKey: string
}

/** One message per heads-up: the trigger line, then the footer. Never a message body. */
export function composeHeadsups(person: string, headsups: Headsup[]): ComposedHeadsup[] {
  return headsups.map((h) => ({ ...finish(`Heads-up about ${person}`, `${h.text}\n\n${footer(person)}`), triggerKey: h.triggerKey }))
}

/** What each level means, in the hello message and the level picker. */
export function levelWords(level: HelperLevel, person: string): string {
  switch (level) {
    case 'ask':
      return `a note only when ${person} presses Ask for help`
    case 'schedule':
      return `${possessive(person)} appointments and dates for the week`
    case 'needs':
      return `what needs ${person}, plus a heads-up about scams, a broken email account, or someone who has gone quiet`
    default:
      return `${possessive(person)} full brief, the same one ${person} gets`
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The one hello message a helper gets when added: what they will get, and that the person can stop it. */
export function composeHello(person: string, helper: Pick<Helper, 'name' | 'level' | 'cadence' | 'weekday'>): Composed {
  const when =
    helper.level === 'ask'
      ? ''
      : helper.cadence === 'weekly'
        ? `It arrives once a week, on ${WEEKDAYS[helper.weekday] ?? 'Monday'}.`
        : helper.cadence === 'off'
          ? `${person} chose not to send a regular note; you will still hear about anything urgent.`
          : `It arrives after each of ${possessive(person)} email checks.`
  const lines = [
    `Hi ${helper.name},`,
    '',
    `${person} added you as a trusted helper in InboxScout, the email assistant on ${possessive(person)} computer.`,
    '',
    `What you will get: ${levelWords(helper.level, person)}.`,
    ...(when ? [when] : []),
    '',
    `Nothing else: never ${possessive(person)} emails themselves, passwords, sign-ins, or attachments.`,
    `${person} can change or stop this at any time, and can read every message sent to you.`,
    '',
    `Reply to this email to send ${person} a note — it lands in their inbox and on their InboxScout screen.`
  ]
  return finish(`InboxScout: ${person} added you as a trusted helper`, lines.join('\n'))
}

// ---- Who the person is, as helpers see them ----

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const first = local.split(/[._\-+]/)[0] ?? ''
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : ''
}

/** The person's first name for helper copy: from their own sent mail, else their account, else a neutral fallback. */
export function personName(deps: HelperDeps): string {
  if (deps.personName?.trim()) return deps.personName.trim()
  try {
    const accounts = repo.listAccounts(deps.db)
    const mine = accounts.map((a) => a.email.trim().toLowerCase())
    const inferred = inferOwnerName(repo.messagesSince(deps.db, 120, 1500), mine)
    if (inferred) return inferred.split(/\s+/)[0]
    for (const a of accounts) {
      const label = a.label && !a.label.includes('@') ? a.label.split(/\s+/)[0] : nameFromEmail(a.email)
      if (label) return label
    }
  } catch {
    // fall through
  }
  return 'The person you help'
}

// ---- Sending, with the log ----

interface Outbox {
  account: AccountConfig
  password: string
}

function findOutbox(deps: HelperDeps): Outbox | null {
  const account = pickOutbox(repo.listAccounts(deps.db), null)
  const password = account ? deps.secrets.get(accountSecretName(account.id)) : null
  return account && password ? { account, password } : null
}

/**
 * Send one message to one helper and log exactly what went out. Email first; if that fails (or the
 * helper has no email) the clipped text goes by SMS through the carrier gateway. Never throws.
 */
export async function sendToHelper(
  deps: HelperDeps,
  helper: Helper,
  kind: HelperSend['kind'],
  subject: string,
  text: string,
  html?: string,
  triggerKey: string | null = null,
  id: string = randomUUID()
): Promise<HelperSend> {
  const now = (): string => (deps.now?.() ?? new Date()).toISOString()
  let first = true
  const record = (channel: HelperSend['channel'], status: HelperSend['status'], error: string | null, sent: string): HelperSend => {
    const row: HelperSend = { id: first ? id : randomUUID(), helperId: helper.id, kind, channel, sentAt: now(), subject, text: sent, triggerKey, status, error }
    first = false
    try {
      repo.insertHelperSend(deps.db, row)
    } catch (err) {
      deps.log?.('error', 'helpers', 'could not write the sent log', { error: shortReason(err) })
    }
    if (status === 'failed') deps.log?.('warn', 'helpers', `message to ${helper.name} failed`, { kind, channel, error })
    return row
  }
  try {
    const outbox = findOutbox(deps)
    if (!outbox) return record(helper.email ? 'email' : 'sms', 'failed', NO_OUTBOX_ERROR, text)
    const send = deps.send ?? sendMail
    if (helper.email) {
      try {
        await send(outbox.account, outbox.password, helper.email, subject, html ?? textToHtml(text), text)
        return record('email', 'sent', null, text)
      } catch (err) {
        const row = record('email', 'failed', shortReason(err), text)
        if (!helper.phone) return row
      }
    }
    if (helper.phone) {
      const to = smsAddress(helper.phone, helper.carrier)
      if (!to) return record('sms', 'failed', 'Check the phone number and carrier.', text)
      const body = smsBody(text)
      try {
        await send(outbox.account, outbox.password, to, '', undefined, body)
        return record('sms', 'sent', null, body)
      } catch (err) {
        return record('sms', 'failed', shortReason(err), body)
      }
    }
    return record('email', 'failed', 'This helper has no email address or phone number.', text)
  } catch (err) {
    return record(helper.email ? 'email' : 'sms', 'failed', shortReason(err), text)
  }
}

// ---- "Ask for help": a ten-second pending queue with Cancel ----

interface PendingAsk {
  timer: NodeJS.Timeout
  helper: Helper
  composed: Composed
  sendsAt: string
}

const pending = new Map<string, PendingAsk>()

export interface AskRequest {
  helperId: string
  title: string
  nextStep?: string
  whyNow?: string
  note?: string
}

export interface ScheduledAsk {
  sendId: string
  sendsAt: string
  helperName: string
  /** True when no connected account can send mail: the message will be logged as failed; `mailto` is the way out. */
  outboxMissing: boolean
  /** "Open in my mail app — press Send": the same message as a mailto: link (only when the helper has an email). */
  mailto: string | null
}

function bad(message: string): Error {
  const e = new Error(message)
  ;(e as any).status = 400
  return e
}

/** Find a helper by id in settings. */
export function findHelper(db: DB, helperId: string): Helper | null {
  return loadSettings(db).helpers.find((h) => h.id === helperId) ?? null
}

/**
 * Queue an Ask for help. Returns at once with when it will go; `cancelAsk` before then stops it.
 * Throws (status 400) when the helper is missing or helpers are paused.
 */
export function scheduleAsk(deps: HelperDeps, req: AskRequest): ScheduledAsk {
  const settings = loadSettings(deps.db)
  if (settings.helpersPaused) throw bad('Your helpers are paused. Turn them back on under Setup → Trusted helpers.')
  const helper = settings.helpers.find((h) => h.id === req.helperId)
  if (!helper) throw bad('No helper yet — add one under Setup → Trusted helpers.')
  if (helper.paused) throw bad(`${helper.name} is paused. Turn them back on under Setup → Trusted helpers.`)
  const title = String(req.title ?? '').trim()
  if (!title) throw bad('Nothing to send: the item has no title.')
  const composed = composeAsk({ person: personName(deps), helper, title, nextStep: req.nextStep, whyNow: req.whyNow, note: req.note })
  const delay = deps.askDelayMs ?? ASK_DELAY_MS
  const sendId = randomUUID()
  const sendsAt = new Date((deps.now?.() ?? new Date()).getTime() + delay).toISOString()
  const timer = setTimeout(() => {
    pending.delete(sendId)
    void sendToHelper(deps, helper, 'ask', composed.subject, composed.text, composed.html, null, sendId)
  }, delay)
  timer.unref?.()
  pending.set(sendId, { timer, helper, composed, sendsAt })
  const mailto = helper.email ? `mailto:${encodeURIComponent(helper.email)}?${new URLSearchParams({ subject: composed.subject, body: composed.text }).toString().replace(/\+/g, '%20')}` : null
  return { sendId, sendsAt, helperName: helper.name, outboxMissing: !findOutbox(deps), mailto }
}

/** Stop a queued Ask. Logged as cancelled so the person can see what did not go. */
export function cancelAsk(deps: HelperDeps, sendId: string): { cancelled: boolean } {
  const p = pending.get(sendId)
  if (!p) return { cancelled: false }
  clearTimeout(p.timer)
  pending.delete(sendId)
  try {
    repo.insertHelperSend(deps.db, {
      id: sendId,
      helperId: p.helper.id,
      kind: 'ask',
      channel: p.helper.email ? 'email' : 'sms',
      sentAt: (deps.now?.() ?? new Date()).toISOString(),
      subject: p.composed.subject,
      text: p.composed.text,
      triggerKey: null,
      status: 'cancelled',
      error: null
    })
  } catch (err) {
    deps.log?.('error', 'helpers', 'could not log the cancelled ask', { error: shortReason(err) })
  }
  return { cancelled: true }
}

/** Ids of asks still waiting (tests, and the UI on reload). */
export function pendingAsks(): string[] {
  return [...pending.keys()]
}
