import { ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import type { DB } from './db/index'
import * as repo from './db/repo'
import { SecretStore, accountSecretName, providerSecretName } from './secrets'
import { loadSettings, saveSettings } from './settings'
import { PROVIDER_PRESETS, testConnection } from './mail/imap'
import { testProvider, PROVIDER_LABELS, DEFAULT_MODELS } from './ai/provider'
import { PROFILES } from './profiles/profiles'
import type { AccountConfig, AppSettings } from '../shared/types'

export interface IpcContext {
  db: DB
  secrets: SecretStore
  runNow: () => Promise<unknown>
  isRunning: () => boolean
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
  ipcMain.handle('accounts:remove', (_e, id: string) => {
    repo.deleteAccount(db, id)
    secrets.delete(accountSecretName(id))
    return true
  })

  ipcMain.handle('ai:providers', () => {
    const settings = loadSettings(db)
    return Object.entries(PROVIDER_LABELS).map(([id, label]) => ({
      id,
      ...label,
      defaultModel: DEFAULT_MODELS[id as keyof typeof DEFAULT_MODELS],
      connected: id === 'ollama' ? true : !!secrets.get(providerSecretName(id)),
      active: settings.ai.provider === id
    }))
  })
  ipcMain.handle('ai:connect', async (_e, input: { provider: string; apiKey: string }) => {
    const settings = loadSettings(db)
    const result = await testProvider({ ...settings.ai, provider: input.provider as any }, input.apiKey)
    if (result.ok) {
      secrets.set(providerSecretName(input.provider), input.apiKey)
      saveSettings(db, { ...settings, ai: { ...settings.ai, provider: input.provider as any } })
    }
    return result
  })
  ipcMain.handle('ai:disconnect', (_e, provider: string) => {
    secrets.delete(providerSecretName(provider))
    return true
  })
  ipcMain.handle('ai:openKeyPage', (_e, provider: string) => {
    const label = PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS]
    if (label) shell.openExternal(label.keyUrl)
    return true
  })

  ipcMain.handle('run:now', () => {
    if (ctx.isRunning()) return { started: false, reason: 'A run is already in progress.' }
    void ctx.runNow()
    return { started: true }
  })
  ipcMain.handle('runs:list', () => repo.listRuns(db, 20))

  ipcMain.handle('reports:list', () => repo.listReports(db, 30))
  ipcMain.handle('reports:get', (_e, id: string) => repo.getReport(db, id))
  ipcMain.handle('reports:openFile', (_e, path: string) => shell.openPath(path))

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
