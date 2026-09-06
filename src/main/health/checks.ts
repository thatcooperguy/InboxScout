import { join } from 'node:path'
import { pickOutbox } from '../delivery/email'
import type { AccountConfig, AppSettings, HealthItem, HealthReport, HelperSend } from '../../shared/types'

/**
 * Self-healing, part 1: the pure checks. Each check looks at the app through a
 * small injected context (no Electron, no sockets, no file system of its own),
 * says whether something is wrong in plain words, and — when it is safe — knows
 * how to fix it. `runHealth` only looks; `runRepairs` looks, fixes, and looks again.
 *
 * Health information stays quiet: an "ok" item is never shown to the person, a
 * "warn"/"fail" item explains itself in one sentence, and a "fixed" item says
 * what was done so nobody wonders why a setting changed.
 */

export const META_AI_FAILS = 'health:ai'
export const META_AI_ERROR = 'health:ai:error'
export const META_FIXES = 'health:fixes'
export const metaSyncFails = (accountId: string): string => `health:sync:${accountId}`
export const metaSyncError = (accountId: string): string => `health:sync:${accountId}:error`
export const metaReauthAt = (accountId: string): string => `health:reauth:${accountId}`
export const metaResyncAt = (accountId: string): string => `health:resync:${accountId}`

/** Bridge ports to try when the configured one is taken (the default is 47311). */
export const BRIDGE_FALLBACK_PORTS = [47312, 47313, 47314, 47315, 47316, 47317, 47318, 47319, 47320]
export const LOW_DISK_BYTES = 500 * 1024 * 1024
export const MAX_RECENT_FIXES = 20
/** Failures in a row before a check speaks up. One bad night is not a pattern. */
export const FAIL_THRESHOLD = 2

/** Errors from a mail server that mean "the password or token is no longer accepted". */
export const AUTH_ERROR_RE = /auth|login|credential|invalid|AUTHENTICATIONFAILED|401|403/i
export function isAuthError(message: string): boolean {
  return AUTH_ERROR_RE.test(message)
}

/** Errors that mean our sync bookmark is stale (Gmail history expired, UIDVALIDITY changed) and a fresh start fixes them. */
export const STALE_SYNC_RE = /uidvalidity|historyId|history id|history.*(expired|not found)|\b404\b|start_history_id/i
export function isStaleSyncError(message: string): boolean {
  return STALE_SYNC_RE.test(message) && !isAuthError(message)
}

export interface HealthCtx {
  now: () => Date
  platform: NodeJS.Platform | string
  userData: string
  settings: () => AppSettings
  saveSettings: (s: AppSettings) => void
  accounts: () => AccountConfig[]
  getMeta: (key: string) => string | null
  setMeta: (key: string, value: string) => void
  /** SQLite `PRAGMA quick_check`: 'ok' or the problem text. May throw. */
  quickCheck: () => string
  canWrite: (dir: string) => boolean
  mkdir: (dir: string) => void
  /** Free space on the volume holding `dir`; null when unknown. */
  freeBytes: (dir: string) => number | null
  which: (binary: string) => boolean
  /** True when the OS keyring/keychain protects saved passwords (false on Linux without gnome-keyring or kwallet). */
  secureSecrets: () => boolean
  bridgeRunning: () => boolean
  portFree: (port: number) => Promise<boolean>
  syncBridge: () => void
  probeAi: () => Promise<{ ok: boolean; error?: string }>
  /** Forget the sync bookmark for an account so the next scan starts from scratch. */
  resetSync: (accountId: string) => void
  /** Mint a fresh app password through the Assistant, or say what the person must do. */
  reauthAccount: (accountId: string) => Promise<{ ok: boolean; message: string }>
  /** Trusted helpers (v1.4): the newest sent-log row for a helper, so the check can say when the last message failed. Optional for lean hosts. */
  lastHelperSend?: (helperId: string) => HelperSend | null
}

export interface Check {
  id: string
  title: string
  detect: (ctx: HealthCtx) => HealthItem
  /** Fix it. Resolves to a one-line description of what was done; rejects when it could not. */
  repair?: (ctx: HealthCtx, item: HealthItem) => Promise<string>
}

const item = (check: Pick<Check, 'id' | 'title'>, status: HealthItem['status'], detail: string, canRepair = false): HealthItem => ({
  id: check.id,
  title: check.title,
  status,
  detail,
  canRepair
})

export function counter(ctx: Pick<HealthCtx, 'getMeta'>, key: string): number {
  const n = Number(ctx.getMeta(key) ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function shortReason(err: unknown, max = 120): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? 'unknown error')
  const line = String(raw ?? '').split('\n')[0].trim() || 'unknown error'
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/**
 * Try the AI helper; if it fails, say why (once) and use the built-in engine instead.
 * The pipeline uses this so a flaky provider never costs the person their brief.
 */
export async function withAiFallback<T>(
  fn: () => Promise<T>,
  fallback: () => T | Promise<T>,
  onFail: (reason: string) => void
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    onFail(shortReason(err))
    return await fallback()
  }
}

// ---- The checks ----

const dbCheck: Check = {
  id: 'db',
  title: 'Local database',
  detect(ctx) {
    try {
      const result = ctx.quickCheck().trim()
      if (result.toLowerCase() === 'ok') return item(this, 'ok', 'Your local database checks out.')
      return item(this, 'fail', `The local database reported a problem: ${shortReason(result)}. Quit InboxScout and start it again; if this keeps showing, copy the diagnostics for support.`)
    } catch (err) {
      return item(this, 'fail', `Could not check the local database: ${shortReason(err)}.`)
    }
  }
}

const reportsDirCheck: Check = {
  id: 'reportsDir',
  title: 'Reports folder',
  detect(ctx) {
    const dir = ctx.settings().reportsDir
    if (!dir) return item(this, 'warn', 'No reports folder is set, so briefs are only kept inside the app.', true)
    if (ctx.canWrite(dir)) return item(this, 'ok', `Briefs are saved to ${dir}.`)
    return item(this, 'fail', `InboxScout cannot write to the reports folder (${dir}). Briefs are still kept inside the app.`, true)
  },
  async repair(ctx) {
    const dir = join(ctx.userData, 'Reports')
    ctx.mkdir(dir)
    if (!ctx.canWrite(dir)) throw new Error(`could not create a folder at ${dir}`)
    ctx.saveSettings({ ...ctx.settings(), reportsDir: dir })
    return `Moved the reports folder to ${dir}`
  }
}

interface FailingAccount {
  account: AccountConfig
  count: number
  error: string
}

export function failingAccounts(ctx: Pick<HealthCtx, 'accounts' | 'getMeta'>): FailingAccount[] {
  const out: FailingAccount[] = []
  for (const account of ctx.accounts()) {
    const count = counter(ctx, metaSyncFails(account.id))
    if (count < FAIL_THRESHOLD) continue
    out.push({ account, count, error: ctx.getMeta(metaSyncError(account.id)) ?? 'unknown error' })
  }
  return out
}

const accountsCheck: Check = {
  id: 'accounts',
  title: 'Email accounts',
  detect(ctx) {
    const accounts = ctx.accounts()
    if (accounts.length === 0) return item(this, 'ok', 'No email accounts connected yet.')
    const failing = failingAccounts(ctx)
    if (failing.length === 0) return item(this, 'ok', `${accounts.length === 1 ? 'Your account is' : `All ${accounts.length} accounts are`} syncing normally.`)
    const worst = Math.max(...failing.map((f) => f.count))
    const lines = failing.map((f) => `${f.account.label || f.account.email} has not synced ${f.count} times in a row (${shortReason(f.error)})`)
    return item(this, worst >= FAIL_THRESHOLD * 2 ? 'fail' : 'warn', `${lines.join('; ')}.`, true)
  },
  async repair(ctx) {
    const done: string[] = []
    const stuck: string[] = []
    for (const f of failingAccounts(ctx)) {
      const who = f.account.label || f.account.email
      if (isAuthError(f.error)) {
        const r = await ctx.reauthAccount(f.account.id)
        if (r.ok) done.push(r.message)
        else stuck.push(`${who} — ${r.message}`)
        continue
      }
      ctx.resetSync(f.account.id)
      ctx.setMeta(metaSyncFails(f.account.id), '0')
      done.push(`Reset the sync bookmark for ${who}; the next scan starts fresh`)
    }
    if (done.length === 0) throw new Error(stuck.join('; ') || 'nothing to fix')
    return [...done, ...stuck].join('; ')
  }
}

const aiCheck: Check = {
  id: 'ai',
  title: 'AI helper',
  detect(ctx) {
    const s = ctx.settings()
    if (s.ai.provider === 'builtin') return item(this, 'ok', 'Using the built-in engine.')
    const fails = counter(ctx, META_AI_FAILS)
    if (fails < FAIL_THRESHOLD) return item(this, 'ok', `The AI helper (${s.ai.provider}) is answering.`)
    const why = ctx.getMeta(META_AI_ERROR)
    return item(this, 'warn', `AI helper failing; using the built-in engine meanwhile${why ? ` (${shortReason(why)})` : ''}.`, true)
  },
  async repair(ctx) {
    const r = await ctx.probeAi()
    if (!r.ok) throw new Error(r.error ? shortReason(r.error) : 'the AI helper is still not answering')
    ctx.setMeta(META_AI_FAILS, '0')
    return 'The AI helper is answering again; the next scan uses it'
  }
}

export function scheduleIntervalMs(s: AppSettings['schedule']): number | null {
  if (s.frequency === 'daily') return 24 * 60 * 60 * 1000
  if (s.frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000
  return null
}

const scheduleCheck: Check = {
  id: 'schedule',
  title: 'Scheduled scans',
  detect(ctx) {
    const s = ctx.settings()
    const interval = scheduleIntervalMs(s.schedule)
    if (interval === null) return item(this, 'ok', 'Scans run only when you ask.')
    if (!s.lastRunAt) return item(this, 'ok', 'No scan has run yet.')
    const age = ctx.now().getTime() - new Date(s.lastRunAt).getTime()
    if (!Number.isFinite(age) || age <= 2 * interval) return item(this, 'ok', 'Scheduled scans are happening on time.')
    const days = Math.floor(age / 86400000)
    return item(
      this,
      'warn',
      `The last scan was ${days} day${days === 1 ? '' : 's'} ago, longer than the ${s.schedule.frequency} schedule expects. Press Run now, and check that InboxScout is allowed to start with your computer.`
    )
  }
}

const bridgeCheck: Check = {
  id: 'bridge',
  title: 'Agent bridge',
  detect(ctx) {
    const s = ctx.settings()
    if (!s.bridgeEnabled) return item(this, 'ok', 'The agent bridge is off.')
    if (ctx.bridgeRunning()) return item(this, 'ok', `The agent bridge is listening on port ${s.bridgePort}.`)
    return item(this, 'fail', `The agent bridge is on but not listening on port ${s.bridgePort} — another program may be using it.`, true)
  },
  async repair(ctx) {
    const s = ctx.settings()
    for (const port of BRIDGE_FALLBACK_PORTS) {
      if (port === s.bridgePort) continue
      if (!(await ctx.portFree(port))) continue
      ctx.saveSettings({ ...ctx.settings(), bridgePort: port })
      ctx.syncBridge()
      return `Moved the agent bridge to port ${port} (update the address in your agent's settings)`
    }
    throw new Error(`no free port between ${BRIDGE_FALLBACK_PORTS[0]} and ${BRIDGE_FALLBACK_PORTS[BRIDGE_FALLBACK_PORTS.length - 1]}`)
  }
}

const desktopLinuxCheck: Check = {
  id: 'desktop-linux',
  title: 'Desktop control',
  detect(ctx) {
    const s = ctx.settings()
    if (s.systemControl !== 'on' || ctx.platform !== 'linux') return item(this, 'ok', 'Nothing to check on this system.')
    if (ctx.which('xdotool')) return item(this, 'ok', 'Mouse and keyboard control is available.')
    return item(this, 'warn', 'Mouse and keyboard control needs xdotool on Linux. Install it with: sudo apt install xdotool')
  }
}

const keyringLinuxCheck: Check = {
  id: 'keyring-linux',
  title: 'Password storage',
  detect(ctx) {
    if (ctx.platform !== 'linux') return item(this, 'ok', 'Nothing to check on this system.')
    if (ctx.secureSecrets()) return item(this, 'ok', 'Passwords are locked with the system keyring.')
    return item(
      this,
      'warn',
      'Install gnome-keyring or kwallet (sudo apt install gnome-keyring) so InboxScout can lock your passwords with the system keyring; until then they are stored obfuscated, not encrypted.'
    )
  }
}

const diskCheck: Check = {
  id: 'disk',
  title: 'Disk space',
  detect(ctx) {
    const free = ctx.freeBytes(ctx.userData)
    if (free === null) return item(this, 'ok', 'Could not measure free space; assuming it is fine.')
    if (free >= LOW_DISK_BYTES) return item(this, 'ok', `${Math.round(free / (1024 * 1024 * 1024))} GB free.`)
    return item(this, 'warn', `Only ${Math.max(1, Math.round(free / (1024 * 1024)))} MB free where InboxScout keeps its data. Free up some space so mail and briefs can be saved.`)
  }
}

// ---- Trusted helpers (v1.4, A7): never fatal, never auto-repaired (sending is not a "safe" repair) ----
export const NO_OUTBOX_FOR_HELPERS = 'You have helpers but no account that can send mail. Add a Gmail, Yahoo, or iCloud account with an app password, or your helpers will not hear from InboxScout.'

export const helpersCheck: Check = {
  id: 'helpers',
  title: 'Trusted helpers',
  detect(ctx) {
    const s = ctx.settings()
    const helpers = (s.helpers ?? []).filter((h) => !h.paused)
    if (helpers.length === 0) return item(this, 'ok', s.helpers?.length ? 'Your helpers are all paused.' : 'No helpers yet.')
    if (s.helpersPaused) return item(this, 'ok', 'Helpers are paused; nothing is sent.')
    if (!pickOutbox(ctx.accounts(), null)) return item(this, 'warn', NO_OUTBOX_FOR_HELPERS)
    const stuck: string[] = []
    for (const h of helpers) {
      const last = ctx.lastHelperSend?.(h.id) ?? null
      if (last && last.status === 'failed') stuck.push(`the last message to ${h.name} did not go through (${shortReason(last.error ?? 'unknown error')})`)
    }
    if (stuck.length) return item(this, 'warn', `${stuck.join('; ')}. Check the outbox account under Setup → Email accounts, then press Ask for help again or wait for the next check.`.replace(/^./, (c) => c.toUpperCase()))
    return item(this, 'ok', `${helpers.length === 1 ? `${helpers[0].name} hears` : `${helpers.length} helpers hear`} from InboxScout.`)
  }
}

export const CHECKS: Check[] = [dbCheck, reportsDirCheck, accountsCheck, aiCheck, scheduleCheck, bridgeCheck, desktopLinuxCheck, keyringLinuxCheck, diskCheck, helpersCheck]

// ---- Running them ----

export interface RecordedFix {
  at: string
  text: string
}

export function readFixes(ctx: Pick<HealthCtx, 'getMeta'>): RecordedFix[] {
  const raw = ctx.getMeta(META_FIXES)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((f) => f && typeof f.text === 'string' && typeof f.at === 'string') : []
  } catch {
    return []
  }
}

/** Remember a fix (newest first, capped) so the app can say "fixed on its own" without nagging forever. */
export function recordFix(ctx: Pick<HealthCtx, 'getMeta' | 'setMeta' | 'now'>, text: string): void {
  const fixes = [{ at: ctx.now().toISOString(), text }, ...readFixes(ctx)].slice(0, MAX_RECENT_FIXES)
  ctx.setMeta(META_FIXES, JSON.stringify(fixes))
}

export function runHealth(ctx: HealthCtx, checks: Check[] = CHECKS): HealthReport {
  const items: HealthItem[] = checks.map((check) => {
    try {
      return check.detect(ctx)
    } catch (err) {
      return item(check, 'fail', `This check could not run: ${shortReason(err)}.`)
    }
  })
  return {
    checkedAt: ctx.now().toISOString(),
    ok: items.every((i) => i.status === 'ok' || i.status === 'fixed'),
    items,
    recentFixes: readFixes(ctx).map((f) => f.text)
  }
}

/** Look, fix everything that is safe to fix automatically, and look again. */
export async function runRepairs(ctx: HealthCtx, checks: Check[] = CHECKS): Promise<HealthReport> {
  const before = runHealth(ctx, checks)
  const fixedBy = new Map<string, string>()
  const failedRepair = new Map<string, string>()
  for (const it of before.items) {
    if (!it.canRepair || (it.status !== 'fail' && it.status !== 'warn')) continue
    const check = checks.find((c) => c.id === it.id)
    if (!check?.repair) continue
    try {
      const what = await check.repair(ctx, it)
      fixedBy.set(it.id, what)
      recordFix(ctx, what)
    } catch (err) {
      failedRepair.set(it.id, shortReason(err))
    }
  }
  const after = runHealth(ctx, checks)
  after.items = after.items.map((it) => {
    const fix = fixedBy.get(it.id)
    if (fix && it.status === 'ok') return { ...it, status: 'fixed', fixedBy: fix }
    if (fix) return { ...it, fixedBy: fix, detail: `${it.detail} (${fix}.)` }
    const why = failedRepair.get(it.id)
    if (why && it.status !== 'ok') return { ...it, detail: `${it.detail} The automatic fix did not work: ${why}.` }
    return it
  })
  after.ok = after.items.every((i) => i.status === 'ok' || i.status === 'fixed')
  return after
}
