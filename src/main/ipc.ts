import { BrowserWindow, Notification, app, dialog, ipcMain, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { signInWithDeviceCode } from './mail/graph'
import { signInWithGoogle, GMAIL_FOLDER } from './mail/gmail'
import { DRIVE_SCOPE } from './mail/drive'
import { googleClient, microsoftClientId, hasBakedClients } from './config'
import { GOOGLE_STEPS, MICROSOFT_STEPS, SetupAssistant, type SetupKind } from './setup/assistant'
import { AppPasswordWizard, type AppPasswordProvider } from './setup/appPasswordWindow'
import { explainConnectError } from '../shared/appPassword'
import { eventsFromBrief, toCsv, toIcs, trackerRows } from './reports/exports'
import { SMS_GATEWAYS, pickOutbox, sendMail, smsAddress } from './delivery/email'
import { AgentRunner } from './agent/runner'
import { RECIPES } from './agent/policy'
import { DesktopControl } from './desktop/control'
import { resolveModel } from './ai/provider'
import { bridgeInfo, regenerateBridgeToken, syncBridge, type BridgeDeps } from './api/local'
import { phoneInfo, regeneratePhoneToken, syncPhone } from './api/phone'
import { deleteSignin, getSignin, listSignins, pickSigninForHost, saveSignin } from './signins'
import { speakWithOs } from './voice'
import { ask, askAndWait, invalidateAskCache, type AskDeps } from './ask/index'
import { randomUUID } from 'node:crypto'
import type { DB } from './db/index'
import * as repo from './db/repo'
import { SecretStore, accountSecretName, providerSecretName } from './secrets'
import { loadSettings, saveSettings } from './settings'
import { PROVIDER_PRESETS, testConnection } from './mail/imap'
import { testProvider, PROVIDER_LABELS, DEFAULT_MODELS, LOCAL_PROVIDERS } from './ai/provider'
import { PROFILES, PROFILE_GROUPS, PROFILE_LIST, getProfile, type WorkProfile } from './profiles/profiles'
import { detectNow, dismissSuggestion, readSuggestion } from './profiles/auto'
import { acknowledgeLevel, evaluateLevel, recordFeature, recordTab, revertLevel } from './usage'
import { loadCustomSkills, resolveSkills } from './skills/engine'
import { existsSync, mkdirSync } from 'node:fs'
import { CHECKS, runHealth, runRepairs } from './health/checks'
import { createHealthContext, markAccountHealthy, reauthAccount as repairReauth } from './health/repair'
import { log, openInFolder, readTail } from './health/diagnostics'
import type { AccountConfig, AppSettings, AttachmentInfo, HealthReport } from '../shared/types'
// Reads attachments and photos (v1.5)
import { attachmentsFor } from './attachments/index'
import { VISION_PROVIDERS, findAttachment, publicAttachment } from './pipeline/attachments'
// Trusted helpers (v1.4, Part A)
import { addHelper, cancelAsk, listHelperLog, pauseAll, removeHelper, scheduleAsk, updateHelper, type AskRequest, type HelperDeps, type HelperPatch, type NewHelper } from './helpers/index'

export interface IpcContext {
  db: DB
  secrets: SecretStore
  runNow: () => Promise<unknown>
  isRunning: () => boolean
  skillsDir: string
  broadcast: (channel: string, payload: unknown) => void
}

export interface IpcHooks {
  agent: AgentRunner
  /** Self-healing: check everything and apply the safe fixes. index.ts calls it after every finished run. */
  afterRun: () => Promise<HealthReport>
  /** Self-healing: get a fresh app password for an account whose sign-in stopped working (used by the pipeline). */
  reauthAccount: (accountId: string) => Promise<{ ok: boolean; message: string }>
}

export function registerIpc(ctx: IpcContext): IpcHooks {
  const { db, secrets } = ctx

  // ---- Full system control (screen, mouse/keyboard, apps, commands, home-folder files), gated by popups ----
  const desktop = new DesktopControl({ db, getWindow: () => BrowserWindow.getAllWindows()[0] ?? null, homeDir: app.getPath('home') })

  // ---- Assistant browser (AI-operated browser with guardrails) ----
  // VISION_PROVIDERS is shared with the attachment reader (pipeline/attachments.ts) so both decide "can it see images?" the same way.
  const agent = new AgentRunner({
    desktop,
    getModel: async () => {
      const settings = loadSettings(db)
      if (settings.ai.provider === 'builtin') return null
      const apiKey = secrets.get(providerSecretName(settings.ai.provider)) ?? ''
      if (!apiKey && !LOCAL_PROVIDERS.includes(settings.ai.provider) && settings.ai.provider !== 'custom') return null
      try {
        return { model: resolveModel(settings.ai, apiKey), vision: VISION_PROVIDERS.has(settings.ai.provider) }
      } catch {
        return null
      }
    },
    onEvent: (e) => ctx.broadcast('agent:event', e)
  })
  const hostOf = (url: string): string => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }
  /**
   * Test an app password against the service, then save the account (v1.5.6: one path shared by the
   * connect form, the Assistant, and the Get-it-for-me window). Throws a plain-language sentence.
   */
  const connectWithAppPassword = async (provider: AppPasswordProvider | 'imap', email: string, password: string, custom?: { host: string; port: number }): Promise<string> => {
    const preset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.imap
    const host = custom?.host ?? preset.host
    const port = custom?.port ?? preset.port
    // Reconnecting an account that already exists (self-healing) keeps its id, folders, and history.
    const existing = repo.listAccounts(db).find((a) => a.email.toLowerCase() === email.toLowerCase() && a.provider === provider)
    const account: AccountConfig = existing ?? {
      id: randomUUID(),
      label: email,
      email,
      provider,
      host,
      port,
      folders: preset.sentFolder ? ['INBOX', preset.sentFolder] : ['INBOX'],
      createdAt: new Date().toISOString()
    }
    try {
      await testConnection(account, password)
    } catch (err) {
      log('warn', 'accounts', 'connection test failed', { provider, err: String((err as Error)?.message ?? err) })
      throw new Error(explainConnectError(provider, err, { hasGetItForMe: provider !== 'imap' }))
    }
    repo.upsertAccount(db, account)
    secrets.set(accountSecretName(account.id), password)
    markAccountHealthy(db, account.id)
    log('info', 'health', existing ? 'account reconnected with a fresh app password' : 'account connected', { accountId: account.id })
    return existing ? `✅ ${email} is reconnected and working again.` : `✅ ${email} is connected. You're all set.`
  }
  /** Finish a recipe's job with what the assistant captured (connect the account, save IDs). */
  const finishRecipe = async (recipeId: string, params: Record<string, string>, captured: Record<string, string>): Promise<string> => {
    const recipe = RECIPES.find((r) => r.id === recipeId)
    if (!recipe) return ''
    if (recipe.captures === 'appPassword' && captured.appPassword && params.email) {
      return connectWithAppPassword(recipe.provider ?? 'imap', params.email.trim(), captured.appPassword)
    }
    if (recipe.captures === 'googleClient' && captured.googleClientId) {
      const s = loadSettings(db)
      saveSettings(db, { ...s, googleClientId: captured.googleClientId, googleClientSecret: captured.googleClientSecret ?? s.googleClientSecret })
      return '✅ Google sign-in is configured. "Sign in with Google" now works.'
    }
    if (recipe.captures === 'microsoftClientId' && captured.microsoftClientId) {
      const s = loadSettings(db)
      saveSettings(db, { ...s, microsoftClientId: captured.microsoftClientId })
      return '✅ Microsoft sign-in is configured. "Sign in with Microsoft" now works.'
    }
    return ''
  }
  const startAgent = (input: {
    recipeId?: string
    params?: Record<string, string>
    goal?: string
    startUrl?: string
    allowedDomains?: string[]
    /** Saved sign-in to use; defaults to the recipe's email or a saved sign-in matching the site. */
    signinEmail?: string
  }): { ok: boolean; summary?: string } => {
    const recipe = input.recipeId ? (RECIPES.find((r) => r.id === input.recipeId) ?? null) : null
    const params = input.params ?? {}
    const settings = loadSettings(db)
    const base = recipe
      ? { recipe, params, goal: recipe.goal(params), startUrl: recipe.startUrl(params), allowedDomains: recipe.allowedDomains }
      : {
          recipe: null,
          params,
          goal: input.goal ?? '',
          startUrl: input.startUrl ?? 'about:blank',
          allowedDomains: input.allowedDomains?.length ? input.allowedDomains : [hostOf(input.startUrl ?? '')].filter(Boolean)
        }
    const wanted = (input.signinEmail || params.email || '').trim()
    const signin =
      settings.assistantAutonomy === 'careful'
        ? null
        : (wanted ? getSignin(db, secrets, wanted) : null) ?? pickSigninForHost(db, secrets, hostOf(base.startUrl))
    const task = { ...base, autonomy: settings.assistantAutonomy, signin, systemControl: settings.systemControl === 'on' }
    if (!task.goal) return { ok: false, summary: 'Tell the assistant what to do.' }
    if (agent.isBusy()) return { ok: false, summary: 'The assistant is already working on something.' }
    // Runs in the background; the app follows along via agent:event.
    void agent.start(task).then(async (result) => {
      if (!result.ok || !recipe) return
      try {
        const msg = await finishRecipe(recipe.id, params, result.captured)
        if (msg) ctx.broadcast('agent:event', { type: 'status', status: 'done', message: msg })
      } catch (err: any) {
        ctx.broadcast('agent:event', { type: 'error', message: `The assistant finished, but connecting failed: ${String(err?.message ?? err)}` })
      }
    })
    return { ok: true }
  }
  ipcMain.handle('agent:recipes', () => ({
    recipes: RECIPES.map((r) => ({ id: r.id, name: r.name, icon: r.icon, description: r.description, params: r.params })),
    aiReady: loadSettings(db).ai.provider !== 'builtin',
    autonomy: loadSettings(db).assistantAutonomy,
    signins: listSignins(db)
  }))
  ipcMain.handle('agent:setAutonomy', (_e, autonomy: AppSettings['assistantAutonomy']) => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, assistantAutonomy: ['careful', 'signin', 'full'].includes(autonomy) ? autonomy : s.assistantAutonomy })
    return loadSettings(db).assistantAutonomy
  })
  ipcMain.handle('signins:list', () => listSignins(db))
  ipcMain.handle('signins:save', (_e, email: string, password: string) => saveSignin(db, secrets, email, password))
  ipcMain.handle('signins:delete', (_e, email: string) => deleteSignin(db, secrets, email))
  ipcMain.handle('agent:start', (_e, input) => startAgent(input))
  ipcMain.handle('agent:answer', (_e, text: string) => {
    agent.answer(text)
    return true
  })
  ipcMain.handle('agent:continue', () => {
    agent.continueAfterHandoff()
    return true
  })
  ipcMain.handle('agent:stop', () => {
    agent.stop()
    return true
  })
  ipcMain.handle('agent:status', () => agent.getStatus())
  ipcMain.handle('agent:closeWindow', () => {
    agent.closeWindow()
    return true
  })

  // ---- Local bridge for Hermes and other agents ----
  const listSkillsPlain = (): { id: string; name: string; description: string; enabled: boolean; builtin: boolean }[] => {
    const settings = loadSettings(db)
    const custom = loadCustomSkills(ctx.skillsDir)
    const { all, enabled } = resolveSkills(settings.profileId, settings.enabledSkillIds, custom.skills)
    const enabledIds = new Set(enabled.map((s) => s.id))
    return all.map((s) => ({ id: s.id, name: s.name, description: s.description, enabled: enabledIds.has(s.id), builtin: !s.custom }))
  }
  // ---- Self-healing: quiet checks, automatic repairs, diagnostics ----
  const userData = app.getPath('userData')
  const probeAi = async (): Promise<{ ok: boolean; error?: string }> => {
    const s = loadSettings(db)
    if (s.ai.provider === 'builtin') return { ok: true }
    return testProvider(s.ai, secrets.get(providerSecretName(s.ai.provider)) ?? '')
  }
  const repairDeps = { db, secrets, userData, startAgent, log }
  const reauthAccount = (accountId: string): Promise<{ ok: boolean; message: string }> => repairReauth(repairDeps, accountId)
  const healthCtx = createHealthContext({
    ...repairDeps,
    bridgeRunning: () => bridgeInfo(bridgeDeps).running,
    syncBridge: () => syncBridge(bridgeDeps),
    probeAi
  })
  const healthStatus = (): HealthReport => runHealth(healthCtx, CHECKS)
  const healthRepair = async (): Promise<HealthReport> => {
    const report = await runRepairs(healthCtx, CHECKS)
    const fixed = report.items.filter((i) => i.status === 'fixed')
    const wrong = report.items.filter((i) => i.status === 'warn' || i.status === 'fail')
    if (fixed.length || wrong.length) {
      log(wrong.length ? 'warn' : 'info', 'health', `checked: ${fixed.length} fixed, ${wrong.length} still need attention`, {
        fixed: fixed.map((i) => i.fixedBy),
        wrong: wrong.map((i) => `${i.id}: ${i.detail}`)
      })
    }
    ctx.broadcast('health:report', report)
    return report
  }
  ipcMain.handle('health:status', () => healthStatus())
  ipcMain.handle('health:repair', () => healthRepair())
  ipcMain.handle('diagnostics:text', () => readTail(200))
  ipcMain.handle('diagnostics:open', () => openInFolder())

  // ---- Conversation (v1.4, Part B): "Ask about your mail…" — local answer first, AI answer later ----
  // The ask engine never touches the SecretStore: the model closure below is the only thing that reads a key.
  const ownerName = (): string => {
    const email = repo.listAccounts(db)[0]?.email ?? ''
    const local = email.split('@')[0]?.split(/[._-]/)[0] ?? ''
    return local ? local[0].toUpperCase() + local.slice(1) : ''
  }
  const askDeps: AskDeps = {
    db,
    settings: () => loadSettings(db),
    getModel: () => {
      const settings = loadSettings(db)
      if (settings.ai.provider === 'builtin') return null
      const apiKey = secrets.get(providerSecretName(settings.ai.provider)) ?? ''
      if (!apiKey && !LOCAL_PROVIDERS.includes(settings.ai.provider) && settings.ai.provider !== 'custom') return null
      try {
        return resolveModel(settings.ai, apiKey)
      } catch {
        return null
      }
    },
    healthStatus: () => healthStatus(),
    get ownerName() {
      return ownerName()
    },
    log: (level, message, detail) => log(level, 'ask', message, detail)
  }
  /** Returns the local answer at once; the AI answer (when one comes) arrives on `ask:answer` with the same id. */
  ipcMain.handle('ask:question', async (_e, input: { q: string; id?: string } | string) => {
    const q = typeof input === 'string' ? input : String(input?.q ?? '')
    const id = (typeof input === 'object' && input?.id) || randomUUID()
    let aiPending = false
    const answer = await ask(askDeps, q, {
      onAi: (a) => ctx.broadcast('ask:answer', { id, answer: a })
    })
    // ask() only calls onAi when the AI is configured; tell the renderer whether to show "thinking…".
    try {
      aiPending = loadSettings(db).ai.provider !== 'builtin' && askDeps.getModel() !== null
    } catch {
      aiPending = false
    }
    return { id, answer, aiPending }
  })

  const bridgeDeps: BridgeDeps = {
    db,
    secrets,
    ask: (q) => askAndWait(askDeps, q),
    version: app.getVersion(),
    agent,
    desktop,
    startAgent,
    health: { status: healthStatus, repair: healthRepair },
    runNow: () => ctx.runNow(),
    isRunning: () => ctx.isRunning(),
    connectAccount: async (input) => {
      const provider = (['gmail', 'yahoo', 'icloud', 'imap'].includes(input.provider) ? input.provider : 'imap') as AccountConfig['provider']
      const preset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.imap
      const account: AccountConfig = {
        id: randomUUID(),
        label: input.label || input.email,
        email: input.email.trim(),
        provider,
        host: (input.host || preset.host).trim(),
        port: Number(input.port) || preset.port || 993,
        folders: preset.sentFolder ? ['INBOX', preset.sentFolder] : ['INBOX'],
        createdAt: new Date().toISOString()
      }
      await testConnection(account, input.password)
      repo.upsertAccount(db, account)
      secrets.set(accountSecretName(account.id), input.password)
      return account
    },
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body: body.slice(0, 240) }).show()
    },
    speak: (text) => speakWithOs(text),
    listSkills: listSkillsPlain,
    setEnabledSkills: (ids) => {
      const s = loadSettings(db)
      saveSettings(db, { ...s, enabledSkillIds: ids })
    },
    // Reads attachments (v1.5): open_attachment on the desktop only.
    openPath: (path) => shell.openPath(path)
  }
  ipcMain.handle('bridge:info', () => bridgeInfo(bridgeDeps))
  ipcMain.handle('bridge:setEnabled', (_e, enabled: boolean) => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, bridgeEnabled: enabled })
    syncBridge(bridgeDeps)
    return bridgeInfo(bridgeDeps)
  })
  ipcMain.handle('bridge:regenerate', () => {
    regenerateBridgeToken(bridgeDeps)
    syncBridge(bridgeDeps)
    return bridgeInfo(bridgeDeps)
  })
  ipcMain.handle('bridge:setAccess', (_e, access: AppSettings['bridgeAccess']) => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, bridgeAccess: access === 'read' ? 'read' : 'full' })
    return bridgeInfo(bridgeDeps)
  })
  syncBridge(bridgeDeps)

  // ---- InboxScout on your phone: the same ops machinery, its own server and key (api/phone.ts) ----
  ipcMain.handle('phone:info', () => phoneInfo(bridgeDeps))
  ipcMain.handle('phone:set', (_e, on: boolean) => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, phoneAccess: on ? 'on' : 'off' })
    syncPhone(bridgeDeps)
    return phoneInfo(bridgeDeps)
  })
  ipcMain.handle('phone:regenerate', () => {
    regeneratePhoneToken(bridgeDeps)
    return phoneInfo(bridgeDeps)
  })
  syncPhone(bridgeDeps)

  // First health pass shortly after startup (the bridge needs a moment to start listening before it is judged).
  setTimeout(() => void healthRepair().catch((err) => log('error', 'health', 'startup check failed', err)), 4000)

  ipcMain.handle('settings:get', () => loadSettings(db))
  ipcMain.handle('settings:set', (_e, settings: AppSettings) => {
    saveSettings(db, settings)
    syncBridge(bridgeDeps)
    syncPhone(bridgeDeps)
    return loadSettings(db)
  })

  const profileSummary = (p: WorkProfile): object => ({ id: p.id, name: p.name, group: p.group, icon: p.icon, tagline: p.tagline, pulseName: p.pulseName })
  ipcMain.handle('profiles:list', () => PROFILE_LIST.map(profileSummary))
  ipcMain.handle('profiles:groups', () => PROFILE_GROUPS)
  /** Current profile, the "choose for me" switch, and any pending suggestion from the last scan. */
  ipcMain.handle('profiles:status', () => {
    const s = loadSettings(db)
    const suggestion = readSuggestion(db)
    const pending = suggestion && !suggestion.dismissed && suggestion.id !== s.profileId ? suggestion : null
    return { profileId: s.profileId, profileAuto: s.profileAuto, suggestion: pending ? { ...pending, name: getProfile(pending.id).name } : null }
  })
  /** Person picks a profile by hand: lock it unless they say "choose for me". */
  ipcMain.handle('profiles:choose', (_e, id: string | 'auto') => {
    const s = loadSettings(db)
    if (id === 'auto') {
      saveSettings(db, { ...s, profileAuto: true })
      const d = detectNow(db)
      if (d && d.id !== s.profileId) saveSettings(db, { ...loadSettings(db), profileId: d.id, enabledSkillIds: null })
    } else if (PROFILES[id]) {
      saveSettings(db, { ...s, profileId: id, profileAuto: false, enabledSkillIds: null })
      dismissSuggestion(db)
    }
    return loadSettings(db)
  })
  ipcMain.handle('profiles:detect', () => {
    const d = detectNow(db)
    return d ? { ...d, name: getProfile(d.id).name } : null
  })
  ipcMain.handle('profiles:dismiss', () => {
    dismissSuggestion(db)
    return true
  })

  ipcMain.handle('accounts:list', () => repo.listAccounts(db))
  ipcMain.handle('accounts:presets', () => PROVIDER_PRESETS)
  ipcMain.handle(
    'accounts:add',
    async (
      _e,
      input: { label: string; email: string; provider: string; host: string; port: number; password: string; sentFolder: string }
    ) => {
      const provider = (input.provider as AccountConfig['provider']) || 'imap'
      const email = input.email.trim()
      const custom = provider === 'imap' ? { host: input.host.trim(), port: input.port || 993 } : undefined
      await connectWithAppPassword(provider as AppPasswordProvider | 'imap', email, input.password, custom)
      return repo.listAccounts(db).find((a) => a.email.toLowerCase() === email.toLowerCase() && a.provider === provider) ?? null
    }
  )
  // ---- "Get it for me" without an AI helper: the service's own page in an InboxScout window, watched for the password ----
  const appPasswordWizard = new AppPasswordWizard({
    emit: (e) => ctx.broadcast('appPassword:event', e),
    finish: (provider, email, password) => connectWithAppPassword(provider, email, password),
    log: (level, message, extra) => log(level, 'accounts', message, extra)
  })
  ipcMain.handle('appPassword:start', (_e, input: { provider: string; email: string }) => {
    if (agent.isBusy()) return { ok: false, message: 'The assistant is already working on something. Wait for it to finish, or stop it.' }
    return appPasswordWizard.start(input.provider as AppPasswordProvider, String(input.email ?? ''))
  })
  ipcMain.handle('appPassword:stop', () => {
    appPasswordWizard.stop()
    return true
  })
  ipcMain.handle('accounts:outlookSignIn', async () => {
    const settings = loadSettings(db)
    const clientId = microsoftClientId(settings)
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
  ipcMain.handle('accounts:googleSignIn', async () => {
    const settings = loadSettings(db)
    const { clientId, clientSecret } = googleClient(settings)
    const { email, tokens } = await signInWithGoogle(
      clientId,
      clientSecret,
      (url) => void shell.openExternal(url),
      settings.googleDriveExport ? [DRIVE_SCOPE] : []
    )
    const account: AccountConfig = {
      id: randomUUID(),
      label: email,
      email,
      provider: 'gmailapi',
      host: 'gmail.googleapis.com',
      port: 443,
      folders: [GMAIL_FOLDER],
      createdAt: new Date().toISOString()
    }
    repo.upsertAccount(db, account)
    secrets.set(accountSecretName(account.id), JSON.stringify(tokens))
    return account
  })
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^(https?:\/\/|mailto:)/.test(url)) void shell.openExternal(url)
    return true
  })

  // ---- Setup Assistant (one-time app registration, watched and captured) ----
  const assistant = new SetupAssistant(
    (kind, captured) => {
      const settings = loadSettings(db)
      saveSettings(db, {
        ...settings,
        ...(kind === 'google'
          ? { googleClientId: captured.googleClientId ?? settings.googleClientId, googleClientSecret: captured.googleClientSecret ?? settings.googleClientSecret }
          : { microsoftClientId: captured.microsoftClientId ?? settings.microsoftClientId })
      })
    },
    (payload) => ctx.broadcast('setup:event', payload)
  )
  ipcMain.handle('setup:info', () => {
    const settings = loadSettings(db)
    const baked = hasBakedClients()
    return {
      google: { steps: GOOGLE_STEPS, configured: !!googleClient(settings).clientId, baked: baked.google },
      microsoft: { steps: MICROSOFT_STEPS, configured: !!microsoftClientId(settings), baked: baked.microsoft }
    }
  })
  ipcMain.handle('setup:start', (_e, kind: SetupKind, step: number) => {
    assistant.start(kind, step ?? 0)
    return true
  })
  ipcMain.handle('setup:goto', (_e, kind: SetupKind, step: number) => {
    assistant.goto(kind, step)
    return true
  })
  ipcMain.handle('setup:stop', () => {
    assistant.stop()
    return true
  })

  // ---- Exports & delivery ----
  ipcMain.handle('export:csv', async () => {
    const latest = repo.latestBrief(db)
    const rows = trackerRows(repo.listIssues(db, false), latest?.brief ?? null)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export tracker as CSV',
      defaultPath: join(loadSettings(db).reportsDir || '', 'InboxScout-tracker.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false }
    writeFileSync(filePath, toCsv(rows), 'utf8')
    return { ok: true, filePath }
  })
  ipcMain.handle('export:ics', async () => {
    const latest = repo.latestBrief(db)
    const events = latest ? eventsFromBrief(latest.brief, new Date()) : []
    if (events.length === 0) return { ok: false, error: 'No dates with a recognisable day were found in the latest brief.' }
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export dates to your calendar',
      defaultPath: join(loadSettings(db).reportsDir || '', 'InboxScout-dates.ics'),
      filters: [{ name: 'Calendar', extensions: ['ics'] }]
    })
    if (canceled || !filePath) return { ok: false }
    writeFileSync(filePath, toIcs(events), 'utf8')
    return { ok: true, filePath, count: events.length }
  })
  ipcMain.handle('delivery:carriers', () => Object.entries(SMS_GATEWAYS).map(([id, g]) => ({ id, name: g.name })))
  ipcMain.handle('delivery:test', async (_e, kind: 'email' | 'sms') => {
    const settings = loadSettings(db)
    const outbox = pickOutbox(repo.listAccounts(db), null)
    const password = outbox ? secrets.get(accountSecretName(outbox.id)) : null
    if (!outbox || !password) return { ok: false, error: 'Connect a Gmail, Yahoo, or iCloud account with an app password first — it becomes the outbox.' }
    const to = kind === 'email' ? settings.deliverEmailTo : smsAddress(settings.smsPhone, settings.smsCarrier)
    if (!to) return { ok: false, error: kind === 'email' ? 'Enter an email address first.' : 'Enter a valid 10-digit phone number and pick a carrier.' }
    try {
      const text = 'InboxScout test: your briefs will arrive here.'
      // v1.4 item 14: texts go plain (no HTML part) so carrier gateways deliver one clean segment.
      await sendMail(outbox, password, to, kind === 'email' ? 'InboxScout test' : '', kind === 'email' ? `<p>${text}</p>` : undefined, text)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
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
  ipcMain.handle('issues:reopen', (_e, id: string) => {
    repo.reopenIssue(db, id)
    return true
  })

  ipcMain.handle('issues:list', () => repo.listIssues(db, false))
  ipcMain.handle('projects:list', () => repo.listProjects(db, false))
  ipcMain.handle('dialog:chooseDir', async (_e, current: string) => {
    const { filePaths, canceled } = await dialog.showOpenDialog({ title: 'Choose a folder', defaultPath: current || undefined, properties: ['openDirectory', 'createDirectory'] })
    return canceled || !filePaths[0] ? null : filePaths[0]
  })

  // ---- System control: the remembered popup answers (the control module itself is wired separately) ----
  const SYSTEM_KINDS = ['screenshot', 'input', 'open', 'run', 'files'] as const
  ipcMain.handle('system:status', () => {
    const s = loadSettings(db)
    return { enabled: s.systemControl === 'on', consents: s.systemConsents ?? {}, dangerousOverride: !!s.systemDangerousOverride, platform: process.platform }
  })
  ipcMain.handle('system:setConsent', (_e, kind: string, value: 'always' | 'never' | null) => {
    if (!(SYSTEM_KINDS as readonly string[]).includes(kind)) return false
    const s = loadSettings(db)
    const consents = { ...(s.systemConsents ?? {}) }
    if (value === 'always' || value === 'never') consents[kind as (typeof SYSTEM_KINDS)[number]] = value
    else delete consents[kind as (typeof SYSTEM_KINDS)[number]]
    saveSettings(db, { ...s, systemConsents: consents })
    return true
  })
  ipcMain.handle('system:reset', () => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, systemConsents: {} })
    return true
  })

  // ---- Evolving UI: local usage signals and the Simple / Standard / Pro level ----
  ipcMain.handle('usage:track', (_e, kind: 'tab' | 'feature', name: string) => {
    if (kind === 'tab') recordTab(db, String(name).slice(0, 40))
    else recordFeature(db, String(name).slice(0, 40))
    return true
  })
  ipcMain.handle('ui:level', () => evaluateLevel(db))
  ipcMain.handle('ui:ackLevel', () => {
    acknowledgeLevel(db)
    return evaluateLevel(db)
  })
  ipcMain.handle('ui:revertLevel', () => revertLevel(db))
  ipcMain.handle('ui:setLevel', (_e, setting: AppSettings['uiLevel']) => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, uiLevel: ['auto', 'simple', 'standard', 'pro'].includes(setting) ? setting : 'auto' })
    acknowledgeLevel(db)
    return evaluateLevel(db)
  })

  // ---- People (your circle) ----
  ipcMain.handle('people:list', () => repo.listPeople(db))
  ipcMain.handle('people:mark', (_e, address: string, how: 'important' | 'quiet' | 'clear') => {
    const s = loadSettings(db)
    const a = String(address).trim().toLowerCase()
    const without = (list: string[]): string[] => list.filter((x) => x.trim().toLowerCase() !== a)
    const next = { ...s, vipSenders: without(s.vipSenders), quietPeople: without(s.quietPeople) }
    if (how === 'important') next.vipSenders = [...next.vipSenders, a]
    if (how === 'quiet') next.quietPeople = [...next.quietPeople, a]
    saveSettings(db, next)
    return true
  })
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

  // ---- Reads attachments and photos (v1.5): what the files said, and "Open" for the ones still kept ----
  ipcMain.handle('attachments:list', (_e, messageIds: string | string[]): AttachmentInfo[] => {
    const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).map(String).filter(Boolean).slice(0, 300)
    const out: AttachmentInfo[] = []
    for (const id of ids) {
      try {
        for (const a of attachmentsFor(db, id)) out.push(publicAttachment(a))
      } catch {
        // a missing table on a very old database is not worth breaking the Review screen
      }
    }
    return out
  })
  /** Opens the stored file with the default app. Returns '' when it opened, else a plain-words reason. */
  ipcMain.handle('attachments:open', async (_e, id: string): Promise<string> => {
    const att = findAttachment(db, String(id), { attachmentsFor })
    if (!att) return 'That attachment is no longer listed.'
    if (!att.path) return 'That file was cleared to save space; what it said is still searchable.'
    const problem = await shell.openPath(att.path)
    return problem ? `Could not open ${att.filename}: ${problem}` : ''
  })

  // ---- Trusted helpers (v1.4, Part A): the person's own screen — full contact details, never masked ----
  const helperDeps: HelperDeps = { db, secrets, log }
  ipcMain.handle('helpers:list', () => {
    const s = loadSettings(db)
    return { helpers: s.helpers, paused: s.helpersPaused, setupBy: s.setupBy, helperNoticeUntil: s.helperNoticeUntil }
  })
  ipcMain.handle('helpers:add', (_e, input: NewHelper & { addedBy?: 'person' | 'helper_setup' }) =>
    addHelper(helperDeps, input, input?.addedBy === 'helper_setup' ? 'helper_setup' : 'person')
  )
  ipcMain.handle('helpers:update', (_e, id: string, patch: HelperPatch) => updateHelper(helperDeps, String(id), patch ?? {}))
  ipcMain.handle('helpers:remove', (_e, id: string) => removeHelper(helperDeps, String(id)))
  ipcMain.handle('helpers:ask', (_e, input: AskRequest) => scheduleAsk(helperDeps, input))
  ipcMain.handle('helpers:cancel', (_e, sendId: string) => cancelAsk(helperDeps, String(sendId)))
  ipcMain.handle('helpers:log', (_e, limit?: number, helperId?: string) => listHelperLog(helperDeps, { limit: Math.min(500, Number(limit) || 100), helperId: helperId || undefined }))
  ipcMain.handle('helpers:pauseAll', (_e, paused: boolean) => pauseAll(helperDeps, !!paused))
  ipcMain.handle('helpers:setSetupBy', (_e, setupBy: AppSettings['setupBy']) => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, setupBy: setupBy === 'me' || setupBy === 'someone_else' ? setupBy : null })
    return true
  })
  ipcMain.handle('helpers:dismissNotice', () => {
    const s = loadSettings(db)
    saveSettings(db, { ...s, helperNoticeUntil: null })
    return true
  })

  // After every finished run: drop the ask engine's cached brief (v1.4 Part B), then the self-healing pass.
  const afterRun = async (): Promise<HealthReport> => {
    invalidateAskCache()
    return healthRepair()
  }
  return { agent, afterRun, reauthAccount }
}
