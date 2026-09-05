import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { signInWithDeviceCode } from './mail/graph'
import { randomUUID } from 'node:crypto'
import type { DB } from './db/index'
import * as repo from './db/repo'
import { SecretStore, accountSecretName, providerSecretName } from './secrets'
import { loadSettings, saveSettings } from './settings'
import { PROVIDER_PRESETS, testConnection } from './mail/imap'
import { testProvider, PROVIDER_LABELS, DEFAULT_MODELS, LOCAL_PROVIDERS } from './ai/provider'
import { PROFILES } from './profiles/profiles'
import { loadCustomSkills, resolveSkills } from './skills/engine'
import { existsSync, mkdirSync } from 'node:fs'
import type { AccountConfig, AppSettings } from '../shared/types'

export interface IpcContext {
  db: DB
  secrets: SecretStore
  runNow: () => Promise<unknown>
  isRunning: () => boolean
  skillsDir: string
  broadcast: (channel: string, payload: unknown) => void
}

export function registerIpc(ctx: IpcContext): void {
  const { db, secrets } = ctx

  ipcMain.handle('settings:get', () => loadSettings(db))
  ipcMain.handle('settings:set', (_e, settings: AppSettings) => {
    saveSettings(db, settings)
    return loadSettings(db)
  })

  ipcMain.handle('profiles:list', () => Object.values(PROFILES).map((p) => ({ id: p.id, name: p.name, pulseName: p.pulseName })))

  ipcMain.handle('accounts:list', () => repo.listAccounts(db))
  ipcMain.handle('accounts:presets', () => PROVIDER_PRESETS)
  ipcMain.handle(
    'accounts:add',
    async (
      _e,
      input: { label: string; email: string; provider: string; host: string; port: number; password: string; sentFolder: string }
    ) => {
      const account: AccountConfig = {
        id: randomUUID(),
        label: input.label || input.email,
        email: input.email.trim(),
        provider: (input.provider as AccountConfig['provider']) || 'imap',
        host: input.host.trim(),
        port: input.port || 993,
        folders: input.sentFolder ? ['INBOX', input.sentFolder] : ['INBOX'],
        createdAt: new Date().toISOString()
      }
      await testConnection(account, input.password)
      repo.upsertAccount(db, account)
      secrets.set(accountSecretName(account.id), input.password)
      return account
    }
  )
  ipcMain.handle('accounts:outlookSignIn', async () => {
    const settings = loadSettings(db)
    const clientId = settings.microsoftClientId || process.env['INBOXSCOUT_MS_CLIENT_ID'] || ''
    const id = randomUUID()
    let cache: string | null = null
    const store = { load: () => cache, save: (v: string) => void (cache = v) }
    const { email, homeAccountId } = await signInWithDeviceCode(clientId, store, (info) =>
      ctx.broadcast('outlook:deviceCode', info)
    )
    const account: AccountConfig = {
      id,
      label: email,
      email,
      provider: 'outlook',
      host: 'graph.microsoft.com',
      port: 443,
      folders: ['inbox', 'sentitems'],
      createdAt: new Date().toISOString()
    }
    repo.upsertAccount(db, account)
    if (cache) secrets.set(accountSecretName(id), cache)
    repo.setMeta(db, `graph-home:${id}`, homeAccountId)
    return account
  })
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return true
  })
  ipcMain.handle('accounts:remove', (_e, id: string) => {
    repo.deleteAccount(db, id)
    secrets.delete(accountSecretName(id))
    return true
  })

  ipcMain.handle('ai:providers', () => {
    const settings = loadSettings(db)
    return Object.entries(PROVIDER_LABELS).map(([id, label]) => {
      const local = LOCAL_PROVIDERS.includes(id as any)
      return {
        id,
        ...label,
        defaultModel: DEFAULT_MODELS[id as keyof typeof DEFAULT_MODELS],
        local,
        connected: local ? true : id === 'custom' ? !!settings.ai.customBaseUrl : !!secrets.get(providerSecretName(id)),
        active: settings.ai.provider === id
      }
    })
  })
  ipcMain.handle('ai:connect', async (_e, input: { provider: string; apiKey: string; baseUrl?: string }) => {
    const settings = loadSettings(db)
    const ai = { ...settings.ai, provider: input.provider as any }
    if (input.provider === 'custom' && input.baseUrl) ai.customBaseUrl = input.baseUrl.trim()
    const result = await testProvider(ai, input.apiKey)
    if (result.ok) {
      if (input.apiKey) secrets.set(providerSecretName(input.provider), input.apiKey)
      saveSettings(db, { ...settings, ai })
    }
    return result
  })
  ipcMain.handle('ai:disconnect', (_e, provider: string) => {
    secrets.delete(providerSecretName(provider))
    return true
  })
  ipcMain.handle('ai:detect', async () => {
    const settings = loadSettings(db)
    const { detectEnvKeys, detectLocalServers } = await import('./ai/detect')
    const env = detectEnvKeys(process.env)
    const local = await detectLocalServers(settings.ai.ollamaBaseUrl)
    // Hide detections for providers already connected or active.
    return [...local, ...env]
      .filter((d) => d.provider !== settings.ai.provider)
      .filter((d) => (d.kind === 'env_key' ? !secrets.get(providerSecretName(d.provider)) : true))
      .map((d) => ({ provider: d.provider, kind: d.kind, detail: d.detail, hasKey: !!d.apiKey }))
  })
  ipcMain.handle('ai:connectDetected', async (_e, provider: string) => {
    const settings = loadSettings(db)
    const { detectEnvKeys } = await import('./ai/detect')
    const envHit = detectEnvKeys(process.env).find((d) => d.provider === provider)
    const ai = { ...settings.ai, provider: provider as any }
    const result = await testProvider(ai, envHit?.apiKey ?? '')
    if (result.ok) {
      if (envHit?.apiKey) secrets.set(providerSecretName(provider), envHit.apiKey)
      saveSettings(db, { ...settings, ai })
    }
    return result
  })
  ipcMain.handle('ai:openKeyPage', (_e, provider: string) => {
    const label = PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS]
    if (label) shell.openExternal(label.keyUrl)
    return true
  })

  ipcMain.handle('skills:list', () => {
    const settings = loadSettings(db)
    const custom = loadCustomSkills(ctx.skillsDir)
    const { all, enabled } = resolveSkills(settings.profileId, settings.enabledSkillIds, custom.skills)
    const enabledIds = new Set(enabled.map((s) => s.id))
    return {
      skills: all.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        description: s.description,
        enabled: enabledIds.has(s.id),
        custom: !!s.custom,
        hasAgent: !!s.agent
      })),
      errors: custom.errors,
      folder: ctx.skillsDir
    }
  })
  ipcMain.handle('skills:setEnabled', (_e, ids: string[]) => {
    const settings = loadSettings(db)
    saveSettings(db, { ...settings, enabledSkillIds: ids })
    return true
  })
  ipcMain.handle('skills:openFolder', () => {
    if (!existsSync(ctx.skillsDir)) mkdirSync(ctx.skillsDir, { recursive: true })
    return shell.openPath(ctx.skillsDir)
  })
  ipcMain.handle('brief:latest', () => repo.latestBrief(db))

  ipcMain.handle('run:now', () => {
    if (ctx.isRunning()) return { started: false, reason: 'A run is already in progress.' }
    void ctx.runNow()
    return { started: true }
  })
  ipcMain.handle('runs:list', () => repo.listRuns(db, 20))

  ipcMain.handle('reports:list', () => repo.listReports(db, 30))
  ipcMain.handle('reports:get', (_e, id: string) => repo.getReport(db, id))
  ipcMain.handle('reports:openFile', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('reports:exportPdf', async (_e, id: string) => {
    const report = repo.getReport(db, id)
    if (!report) return { ok: false, error: 'Report not found.' }
    const settings = loadSettings(db)
    const stamp = report.createdAt.slice(0, 10)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save brief as PDF',
      defaultPath: join(settings.reportsDir || '', `InboxScout-brief-${stamp}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { ok: false }
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(report.html)}`)
      const pdf = await win.webContents.printToPDF({ printBackground: true })
      writeFileSync(filePath, pdf)
      return { ok: true, filePath }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    } finally {
      win.destroy()
    }
  })
  ipcMain.handle('issues:resolve', (_e, id: string) => {
    repo.resolveIssue(db, id)
    return true
  })

  ipcMain.handle('issues:list', () => repo.listIssues(db, false))
  ipcMain.handle('projects:list', () => repo.listProjects(db, false))
  ipcMain.handle('messages:recent', (_e, limit: number) =>
    repo.recentMessagesWithClassification(db, Math.min(limit || 50, 200))
  )
  ipcMain.handle('messages:search', (_e, query: string) => {
    try {
      return repo.searchMessages(db, query, 50)
    } catch {
      return []
    }
  })
  ipcMain.handle('messages:correct', (_e, input: { messageId: string; category: string }) => {
    repo.setCorrection(db, input.messageId, input.category, null)
    return true
  })
}
