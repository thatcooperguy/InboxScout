import { describe, expect, it } from 'vitest'
import {
  AUTH_ERROR_RE,
  BRIDGE_FALLBACK_PORTS,
  CHECKS,
  LOW_DISK_BYTES,
  META_AI_ERROR,
  META_AI_FAILS,
  META_FIXES,
  isAuthError,
  isStaleSyncError,
  metaSyncError,
  metaSyncFails,
  readFixes,
  recordFix,
  runHealth,
  runRepairs,
  shortReason,
  withAiFallback,
  type Check,
  type HealthCtx
} from '../src/main/health/checks'
import { createHealthContext, reauthAccount, resetSync, which } from '../src/main/health/repair'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { saveSignin } from '../src/main/signins'
import { DEFAULT_SETTINGS, type AccountConfig, type AppSettings } from '../src/shared/types'

const NOW = new Date('2026-09-06T12:00:00.000Z')

const account = (id: string, provider: AccountConfig['provider'] = 'gmail'): AccountConfig => ({
  id,
  label: `${id}@example.com`,
  email: `${id}@example.com`,
  provider,
  host: 'imap.example.com',
  port: 993,
  folders: ['INBOX'],
  createdAt: NOW.toISOString()
})

interface Fake {
  ctx: HealthCtx
  meta: Map<string, string>
  calls: string[]
  settings: AppSettings
}

function fakeCtx(over: Partial<HealthCtx> = {}, settings: Partial<AppSettings> = {}): Fake {
  const meta = new Map<string, string>()
  const calls: string[] = []
  const state = { settings: { ...DEFAULT_SETTINGS, reportsDir: '/tmp/reports', lastRunAt: NOW.toISOString(), ...settings } as AppSettings }
  const ctx: HealthCtx = {
    now: () => NOW,
    platform: 'darwin',
    userData: '/data',
    settings: () => state.settings,
    saveSettings: (s) => {
      state.settings = s
      calls.push('saveSettings')
    },
    accounts: () => [],
    getMeta: (k) => meta.get(k) ?? null,
    setMeta: (k, v) => void meta.set(k, v),
    quickCheck: () => 'ok',
    canWrite: () => true,
    mkdir: (d) => void calls.push(`mkdir:${d}`),
    freeBytes: () => 50 * 1024 * 1024 * 1024,
    which: () => true,
    secureSecrets: () => true,
    bridgeRunning: () => true,
    portFree: async () => true,
    syncBridge: () => void calls.push('syncBridge'),
    probeAi: async () => ({ ok: true }),
    resetSync: (id) => void calls.push(`resetSync:${id}`),
    reauthAccount: async (id) => {
      calls.push(`reauth:${id}`)
      return { ok: true, message: `Reconnecting ${id}@example.com on its own…` }
    },
    ...over
  }
  return {
    ctx,
    meta,
    calls,
    get settings() {
      return state.settings
    }
  }
}

const check = (id: string): Check => CHECKS.find((c) => c.id === id)!
const detect = (id: string, f: Fake) => check(id).detect(f.ctx)

describe('health checks', () => {
  it('all green on a healthy app', () => {
    const report = runHealth(fakeCtx().ctx)
    expect(report.ok).toBe(true)
    expect(report.items.map((i) => i.id)).toEqual(['db', 'reportsDir', 'accounts', 'ai', 'schedule', 'bridge', 'desktop-linux', 'keyring-linux', 'disk', 'helpers', 'attachments'])
    expect(report.items.every((i) => i.status === 'ok')).toBe(true)
    expect(report.checkedAt).toBe(NOW.toISOString())
  })

  it('db: quick_check problems and thrown errors both fail', () => {
    expect(detect('db', fakeCtx()).status).toBe('ok')
    expect(detect('db', fakeCtx({ quickCheck: () => '*** in database main *** page 3 is never used' }))).toMatchObject({ status: 'fail', canRepair: false })
    const thrown = detect('db', fakeCtx({ quickCheck: () => { throw new Error('database is locked') } }))
    expect(thrown.status).toBe('fail')
    expect(thrown.detail).toContain('database is locked')
  })

  it('reportsDir: unwritable folder fails and can be repaired into userData/Reports', async () => {
    expect(detect('reportsDir', fakeCtx()).status).toBe('ok')
    expect(detect('reportsDir', fakeCtx({}, { reportsDir: '' }))).toMatchObject({ status: 'warn', canRepair: true })
    const f = fakeCtx({ canWrite: (dir) => dir !== '/tmp/reports' })
    expect(detect('reportsDir', f)).toMatchObject({ status: 'fail', canRepair: true })
    const what = await check('reportsDir').repair!(f.ctx, detect('reportsDir', f))
    expect(what).toContain('Reports')
    expect(f.settings.reportsDir.replace(/\\/g, '/')).toBe('/data/Reports')
    // path.join uses backslashes on Windows; compare with separators normalized.
    expect(f.calls.map((c) => c.replace(/\\/g, '/'))).toContain('mkdir:/data/Reports')
    expect(detect('reportsDir', f).status).toBe('ok')
  })

  it('accounts: speaks up after two failures in a row, names the account and the last error', async () => {
    const accounts = [account('a1'), account('a2', 'imap')]
    const f = fakeCtx({ accounts: () => accounts })
    expect(detect('accounts', f).status).toBe('ok')
    f.meta.set(metaSyncFails('a1'), '1')
    expect(detect('accounts', f).status).toBe('ok')
    f.meta.set(metaSyncFails('a1'), '2')
    f.meta.set(metaSyncError('a1'), 'Invalid credentials (Failure)')
    const warn = detect('accounts', f)
    expect(warn).toMatchObject({ status: 'warn', canRepair: true })
    expect(warn.detail).toContain('a1@example.com')
    expect(warn.detail).toContain('Invalid credentials')
    f.meta.set(metaSyncFails('a1'), '4')
    expect(detect('accounts', f).status).toBe('fail')
    // Auth-looking errors go through reauth; anything else gets a fresh sync bookmark.
    f.meta.set(metaSyncFails('a2'), '3')
    f.meta.set(metaSyncError('a2'), 'Socket timeout while fetching')
    const what = await check('accounts').repair!(f.ctx, detect('accounts', f))
    expect(f.calls).toContain('reauth:a1')
    expect(f.calls).toContain('resetSync:a2')
    expect(what).toContain('Reconnecting a1@example.com')
    expect(f.meta.get(metaSyncFails('a2'))).toBe('0')
  })

  it('accounts: a repair that needs the person is reported, not hidden', async () => {
    const f = fakeCtx({
      accounts: () => [account('o1', 'outlook')],
      reauthAccount: async () => ({ ok: false, message: 'needs you: reconnect o1@example.com in Setup → Email accounts' })
    })
    f.meta.set(metaSyncFails('o1'), '2')
    f.meta.set(metaSyncError('o1'), 'AUTHENTICATIONFAILED')
    await expect(check('accounts').repair!(f.ctx, detect('accounts', f))).rejects.toThrow(/needs you/)
  })

  it('ai: warns after two failed runs, is quiet for the built-in engine, and clears after a good probe', async () => {
    expect(detect('ai', fakeCtx()).status).toBe('ok')
    const f = fakeCtx({}, { ai: { ...DEFAULT_SETTINGS.ai, provider: 'openai' } })
    f.meta.set(META_AI_FAILS, '2')
    f.meta.set(META_AI_ERROR, 'HTTP 429 rate limit')
    const item = detect('ai', f)
    expect(item).toMatchObject({ status: 'warn', canRepair: true })
    expect(item.detail).toContain('AI helper failing; using the built-in engine meanwhile')
    expect(item.detail).toContain('429')
    const builtin = fakeCtx({}, { ai: { ...DEFAULT_SETTINGS.ai, provider: 'builtin' } })
    builtin.meta.set(META_AI_FAILS, '9')
    expect(detect('ai', builtin).status).toBe('ok')
    expect(await check('ai').repair!(f.ctx, item)).toMatch(/answering again/)
    expect(f.meta.get(META_AI_FAILS)).toBe('0')
    const stillDown = fakeCtx({ probeAi: async () => ({ ok: false, error: 'connect ECONNREFUSED' }) }, { ai: { ...DEFAULT_SETTINGS.ai, provider: 'ollama' } })
    stillDown.meta.set(META_AI_FAILS, '3')
    await expect(check('ai').repair!(stillDown.ctx, detect('ai', stillDown))).rejects.toThrow(/ECONNREFUSED/)
  })

  it('schedule: warns when the last run is older than twice the interval', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 49 * 3600 * 1000).toISOString()
    expect(detect('schedule', fakeCtx({}, { lastRunAt: twoDaysAgo })).status).toBe('warn')
    expect(detect('schedule', fakeCtx({}, { lastRunAt: new Date(NOW.getTime() - 40 * 3600 * 1000).toISOString() })).status).toBe('ok')
    expect(detect('schedule', fakeCtx({}, { lastRunAt: twoDaysAgo, schedule: { ...DEFAULT_SETTINGS.schedule, frequency: 'weekly' } })).status).toBe('ok')
    expect(detect('schedule', fakeCtx({}, { lastRunAt: twoDaysAgo, schedule: { ...DEFAULT_SETTINGS.schedule, frequency: 'manual' } })).status).toBe('ok')
    expect(detect('schedule', fakeCtx({}, { lastRunAt: null })).status).toBe('ok')
  })

  it('bridge: fails when on but not listening, and repairs onto the next free port', async () => {
    expect(detect('bridge', fakeCtx({ bridgeRunning: () => false })).status).toBe('ok') // off → nothing to check
    const f = fakeCtx({ bridgeRunning: () => false, portFree: async (p) => p >= 47314 }, { bridgeEnabled: true })
    const item = detect('bridge', f)
    expect(item).toMatchObject({ status: 'fail', canRepair: true })
    expect(item.detail).toContain('47311')
    const what = await check('bridge').repair!(f.ctx, item)
    expect(what).toContain('47314')
    expect(f.settings.bridgePort).toBe(47314)
    expect(f.calls).toContain('syncBridge')
    const none = fakeCtx({ bridgeRunning: () => false, portFree: async () => false }, { bridgeEnabled: true })
    await expect(check('bridge').repair!(none.ctx, detect('bridge', none))).rejects.toThrow(/no free port/)
    expect(BRIDGE_FALLBACK_PORTS[0]).toBe(47312)
    expect(BRIDGE_FALLBACK_PORTS.at(-1)).toBe(47320)
  })

  it('desktop-linux: warns only on Linux with system control on and no xdotool', () => {
    expect(detect('desktop-linux', fakeCtx({ platform: 'linux', which: () => false })).detail).toContain('sudo apt install xdotool')
    expect(detect('desktop-linux', fakeCtx({ platform: 'linux', which: () => false })).status).toBe('warn')
    expect(detect('desktop-linux', fakeCtx({ platform: 'linux', which: () => true })).status).toBe('ok')
    expect(detect('desktop-linux', fakeCtx({ platform: 'win32', which: () => false })).status).toBe('ok')
    expect(detect('desktop-linux', fakeCtx({ platform: 'linux', which: () => false }, { systemControl: 'off' })).status).toBe('ok')
  })

  it('keyring-linux: warns only on Linux when the system keyring is not protecting passwords', () => {
    const noKeyring = detect('keyring-linux', fakeCtx({ platform: 'linux', secureSecrets: () => false }))
    expect(noKeyring).toMatchObject({ status: 'warn', title: 'Password storage', canRepair: false })
    expect(noKeyring.detail).toContain('sudo apt install gnome-keyring')
    expect(noKeyring.detail).toContain('obfuscated, not encrypted')
    expect(detect('keyring-linux', fakeCtx({ platform: 'linux', secureSecrets: () => true })).status).toBe('ok')
    // Windows and macOS always have a keystore; the check stays quiet there even if the probe says no.
    expect(detect('keyring-linux', fakeCtx({ platform: 'win32', secureSecrets: () => false })).status).toBe('ok')
    expect(detect('keyring-linux', fakeCtx({ platform: 'darwin', secureSecrets: () => false })).status).toBe('ok')
  })

  it('disk: warns under 500 MB and stays quiet when it cannot measure', () => {
    expect(detect('disk', fakeCtx({ freeBytes: () => LOW_DISK_BYTES - 1 })).status).toBe('warn')
    expect(detect('disk', fakeCtx({ freeBytes: () => LOW_DISK_BYTES })).status).toBe('ok')
    expect(detect('disk', fakeCtx({ freeBytes: () => null })).status).toBe('ok')
  })

  it('helpers: quiet without helpers, warns without an outbox or after a failed send, never fails, never auto-repairs', () => {
    const sarah = { id: 'h1', name: 'Sarah', relationship: 'daughter', email: 'sarah@example.com', phone: '', carrier: '', level: 'needs' as const, cadence: 'each_brief' as const, weekday: 1, paused: false, addedBy: 'person' as const, createdAt: NOW.toISOString() }
    expect(detect('helpers', fakeCtx()).status).toBe('ok')
    // Helpers but nothing that can send mail (an Outlook account cannot be the outbox).
    const noOutbox = detect('helpers', fakeCtx({ accounts: () => [account('o1', 'outlook')] }, { helpers: [sarah] }))
    expect(noOutbox).toMatchObject({ status: 'warn', canRepair: false, title: 'Trusted helpers' })
    expect(noOutbox.detail).toContain('no account that can send mail')
    expect(noOutbox.detail).toContain('app password')
    // With a Gmail app-password account, all is well.
    expect(detect('helpers', fakeCtx({ accounts: () => [account('g1', 'gmail')] }, { helpers: [sarah] })).status).toBe('ok')
    // The last message to a helper failed: say so in plain words.
    const failed = detect(
      'helpers',
      fakeCtx(
        { accounts: () => [account('g1', 'gmail')], lastHelperSend: () => ({ id: 's1', helperId: 'h1', kind: 'digest', channel: 'email', sentAt: NOW.toISOString(), subject: 'x', text: 'y', triggerKey: null, status: 'failed', error: 'SMTP 535 auth failed' }) },
        { helpers: [sarah] }
      )
    )
    expect(failed.status).toBe('warn')
    expect(failed.detail).toContain('Sarah')
    expect(failed.detail).toContain('535')
    // Paused helpers are never a problem.
    expect(detect('helpers', fakeCtx({ accounts: () => [] }, { helpers: [sarah], helpersPaused: true })).status).toBe('ok')
    expect(detect('helpers', fakeCtx({ accounts: () => [] }, { helpers: [{ ...sarah, paused: true }] })).status).toBe('ok')
    expect(check('helpers').repair).toBeUndefined()
  })

  // ---- Reads attachments and photos (v1.5) ----
  it('attachments: quiet while small and fresh, warns past 2 GB or the keep-days, and the repair clears old files', async () => {
    const day = 86400000
    expect(detect('attachments', fakeCtx())).toMatchObject({ status: 'ok', title: 'Attachment files' }) // lean host: nothing to measure
    expect(detect('attachments', fakeCtx({ attachmentStorage: () => ({ files: 0, bytes: 0, oldestAt: null }) }, { readAttachments: 'off' })).detail).toContain('off')
    const fresh = fakeCtx({ attachmentStorage: () => ({ files: 12, bytes: 40 * 1024 * 1024, oldestAt: new Date(NOW.getTime() - 30 * day).toISOString() }) })
    expect(detect('attachments', fresh)).toMatchObject({ status: 'ok' })
    expect(detect('attachments', fresh).detail).toContain('12 attachment files (40 MB) kept for 90 days')
    // Too old for the keep-days setting.
    const cleared: number[] = []
    const old = fakeCtx({
      attachmentStorage: () => ({ files: 3, bytes: 5 * 1024 * 1024, oldestAt: new Date(NOW.getTime() - 100 * day).toISOString() }),
      cleanupAttachments: (days) => {
        cleared.push(days)
        return { removed: 2, bytes: 3 * 1024 * 1024 }
      }
    })
    const item = detect('attachments', old)
    expect(item).toMatchObject({ status: 'warn', canRepair: true })
    expect(item.detail).toContain('older than the 90 days')
    expect(item.detail).toContain('what they said stays searchable')
    expect(await check('attachments').repair!(old.ctx, item)).toBe('Cleared 3 MB of old attachment files; what they said is still searchable')
    expect(cleared).toEqual([90])
    // A shorter keep-days setting is honoured; too big is a warning too.
    const big = fakeCtx({ attachmentStorage: () => ({ files: 900, bytes: 3 * 1024 * 1024 * 1024, oldestAt: new Date(NOW.getTime() - 10 * day).toISOString() }), cleanupAttachments: () => ({ removed: 0, bytes: 0 }) }, { attachmentsKeepDays: 30 })
    expect(detect('attachments', big).detail).toContain('more than the 2 GB')
    await expect(check('attachments').repair!(big.ctx, detect('attachments', big))).rejects.toThrow(/older than 30 days/)
    // Without a cleaner there is nothing to press.
    expect(detect('attachments', fakeCtx({ attachmentStorage: () => ({ files: 1, bytes: 1, oldestAt: new Date(NOW.getTime() - 400 * day).toISOString() }) })).canRepair).toBe(false)
  })

  it('a check that throws becomes a fail item instead of breaking the report', () => {
    const broken: Check = { id: 'boom', title: 'Boom', detect: () => { throw new Error('kaboom') } }
    const report = runHealth(fakeCtx().ctx, [broken])
    expect(report.ok).toBe(false)
    expect(report.items[0]).toMatchObject({ id: 'boom', status: 'fail' })
    expect(report.items[0].detail).toContain('kaboom')
  })
})

describe('runRepairs', () => {
  it('fixes what it can, marks it fixed, remembers the fix, and leaves the rest honest', async () => {
    const f = fakeCtx({ canWrite: (dir) => dir !== '/tmp/reports', freeBytes: () => 1 }, {})
    const report = await runRepairs(f.ctx)
    const reports = report.items.find((i) => i.id === 'reportsDir')!
    expect(reports.status).toBe('fixed')
    expect(reports.fixedBy).toContain('Reports')
    expect(report.recentFixes).toHaveLength(1)
    expect(report.recentFixes[0]).toBe(reports.fixedBy)
    // Disk has no automatic fix: it stays a warning and the report is not "ok".
    expect(report.items.find((i) => i.id === 'disk')!.status).toBe('warn')
    expect(report.ok).toBe(false)
    // The fix is persisted with a timestamp, so it survives restarts.
    const stored = JSON.parse(f.meta.get(META_FIXES)!)
    expect(stored).toEqual([{ at: NOW.toISOString(), text: reports.fixedBy }])
  })

  it('a failed repair keeps the item and explains why', async () => {
    const f = fakeCtx({ bridgeRunning: () => false, portFree: async () => false }, { bridgeEnabled: true })
    const report = await runRepairs(f.ctx)
    const bridge = report.items.find((i) => i.id === 'bridge')!
    expect(bridge.status).toBe('fail')
    expect(bridge.fixedBy).toBeUndefined()
    expect(bridge.detail).toMatch(/automatic fix did not work: no free port/)
    expect(report.recentFixes).toEqual([])
  })

  it('caps remembered fixes at 20, newest first', () => {
    const f = fakeCtx()
    for (let i = 0; i < 25; i++) recordFix(f.ctx, `fix ${i}`)
    const fixes = readFixes(f.ctx)
    expect(fixes).toHaveLength(20)
    expect(fixes[0].text).toBe('fix 24')
    expect(fixes[19].text).toBe('fix 5')
    f.meta.set(META_FIXES, 'not json')
    expect(readFixes(f.ctx)).toEqual([])
  })
})

describe('error classification', () => {
  it('recognises sign-in failures', () => {
    for (const m of [
      'Invalid credentials (Failure)',
      '[AUTHENTICATIONFAILED] Authentication failed.',
      'LOGIN failed',
      'Request failed with status 401',
      'HTTP 403 Forbidden',
      'no saved password — reconnect this account.'.replace('password', 'credential')
    ]) {
      expect(isAuthError(m), m).toBe(true)
      expect(AUTH_ERROR_RE.test(m)).toBe(true)
    }
    for (const m of ['Socket timeout', 'ECONNRESET', 'Could not check any account.']) expect(isAuthError(m), m).toBe(false)
  })

  it('recognises a stale sync bookmark, but never confuses it with a sign-in problem', () => {
    expect(isStaleSyncError('Gmail history 404: startHistoryId not found')).toBe(true)
    expect(isStaleSyncError('UIDVALIDITY changed')).toBe(true)
    expect(isStaleSyncError('Invalid startHistoryId 404')).toBe(false) // "invalid" wins → treated as auth
    expect(isStaleSyncError('Socket timeout')).toBe(false)
  })

  it('shortReason keeps the first line and trims long messages', () => {
    expect(shortReason(new Error('first\nsecond'))).toBe('first')
    expect(shortReason('x'.repeat(200))).toHaveLength(120)
    expect(shortReason(undefined)).toBe('"unknown error"')
    expect(shortReason(new Error(''))).toBe('unknown error')
  })
})

describe('withAiFallback', () => {
  it('returns the AI result when it works and never calls the fallback', async () => {
    const reasons: string[] = []
    const out = await withAiFallback(async () => 'ai', () => 'rules', (r) => reasons.push(r))
    expect(out).toBe('ai')
    expect(reasons).toEqual([])
  })

  it('falls back to the built-in engine and reports a short reason when the AI fails', async () => {
    const reasons: string[] = []
    const out = await withAiFallback(
      async () => {
        throw new Error('429 Too Many Requests\nstack…')
      },
      () => 'rules',
      (r) => reasons.push(r)
    )
    expect(out).toBe('rules')
    expect(reasons).toEqual(['429 Too Many Requests'])
  })

  it('supports async fallbacks and thrown non-errors', async () => {
    const reasons: string[] = []
    const out = await withAiFallback(async () => Promise.reject('boom'), async () => 42, (r) => reasons.push(r))
    expect(out).toBe(42)
    expect(reasons).toEqual(['boom'])
  })
})

describe('repairs with a real database', () => {
  class FakeSecrets {
    map = new Map<string, string>()
    get(n: string): string | null {
      return this.map.get(n) ?? null
    }
    set(n: string, v: string): void {
      this.map.set(n, v)
    }
    delete(n: string): void {
      this.map.delete(n)
    }
  }

  it('resetSyncState forgets folder bookmarks and the Gmail history id, and only for that account', () => {
    const db = openDatabase(':memory:')
    repo.setSyncState(db, 'a1', 'INBOX', 7, 120)
    repo.setSyncState(db, 'a1', 'Sent', 7, 40)
    repo.setSyncState(db, 'a2', 'INBOX', 3, 9)
    repo.setMeta(db, 'gmail-history:a1', '555')
    repo.setMeta(db, 'gmail-history:a2', '777')
    const calls: string[] = []
    resetSync({ db, secrets: new FakeSecrets(), userData: '/data', startAgent: () => ({ ok: true }), log: (_l, _a, m) => void calls.push(m) }, 'a1')
    expect(repo.getSyncState(db, 'a1', 'INBOX')).toEqual({ uidValidity: 0, lastUid: 0 })
    expect(repo.getSyncState(db, 'a1', 'Sent')).toEqual({ uidValidity: 0, lastUid: 0 })
    expect(repo.getSyncState(db, 'a2', 'INBOX')).toEqual({ uidValidity: 3, lastUid: 9 })
    expect(repo.getMeta(db, 'gmail-history:a1')).toBeNull()
    expect(repo.getMeta(db, 'gmail-history:a2')).toBe('777')
    expect(calls).toEqual(['reset sync state'])
    expect(repo.bumpCounter(db, 'health:ai')).toBe(1)
    expect(repo.bumpCounter(db, 'health:ai')).toBe(2)
    repo.setMeta(db, 'health:ai', 'garbage')
    expect(repo.bumpCounter(db, 'health:ai')).toBe(1)
  })

  it('reauthAccount uses the Assistant only for app-password providers with a saved sign-in', async () => {
    const db = openDatabase(':memory:')
    const secrets = new FakeSecrets()
    const started: string[] = []
    const deps = { db, secrets, userData: '/data', startAgent: (i: { recipeId?: string; params?: Record<string, string> }) => (started.push(`${i.recipeId}:${i.params?.email}`), { ok: true }) }
    repo.upsertAccount(db, account('g1', 'gmail'))
    repo.upsertAccount(db, account('o1', 'outlook'))
    // No saved sign-in yet → the person has to do it.
    expect(await reauthAccount(deps, 'g1')).toEqual({ ok: false, message: 'needs you: reconnect g1@example.com in Setup → Email accounts' })
    saveSignin(db, secrets, 'g1@example.com', 'hunter2')
    expect(await reauthAccount(deps, 'g1')).toEqual({ ok: true, message: 'Reconnecting g1@example.com on its own…' })
    expect(started).toEqual(['gmail-app-password:g1@example.com'])
    // Outlook has no app-password recipe, even with a sign-in.
    saveSignin(db, secrets, 'o1@example.com', 'hunter2')
    expect((await reauthAccount(deps, 'o1')).ok).toBe(false)
    expect((await reauthAccount(deps, 'nope')).message).toMatch(/no longer connected/)
    // A busy Assistant is reported, not retried.
    const busy = { ...deps, startAgent: () => ({ ok: false, summary: 'The assistant is already working on something.' }) }
    expect(await reauthAccount(busy, 'g1')).toMatchObject({ ok: false, message: expect.stringContaining('already working') })
  })

  it('createHealthContext asks the secret store whether the keyring protects passwords', () => {
    const db = openDatabase(':memory:')
    const base = { db, userData: '/data', startAgent: () => ({ ok: true }), bridgeRunning: () => true, syncBridge: () => {}, probeAi: async () => ({ ok: true }) }
    // A store without the probe (in-memory fakes) is assumed fine; a real store's answer is passed through.
    expect(createHealthContext({ ...base, secrets: new FakeSecrets() }).secureSecrets()).toBe(true)
    const insecure = Object.assign(new FakeSecrets(), { isSecure: () => false })
    expect(createHealthContext({ ...base, secrets: insecure, platform: 'linux' }).secureSecrets()).toBe(false)
    expect(createHealthContext({ ...base, secrets: insecure, platform: 'linux' }).platform).toBe('linux')
  })

  it('which() looks through PATH', () => {
    expect(which('definitely-not-a-real-binary-xyz')).toBe(false)
    expect(which('node', { PATH: process.env.PATH }, process.platform)).toBe(true)
  })
})
