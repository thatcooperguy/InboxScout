import { randomUUID } from 'node:crypto'
import * as repo from '../db/repo'
import { loadSettings, saveSettings } from '../settings'
import { smsAddress, SMS_GATEWAYS } from '../delivery/email'
import { shortReason } from '../health/checks'
import { composeDigest, composeHeadsups, composeHello, personName, sendToHelper, type HelperDeps } from './deliver'
import { detectHeadsups, helperDigestKey, helperSentKey, type FailingAccountLike } from './headsups'
import { findHelperNotes } from './notes'
import type { Brief, Classification, Helper, HelperCadence, HelperLevel, HelperSend, MessageRecord } from '../../shared/types'
import type { StoredPerson } from '../db/repo'

/**
 * Trusted helpers (v1.4, Part A): the one door the rest of the app uses.
 *
 * - `afterRun` is the pipeline hook (scheduled and catch-up runs only): digests per helper cadence,
 *   then heads-ups, all respecting "Pause all helpers".
 * - `addHelper` / `updateHelper` / `removeHelper` / `pauseAll` are the only ways helpers change, so
 *   every path logs and sends the hello. `helpers` is deliberately not in the bridge settings allow-list.
 * - `findHelperNotes` is re-exported for the pipeline's "Notes from your helpers" step.
 */

export { findHelperNotes } from './notes'
export { cancelAsk, scheduleAsk, pendingAsks, personName, type HelperDeps, type ScheduledAsk, type AskRequest } from './deliver'
export { detectHeadsups, type Headsup } from './headsups'

export const HELPER_NOTICE_DAYS = 7
export const LEVELS: HelperLevel[] = ['ask', 'schedule', 'needs', 'all']
export const CADENCES: HelperCadence[] = ['each_brief', 'weekly', 'off']

// ---- Helper records ----

export interface NewHelper {
  name: string
  relationship?: string
  email?: string
  phone?: string
  carrier?: string
  level?: HelperLevel
  cadence?: HelperCadence
  weekday?: number
}

function bad(message: string): Error {
  const e = new Error(message)
  ;(e as any).status = 400
  return e
}

const clean = (v: unknown): string => String(v ?? '').trim()

/** Validate a new helper's contact details in plain words. */
export function validateHelper(input: NewHelper): { name: string; relationship: string; email: string; phone: string; carrier: string } {
  const name = clean(input.name)
  if (!name) throw bad('Give the helper a name.')
  const email = clean(input.email).toLowerCase()
  const phone = clean(input.phone)
  const carrier = clean(input.carrier)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('That email address does not look right.')
  if (phone && !smsAddress(phone, carrier)) throw bad(carrier && SMS_GATEWAYS[carrier] ? 'Enter a 10-digit phone number.' : 'Pick the helper\'s mobile carrier so texts can reach them.')
  if (!email && !phone) throw bad('A helper needs an email address or a phone number.')
  return { name, relationship: clean(input.relationship), email, phone: phone ? phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1') : '', carrier: phone ? carrier : '' }
}

const asLevel = (v: unknown, fallback: HelperLevel): HelperLevel => (LEVELS.includes(v as HelperLevel) ? (v as HelperLevel) : fallback)
const asCadence = (v: unknown, fallback: HelperCadence): HelperCadence => (CADENCES.includes(v as HelperCadence) ? (v as HelperCadence) : fallback)
const asWeekday = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : fallback
}

/**
 * Add a helper, remember who added them, and send the hello. Adds from anywhere but the person's
 * own screen (`bridge`, `helper_setup`) also start the seven-day Today notice.
 */
export async function addHelper(deps: HelperDeps, input: NewHelper, addedBy: Helper['addedBy']): Promise<Helper> {
  const contact = validateHelper(input)
  const now = deps.now?.() ?? new Date()
  const helper: Helper = {
    id: randomUUID(),
    ...contact,
    level: asLevel(input.level, 'needs'),
    cadence: asCadence(input.cadence, 'each_brief'),
    weekday: asWeekday(input.weekday, 1),
    paused: false,
    addedBy,
    createdAt: now.toISOString()
  }
  const s = loadSettings(deps.db)
  saveSettings(deps.db, {
    ...s,
    helpers: [...s.helpers, helper],
    helperNoticeUntil: addedBy === 'person' ? s.helperNoticeUntil : new Date(now.getTime() + HELPER_NOTICE_DAYS * 86400000).toISOString()
  })
  deps.log?.('info', 'helpers', 'helper added', { id: helper.id, level: helper.level, addedBy })
  const hello = composeHello(personName(deps), helper)
  await sendToHelper(deps, helper, 'hello', hello.subject, hello.text, hello.html)
  return helper
}

export type HelperPatch = Partial<Pick<Helper, 'name' | 'relationship' | 'email' | 'phone' | 'carrier' | 'level' | 'cadence' | 'weekday' | 'paused'>>

/** Change level, cadence, weekday, paused, or contact details. Contact changes are validated like a new helper. */
export function updateHelper(deps: HelperDeps, id: string, patch: HelperPatch): Helper {
  const s = loadSettings(deps.db)
  const current = s.helpers.find((h) => h.id === id)
  if (!current) throw bad('That helper is no longer in the list.')
  const contact =
    'name' in patch || 'email' in patch || 'phone' in patch || 'carrier' in patch || 'relationship' in patch
      ? validateHelper({ ...current, ...patch })
      : { name: current.name, relationship: current.relationship, email: current.email, phone: current.phone, carrier: current.carrier }
  const next: Helper = {
    ...current,
    ...contact,
    level: 'level' in patch ? asLevel(patch.level, current.level) : current.level,
    cadence: 'cadence' in patch ? asCadence(patch.cadence, current.cadence) : current.cadence,
    weekday: 'weekday' in patch ? asWeekday(patch.weekday, current.weekday) : current.weekday,
    paused: 'paused' in patch ? !!patch.paused : current.paused
  }
  saveSettings(deps.db, { ...s, helpers: s.helpers.map((h) => (h.id === id ? next : h)) })
  deps.log?.('info', 'helpers', 'helper updated', { id, keys: Object.keys(patch) })
  return next
}

export function removeHelper(deps: HelperDeps, id: string): { ok: boolean } {
  const s = loadSettings(deps.db)
  if (!s.helpers.some((h) => h.id === id)) return { ok: false }
  saveSettings(deps.db, { ...s, helpers: s.helpers.filter((h) => h.id !== id) })
  deps.log?.('info', 'helpers', 'helper removed', { id })
  return { ok: true }
}

/** One press: nothing goes to any helper until it is turned back on. */
export function pauseAll(deps: HelperDeps, paused: boolean): { paused: boolean } {
  const s = loadSettings(deps.db)
  saveSettings(deps.db, { ...s, helpersPaused: !!paused })
  return { paused: !!paused }
}

export function listHelpers(deps: Pick<HelperDeps, 'db'>): Helper[] {
  return loadSettings(deps.db).helpers
}

export function listHelperLog(deps: Pick<HelperDeps, 'db'>, opts: { helperId?: string; limit?: number } = {}): HelperSend[] {
  return repo.listHelperSends(deps.db, opts)
}

// ---- Masking for the bridge and the phone (never the digits) ----

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return email ? '***' : ''
  return `${email.charAt(0)}***${email.slice(at)}`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits ? `***-***-${digits.slice(-4)}` : ''
}

export type MaskedHelper = Omit<Helper, 'email' | 'phone'> & { email: string; phone: string }

export function maskHelper(h: Helper): MaskedHelper {
  return { ...h, email: maskEmail(h.email), phone: maskPhone(h.phone) }
}

// ---- The pipeline hook ----

export interface AfterRunInput {
  brief: Brief | null
  trigger: 'manual' | 'scheduled' | 'catchup' | 'cli'
  newClassifications: Classification[]
  messages: MessageRecord[]
  people: StoredPerson[]
  failingAccounts: FailingAccountLike[]
  now: Date
  /** The rendered brief, for helpers at `all` (same as "Email me my brief"). */
  markdown?: string
  /** When this run started (defaults to the newest run row) — #6 fires only for issues created since. */
  runStartedAt?: string
}

/** Is a weekly digest due: nothing sent since the most recent occurrence of the helper's weekday (local midnight). */
export function weeklyDue(now: Date, weekday: number, lastDigestAt: string | null): boolean {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() - weekday + 7) % 7))
  if (!lastDigestAt) return true
  const last = new Date(lastDigestAt).getTime()
  return !Number.isFinite(last) || last < start.getTime()
}

/**
 * After a scheduled or catch-up run: send each helper their digest (per cadence and level), then the
 * heads-ups (needs/all only, once per trigger key per seven days). Manual "Check my email" runs never
 * send anything. Returns plain-words notices for the run (only problems). Never throws.
 */
export async function afterRun(deps: HelperDeps, input: AfterRunInput): Promise<string[]> {
  const notices: string[] = []
  try {
    if (input.trigger !== 'scheduled' && input.trigger !== 'catchup') return notices
    const settings = loadSettings(deps.db)
    if (settings.helpersPaused) return notices
    const helpers = settings.helpers.filter((h) => !h.paused)
    if (helpers.length === 0) return notices
    const person = personName(deps)
    const now = input.now
    const failed = (h: Helper, row: HelperSend): void => {
      if (row.status === 'failed') notices.push(`Could not reach your helper ${h.name}: ${row.error ?? 'unknown error'}`)
    }

    // Digests
    if (input.brief) {
      for (const h of helpers) {
        if (h.level === 'ask' || h.cadence === 'off') continue
        const due = h.cadence === 'each_brief' || weeklyDue(now, h.weekday, repo.getMeta(deps.db, helperDigestKey(h.id)))
        if (!due) continue
        const composed = composeDigest({ person, helper: h, brief: input.brief, markdown: h.level === 'all' ? input.markdown : undefined })
        if (!composed) continue
        const row = await sendToHelper(deps, h, 'digest', composed.subject, composed.text, composed.html)
        failed(h, row)
        if (row.status === 'sent') repo.setMeta(deps.db, helperDigestKey(h.id), now.toISOString())
      }
    }

    // Heads-ups
    const listeners = helpers.filter((h) => h.level === 'needs' || h.level === 'all')
    if (listeners.length === 0) return notices
    const runStartedAt = input.runStartedAt ?? repo.listRuns(deps.db, 1)[0]?.startedAt ?? now.toISOString()
    const newIssueIds = new Set(
      repo
        .listIssues(deps.db, false)
        .filter((i) => i.createdAt >= runStartedAt)
        .map((i) => i.id)
    )
    const headsups = detectHeadsups({
      person,
      newClassifications: input.newClassifications,
      messages: input.messages,
      people: input.people,
      brief: input.brief,
      failingAccounts: input.failingAccounts,
      now,
      newIssueIds,
      lastSent: (key) => repo.getMeta(deps.db, helperSentKey(key))
    })
    for (const m of composeHeadsups(person, headsups)) {
      for (const h of listeners) failed(h, await sendToHelper(deps, h, 'headsup', m.subject, m.text, m.html, m.triggerKey))
      // Marked whether or not every send worked: a broken outbox is already in the log and in Health.
      repo.setMeta(deps.db, helperSentKey(m.triggerKey), now.toISOString())
    }
  } catch (err) {
    deps.log?.('error', 'helpers', 'after-run helper step failed', { error: shortReason(err) })
    notices.push(`Helper messages skipped this time: ${shortReason(err)}`)
  }
  return notices
}

/** Convenience for the pipeline's notes step: the current helpers from settings. */
export function helperNotesFrom(deps: Pick<HelperDeps, 'db'>, messages: MessageRecord[], now = new Date()): Brief['helperNotes'] {
  return findHelperNotes(messages, loadSettings(deps.db).helpers, { now })
}
