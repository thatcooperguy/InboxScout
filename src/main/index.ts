import { app, BrowserWindow, Menu, Notification, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { openDatabase, type DB } from './db/index'
import { SecretStore } from './secrets'
import { registerIpc, type IpcHooks } from './ipc'
import { runPipeline } from './pipeline/run'
import { log } from './health/diagnostics'
import { Scheduler } from './scheduler'
import { loadSettings, saveSettings } from './settings'
import type { RunProgress } from '../shared/types'
import { briefToSpeech } from '../shared/speech'
import { speakWithOs } from './voice'
import { latestBrief } from './db/repo'
import { bridgeBroadcast } from './api/local'
import { recordRun, recordSession } from './usage'

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
      new Notification({ title: 'InboxScout', body: 'InboxScout hit a snag and kept going — see Settings → Health' }).show()
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
      log
    })
    if (result.error) log('error', 'pipeline', `run failed (${trigger})`, { runId: result.runId, error: result.error })
    else log('info', 'pipeline', `run finished (${trigger})`, { runId: result.runId, messages: result.messagesScanned, issues: result.issueCount, notices: result.notices })
    if (trigger !== 'manual' && Notification.isSupported()) {
      // Failures must be visible too - a silently skipped brief is worse than an error.
      new Notification(
        result.error
          ? { title: 'InboxScout — scan failed', body: result.error.slice(0, 200) }
          : {
              title: 'InboxScout — brief ready',
              body:
                `${result.messagesScanned} new messages scanned, ${result.issueCount} issue${result.issueCount === 1 ? '' : 's'} need attention.` +
                (result.notices.length ? ` (${result.notices[0]})` : '')
            }
      ).show()
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
      nodeIntegration: false,
      sandbox: false
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
  scheduler.apply(loadSettings(db).schedule, loadSettings(db).lastRunAt)
  // Reapply schedule whenever settings change.
  setInterval(() => {
    const current = loadSettings(db)
    scheduler.apply(current.schedule, current.lastRunAt)
  }, 5 * 60 * 1000)

  // Start with Windows/macOS so scheduled runs actually happen.
  const applyLoginItem = (): void => {
    if (!app.isPackaged) return
    try {
      app.setLoginItemSettings({ openAtLogin: loadSettings(db).launchAtLogin })
    } catch {
      // not supported on this platform
    }
  }
  applyLoginItem()
  setInterval(applyLoginItem, 5 * 60 * 1000)

  // Auto-update from this repo's GitHub Releases (packaged builds only).
  if (app.isPackaged) {
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      void autoUpdater.checkForUpdatesAndNotify()
      setInterval(() => void autoUpdater.checkForUpdatesAndNotify(), 6 * 60 * 60 * 1000)
    } catch {
      // updater unavailable in dev
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
