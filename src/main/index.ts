import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, safeStorage } from 'electron'
import { join } from 'node:path'
import { applyLinuxAutostart } from './linux'
import { openDatabase, type DB } from './db/index'
import { SecretStore } from './secrets'
import { registerIpc, type IpcHooks } from './ipc'
import { runPipeline } from './pipeline/run'
import { log } from './health/diagnostics'
import { META_LAST_ATTEMPT_AT, Scheduler, attemptStateFrom } from './scheduler'
import { loadSettings, saveSettings } from './settings'
import type { RunProgress } from '../shared/types'
import { briefToSpeech } from '../shared/speech'
import { speakWithOs } from './voice'
import { getMeta, latestBrief, listRuns } from './db/repo'
import { bridgeBroadcast } from './api/local'
import { readLevelState, recordRun, recordSession } from './usage'
import { resolveLevel } from '../shared/adapt'
import { notificationCopy, tShared } from '../shared/copy'
import { nextSlotLabel } from '../shared/errors'

let db: DB
let secrets: SecretStore
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let running = false
/** Self-healing hooks from registerIpc (null in headless --sync mode). */
let hooks: IpcHooks | null = null

const isHeadlessSync = process.argv.includes('--sync')

// ---- Self-debugging: never die on an unexpected error; write it down and tell the person calmly, at most every 10 minutes.
const SNAG_INTERVAL_MS = 10 * 60 * 1000
let lastSnagAt = 0
function snag(kind: string, err: unknown): void {
  log('error', 'process', kind, err instanceof Error ? err : { value: String(err) })
  const now = Date.now()
  if (now - lastSnagAt < SNAG_INTERVAL_MS) return
  lastSnagAt = now
  try {
    if (app.isReady() && Notification.isSupported()) {
      const level = db ? resolveLevel(loadSettings(db).uiLevel, readLevelState(db)) : 'standard'
      new Notification({ title: 'InboxScout', body: tShared('notify.snag', level) }).show()
    }
  } catch {
    // a notification that cannot be shown is not worth a second snag
  }
}
process.on('uncaughtException', (err) => snag('uncaughtException', err))
process.on('unhandledRejection', (reason) => snag('unhandledRejection', reason))

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
  // Agents listening on the local bridge (Hermes etc.) get the same events.
  bridgeBroadcast(channel, payload)
}

async function runNow(trigger: 'manual' | 'scheduled' | 'catchup' | 'cli' = 'manual'): Promise<void> {
  if (running) return
  running = true
  broadcast('run:progress', { phase: 'fetch', detail: 'Starting…' } satisfies RunProgress)
  try {
    log('info', 'pipeline', `run started (${trigger})`)
    const result = await runPipeline(db, secrets, trigger, (p) => broadcast('run:progress', p), {
      skillsDir: join(app.getPath('userData'), 'skills'),
      reauthAccount: hooks ? (id) => hooks!.reauthAccount(id) : undefined,
      log,
      // Reads attachments (v1.5): files live under userData/attachments.
      userDataDir: app.getPath('userData')
    })
    if (result.error) log('error', 'pipeline', `run failed (${trigger})`, { runId: result.runId, error: result.error })
    else log('info', 'pipeline', `run finished (${trigger})`, { runId: result.runId, messages: result.messagesScanned, issues: result.issueCount, notices: result.notices })
    if (trigger !== 'manual' && Notification.isSupported()) {
      // Failures must be visible too - a silently skipped brief is worse than an error. Words come from the stored level.
      const s = loadSettings(db)
      const level = resolveLevel(s.uiLevel, readLevelState(db))
      new Notification(notificationCopy(result, level, { nextSlot: nextSlotLabel(s.schedule) })).show()
    }
    if (!result.error && loadSettings(db).speakBriefs) {
      const latest = latestBrief(db)
      if (latest) speakWithOs(`Your InboxScout brief is ready. ${briefToSpeech(latest.brief, { short: true })}`)
    }
    if (!result.error) recordRun(db, result.messagesScanned, result.issueCount)
    broadcast('run:finished', result)
    // Self-healing pass after every run: a failed sync or a silent AI helper gets looked at right away.
    if (hooks) await hooks.afterRun().catch((err) => log('error', 'health', 'post-run check failed', err))
  } catch (err) {
    log('error', 'pipeline', `run crashed (${trigger})`, err)
    broadcast('run:finished', { runId: '', reportId: null, messagesScanned: 0, issueCount: 0, error: String((err as Error)?.message ?? err), notices: [] })
  } finally {
    running = false
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: 'InboxScout',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 16x16 envelope-on-blue tray icon, embedded so packaging needs no asset files.
const TRAY_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAS0lEQVR4nGNggAKVsGX/ScEM6IBsA0jViGHQ4DOAEMBrAEwBPs3ohmAYgMsQdHm8BmDTgMsbOA1AVogvHPAagC8saGPAwCSkAc+NAHwFbPs7VvWUAAAAAElFTkSuQmCC'

function createTray(): void {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_B64}`)
  try {
    tray = new Tray(icon)
  } catch {
    return
  }
  tray.setToolTip('InboxScout')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open InboxScout', click: () => (mainWindow ? mainWindow.show() : createWindow()) },
      { label: 'Run now', click: () => void runNow('manual') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

async function bootstrap(): Promise<void> {
  const dataDir = app.getPath('userData')
  log('info', 'app', `start v${app.getVersion()}${isHeadlessSync ? ' (--sync)' : ''}`, { platform: process.platform, electron: process.versions.electron })
  app.on('before-quit', () => log('info', 'app', 'quit'))
  db = openDatabase(join(dataDir, 'inboxscout.db'))
  if (process.platform === 'linux') {
    // No keyring (gnome-keyring / kwallet) on this desktop? Use Electron's own obfuscated fallback
    // rather than refusing to save anything; the "Password storage" health check says how to do better.
    try {
      safeStorage.setUsePlainTextEncryption(true)
    } catch {
      // SecretStore has its own base64 fallback when even that is missing
    }
  }
  secrets = new SecretStore(db)

  const settings = loadSettings(db)
  if (!settings.reportsDir) {
    saveSettings(db, { ...settings, reportsDir: join(app.getPath('documents'), 'InboxScout', 'Reports') })
  }

  if (isHeadlessSync) {
    await runNow('cli')
    app.quit()
    return
  }

  recordSession(db)
  hooks = registerIpc({
    db,
    secrets,
    runNow: () => runNow('manual'),
    isRunning: () => running,
    skillsDir: join(app.getPath('userData'), 'skills'),
    broadcast
  })
  const { agent } = hooks
  app.on('before-quit', () => agent.closeWindow())
  createWindow()
  createTray()

  const scheduler = new Scheduler((trigger) => void runNow(trigger))
  // The cron job is re-armed only when the schedule changes; the catch-up check backs off after failed runs
  // (15 min → 1 h → 6 h) so a locked account is not retried — and reported — every five minutes.
  const applySchedule = (): void => {
    const current = loadSettings(db)
    scheduler.apply(current.schedule, current.lastRunAt, attemptStateFrom(listRuns(db, 10), getMeta(db, META_LAST_ATTEMPT_AT)))
  }
  applySchedule()
  setInterval(applySchedule, 5 * 60 * 1000)

  // Start with Windows/macOS/Linux so scheduled runs actually happen.
  const applyLoginItem = (): void => {
    if (!app.isPackaged) return
    const openAtLogin = loadSettings(db).launchAtLogin
    try {
      // setLoginItemSettings is a no-op on Linux; an XDG autostart entry does the same job there.
      if (process.platform === 'linux') applyLinuxAutostart(openAtLogin, process.env['APPIMAGE'] ?? process.execPath)
      else app.setLoginItemSettings({ openAtLogin })
    } catch {
      // not supported on this platform (or ~/.config is read-only)
    }
  }
  applyLoginItem()
  setInterval(applyLoginItem, 5 * 60 * 1000)

  // Auto-update from this repo's GitHub Releases (packaged builds only).
  // On Linux only the AppImage can replace itself; the .deb (and an unpacked build) would make
  // electron-updater fail on every check, so those skip it and get new versions through apt.
  if (app.isPackaged && process.platform === 'linux' && !process.env['APPIMAGE']) {
    log('info', 'updater', 'not running from an AppImage; automatic updates are off (install new versions with apt)')
  } else if (app.isPackaged) {
    try {
      // electron-updater is CommonJS; through a native import() its exports live on `default`, and the
      // namespace itself has no `autoUpdater` (that is why packaged builds never updated before v1.5.5).
      const mod = (await import('electron-updater')) as unknown as { default?: { autoUpdater: import('electron-updater').AppUpdater }; autoUpdater?: import('electron-updater').AppUpdater }
      const autoUpdater = mod.default?.autoUpdater ?? mod.autoUpdater
      if (!autoUpdater) throw new Error('electron-updater exposed no autoUpdater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      // A failed check (offline, GitHub down) is a log line, not a "hit a snag" notification.
      const check = (): void => void autoUpdater.checkForUpdatesAndNotify().catch((err) => log('warn', 'updater', 'update check failed', err))
      check()
      setInterval(check, 6 * 60 * 60 * 1000)
    } catch (err) {
      log('error', 'updater', 'updater unavailable', err)
    }
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
  void app.whenReady().then(bootstrap)
  app.on('window-all-closed', () => {
    // Stay resident in the tray on Windows/Linux; quit only from the tray menu.
    if (process.platform === 'darwin') return
    if (!tray) app.quit()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}
