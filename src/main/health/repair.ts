import { accessSync, constants, existsSync, mkdirSync, statfsSync } from 'node:fs'
import { createServer } from 'node:net'
import { delimiter, join } from 'node:path'
import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { loadSettings, saveSettings } from '../settings'
import { getSignin, type SecretsLike } from '../signins'
import { type HealthCtx, metaSyncFails } from './checks'

/**
 * Self-healing, part 2: the repairs that touch the real world (database, disk,
 * ports, the Assistant), built from injected dependencies so ipc.ts can wire
 * them up and tests can swap them out. No Electron import here either — the
 * caller passes the userData folder and the Assistant starter in.
 */

export type RepairLog = (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void

export interface RepairDeps {
  db: DB
  secrets: SecretsLike
  userData: string
  /** Start the Assistant browser on a recipe (mints an app password and connects the account when done). */
  startAgent: (input: { recipeId?: string; params?: Record<string, string> }) => { ok: boolean; summary?: string }
  log?: RepairLog
}

const APP_PASSWORD_PROVIDERS = new Set(['gmail', 'yahoo', 'icloud'])

/** Forget the sync bookmark for one account; the next scan re-reads its folders from the start. */
export function resetSync(deps: RepairDeps, accountId: string): string {
  repo.resetSyncState(deps.db, accountId)
  deps.log?.('info', 'health', 'reset sync state', { accountId })
  return 'sync bookmark reset'
}

/** Point the reports folder at a place we can always write (inside the app's own data folder). */
export function reportsDirFallback(deps: RepairDeps): string {
  const dir = join(deps.userData, 'Reports')
  mkdirSync(dir, { recursive: true })
  const s = loadSettings(deps.db)
  saveSettings(deps.db, { ...s, reportsDir: dir })
  deps.log?.('info', 'health', 'reports folder moved', { dir })
  return dir
}

/**
 * The account's password or token stopped working. When the person saved a sign-in for that
 * email and the provider hands out app passwords, the Assistant can mint a new one on its own
 * and connect it; otherwise the person has to reconnect by hand.
 */
export async function reauthAccount(deps: RepairDeps, accountId: string): Promise<{ ok: boolean; message: string }> {
  const account = repo.listAccounts(deps.db).find((a) => a.id === accountId)
  if (!account) return { ok: false, message: 'that account is no longer connected' }
  const who = account.label || account.email
  if (!APP_PASSWORD_PROVIDERS.has(account.provider) || !getSignin(deps.db, deps.secrets, account.email)) {
    return { ok: false, message: `needs you: reconnect ${who} in Setup → Email accounts` }
  }
  const r = deps.startAgent({ recipeId: `${account.provider}-app-password`, params: { email: account.email } })
  if (!r.ok) {
    deps.log?.('warn', 'health', 'reauth could not start', { accountId, why: r.summary })
    return { ok: false, message: r.summary ? `could not reconnect ${who} yet: ${r.summary}` : `could not reconnect ${who} yet` }
  }
  deps.log?.('info', 'health', 'reauth started through the Assistant', { accountId, provider: account.provider })
  return { ok: true, message: `Reconnecting ${account.email} on its own…` }
}

/** After a fresh password worked: the account's failure streak is over. */
export function markAccountHealthy(db: DB, accountId: string): void {
  repo.setMeta(db, metaSyncFails(accountId), '0')
}

// ---- Probes the checks rely on ----

export function canWrite(dir: string): boolean {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export function freeBytes(dir: string): number | null {
  try {
    const s = statfsSync(existsSync(dir) ? dir : join(dir, '..'))
    return Number(s.bavail) * Number(s.bsize)
  } catch {
    return null
  }
}

export function which(binary: string, env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): boolean {
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  const names = platform === 'win32' ? [binary, `${binary}.exe`, `${binary}.cmd`, `${binary}.bat`] : [binary]
  return dirs.some((d) => names.some((n) => existsSync(join(d, n))))
}

export function portFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    try {
      probe.listen(port, host)
    } catch {
      resolve(false)
    }
  })
}

export interface HealthWiring extends RepairDeps {
  platform?: string
  bridgeRunning: () => boolean
  syncBridge: () => void
  probeAi: () => Promise<{ ok: boolean; error?: string }>
}

/** The real context for the pure checks: database, settings, disk, ports, and the repairs above. */
export function createHealthContext(w: HealthWiring): HealthCtx {
  return {
    now: () => new Date(),
    platform: w.platform ?? process.platform,
    userData: w.userData,
    settings: () => loadSettings(w.db),
    saveSettings: (s) => saveSettings(w.db, s),
    accounts: () => repo.listAccounts(w.db),
    getMeta: (key) => repo.getMeta(w.db, key),
    setMeta: (key, value) => repo.setMeta(w.db, key, value),
    quickCheck: () => {
      const rows = w.db.pragma('quick_check') as { quick_check: string }[]
      return rows.map((r) => r.quick_check).join('; ') || 'ok'
    },
    canWrite,
    mkdir: (dir) => mkdirSync(dir, { recursive: true }),
    freeBytes,
    which: (b) => which(b),
    // Stores without the probe (tests, in-memory fakes) are assumed fine; the real SecretStore answers honestly.
    secureSecrets: () => w.secrets.isSecure?.() ?? true,
    bridgeRunning: w.bridgeRunning,
    portFree: (p) => portFree(p),
    syncBridge: w.syncBridge,
    probeAi: w.probeAi,
    resetSync: (id) => void resetSync(w, id),
    reauthAccount: (id) => reauthAccount(w, id)
  }
}
