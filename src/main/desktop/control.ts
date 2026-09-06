import { desktopCapturer, dialog, screen, shell } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, open as openFile, readdir, stat, writeFile as fsWriteFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { DB } from '../db/index'
import type { AppSettings, SystemActionKind } from '../../shared/types'
import { loadSettings, saveSettings } from '../settings'
import { clickCommand, describeAction, isDangerousCommand, keyCommand, openCommand, pathAllowed, shellFor, typeCommand, type OsCommand, type Platform } from './scripts'

/**
 * Full system control for the Assistant and connected agents: look at the
 * screen, click and type on the desktop, open apps and files, run commands,
 * read and write files under the home folder. Every kind of action is gated
 * by the person's remembered answer or a popup; dangerous commands always ask
 * (unless the person switched on the full-autonomy override in Settings).
 *
 * Electron: desktopCapturer for screenshots, dialog.showMessageBox for popups,
 * child_process for the OS commands from ./scripts.ts.
 */
export interface ConsentResult {
  allowed: boolean
  /** 'always' when the person chose to remember it. */
  remembered?: 'always' | 'never'
  reason?: string
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface ScreenshotResult {
  /** PNG data URL, scaled to fit within 1600 × 1000. */
  dataUrl: string
  /** Size of the picture itself. */
  width: number
  height: number
  /** Size of the primary display in screen coordinates (for mapping clicks back). */
  screenWidth: number
  screenHeight: number
}

export interface DirEntry {
  name: string
  dir: boolean
  size: number
}

export interface DesktopDeps {
  db: DB
  /** Parent window for popups (may be null when hidden to tray). */
  getWindow: () => Electron.BrowserWindow | null
  /** The person's home folder (app.getPath('home')). */
  homeDir: string
}

/** Prefix on every error thrown when the person (or their settings) said no. The bridge and the runner rely on it. */
export const CONSENT_DENIED = 'consent_denied: '

const OS_TIMEOUT_MS = 15_000
const RUN_TIMEOUT_MS = 60_000
const MAX_BUFFER = 1024 * 1024
const TEXT_CAP = 200 * 1024
const TRUNCATED = '…[truncated]'

interface ExecOutcome {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error: NodeJS.ErrnoException | null
}

function execCapture(cmd: OsCommand, opts: { cwd?: string; timeout: number }): Promise<ExecOutcome> {
  return new Promise((done) => {
    execFile(cmd.file, cmd.args, { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: number | string }) | null
      const timedOut = !!e && e.killed === true && e.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      const code = e ? (typeof e.code === 'number' ? e.code : null) : 0
      done({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), timedOut, error: e })
    })
  })
}

function capText(s: string): string {
  return s.length > TEXT_CAP ? s.slice(0, TEXT_CAP) + TRUNCATED : s
}

export class DesktopControl {
  private readonly db: DB
  private readonly getWindow: () => Electron.BrowserWindow | null
  private readonly homeDir: string
  private readonly platform: Platform
  /** Popups are shown one at a time, in the order they were asked for. */
  private popupChain: Promise<unknown> = Promise.resolve()

  constructor(deps: DesktopDeps) {
    this.db = deps.db
    this.getWindow = deps.getWindow
    this.homeDir = deps.homeDir
    this.platform = process.platform as Platform
  }

  private settings(): AppSettings {
    return loadSettings(this.db)
  }

  /** True when Settings → systemControl is on. */
  enabled(): boolean {
    return this.settings().systemControl === 'on'
  }

  /**
   * Ask (or recall) permission for a kind of action. `requester` names who is asking.
   * Returns quickly when the answer is remembered; otherwise shows a popup with
   * "Allow once" / "Always allow" / "Don't allow". `force` ignores a remembered
   * "always" (used for dangerous commands) unless the full-autonomy override is on.
   */
  async consent(kind: SystemActionKind, detail: string, requester: string, force = false): Promise<ConsentResult> {
    const s = this.settings()
    if (s.systemControl !== 'on') return { allowed: false, reason: 'System control is off in Settings → Who can help' }
    const c = s.systemConsents?.[kind]
    if (c === 'never') return { allowed: false, remembered: 'never', reason: `You set "${kind}" to Never in Settings` }
    if (c === 'always' && !force) return { allowed: true, remembered: 'always' }
    if (c === 'always' && force && s.systemDangerousOverride) return { allowed: true, remembered: 'always' }
    return this.enqueuePopup(() => this.ask(kind, detail, requester, force))
  }

  private enqueuePopup<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.popupChain.then(fn, fn)
    this.popupChain = next.catch(() => undefined)
    return next
  }

  private async ask(kind: SystemActionKind, detail: string, requester: string, force: boolean): Promise<ConsentResult> {
    const { title, body } = describeAction(kind, detail)
    const win = this.getWindow()
    const parent = win && !win.isDestroyed() ? win : null
    if (parent) {
      try {
        if (parent.isMinimized()) parent.restore()
        parent.show()
        parent.focus()
      } catch {
        // Bringing the window forward is best-effort.
      }
    }
    const buttons = force ? ['Allow this once', "Don't allow"] : ['Allow once', 'Always allow', "Don't allow"]
    const cancelId = buttons.length - 1
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      title,
      message: title,
      detail: `${requester} — ${body}`,
      buttons,
      defaultId: 0,
      cancelId,
      noLink: true
    }
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    if (response === cancelId) return { allowed: false, reason: `You chose "Don't allow" for: ${title.replace(/\?$/, '')}` }
    if (!force && response === 1) {
      this.setConsent(kind, 'always')
      return { allowed: true, remembered: 'always' }
    }
    return { allowed: true }
  }

  /** consent() that throws a `consent_denied: …` error when the answer is no. */
  private async require(kind: SystemActionKind, detail: string, requester: string, force = false): Promise<void> {
    const r = await this.consent(kind, detail, requester, force)
    if (!r.allowed) throw new Error(`${CONSENT_DENIED}${r.reason ?? 'not allowed'}`)
  }

  /** Picture of the primary display (PNG data URL, scaled to fit 1600 × 1000) plus the real screen size. */
  async screenshot(requester: string): Promise<ScreenshotResult> {
    await this.require('screenshot', 'the whole screen', requester)
    const primary = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1000 } })
    const source = sources.find((s) => s.display_id === String(primary.id)) ?? sources[0]
    if (!source) throw new Error('No screen could be captured')
    const size = source.thumbnail.getSize()
    return {
      dataUrl: source.thumbnail.toDataURL(),
      width: size.width,
      height: size.height,
      screenWidth: primary.size.width,
      screenHeight: primary.size.height
    }
  }

  private async runOs(cmd: OsCommand): Promise<void> {
    const out = await execCapture(cmd, { timeout: OS_TIMEOUT_MS })
    if (out.error) {
      if (this.platform === 'linux' && out.error.code === 'ENOENT' && cmd.file === 'xdotool') {
        throw new Error('Desktop control on Linux needs xdotool (sudo apt install xdotool)')
      }
      if (out.error.code === 'ENOENT') throw new Error(`${cmd.file} is not installed on this computer`)
      if (out.timedOut) throw new Error(`${cmd.file} did not finish within ${OS_TIMEOUT_MS / 1000} s`)
      throw new Error(out.stderr.trim() || out.error.message)
    }
  }

  async click(x: number, y: number, requester: string, opts: { button?: 'left' | 'right'; double?: boolean } = {}): Promise<string> {
    const button = opts.button === 'right' ? 'right' : 'left'
    const what = `${opts.double ? 'double-' : ''}${button}-click at (${Math.round(x)}, ${Math.round(y)})`
    await this.require('input', what, requester)
    await this.runOs(clickCommand(this.platform, x, y, button, !!opts.double))
    return `Did a ${what}`
  }

  async type(text: string, requester: string): Promise<string> {
    const preview = text.length > 60 ? `${text.slice(0, 57)}…` : text
    await this.require('input', `type "${preview}"`, requester)
    if (!text) return 'Nothing to type'
    await this.runOs(typeCommand(this.platform, text))
    return `Typed ${text.length} character${text.length === 1 ? '' : 's'}`
  }

  async key(combo: string, requester: string): Promise<string> {
    const c = combo.trim()
    if (!c) throw new Error('Which key? e.g. "enter" or "ctrl+s"')
    await this.require('input', `press ${c}`, requester)
    await this.runOs(keyCommand(this.platform, c))
    return `Pressed ${c}`
  }

  /** Expand a leading ~ and resolve against the home folder. */
  private expand(p: string): string {
    const t = p.trim()
    const expanded = t === '~' ? this.homeDir : t.startsWith('~/') || t.startsWith('~\\') ? join(this.homeDir, t.slice(2)) : t
    return resolve(this.homeDir, expanded)
  }

  private looksLikePath(target: string): boolean {
    return target.includes('/') || target.includes('\\') || target.startsWith('~')
  }

  async open(target: string, requester: string): Promise<string> {
    const t = target.trim()
    if (!t) throw new Error('What should be opened?')
    await this.require('open', t, requester)
    if (/^https?:\/\//i.test(t)) {
      await shell.openExternal(t)
      return `Opened ${t} in the browser`
    }
    if (this.looksLikePath(t)) {
      const p = this.expand(t)
      if (!pathAllowed(p, [this.homeDir])) throw new Error('That is outside your home folder')
      await this.runOs(openCommand(this.platform, p))
      return `Opened ${p}`
    }
    await this.runOs(openCommand(this.platform, t))
    return `Opened ${t}`
  }

  /** Run a shell command with a timeout (default 60 s) in the home folder unless `cwd` is given. Resolves on non-zero exit too. */
  async run(command: string, requester: string, opts: { cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
    const cmd = command.trim()
    if (!cmd) throw new Error('Which command?')
    const dangerous = isDangerousCommand(cmd)
    let cwd = this.homeDir
    if (opts.cwd) {
      cwd = this.expand(opts.cwd)
      if (!pathAllowed(cwd, [this.homeDir])) throw new Error('That folder is outside your home folder')
    }
    await this.require('run', cmd, requester, dangerous)
    const sh = shellFor(this.platform)
    const out = await execCapture({ file: sh.file, args: sh.args(cmd) }, { cwd, timeout: Math.max(1000, opts.timeoutMs ?? RUN_TIMEOUT_MS) })
    if (out.error && out.error.code === 'ENOENT') throw new Error(`${sh.file} is not available on this computer`)
    return { code: out.code, stdout: capText(out.stdout), stderr: capText(out.stderr), timedOut: out.timedOut }
  }

  private allowedFile(p: string): string {
    const full = this.expand(p)
    if (!pathAllowed(full, [this.homeDir])) throw new Error('That file is outside your home folder')
    return full
  }

  async readFile(path: string, requester: string): Promise<string> {
    const full = this.allowedFile(path)
    await this.require('files', `read ${full}`, requester)
    const fh = await openFile(full, 'r')
    try {
      const info = await fh.stat()
      if (info.isDirectory()) throw new Error(`${full} is a folder — use list instead`)
      const buf = Buffer.alloc(Math.min(info.size, TEXT_CAP))
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      const text = buf.subarray(0, bytesRead).toString('utf8')
      return info.size > TEXT_CAP ? text + TRUNCATED : text
    } finally {
      await fh.close()
    }
  }

  async writeFile(path: string, text: string, requester: string): Promise<string> {
    const full = this.allowedFile(path)
    await this.require('files', `write ${full}`, requester)
    await mkdir(dirname(full), { recursive: true })
    await fsWriteFile(full, text, 'utf8')
    return `Wrote ${Buffer.byteLength(text, 'utf8')} bytes to ${full}`
  }

  async listDir(path: string, requester: string): Promise<DirEntry[]> {
    const full = this.allowedFile(path || '~')
    await this.require('files', `list ${full}`, requester)
    const entries = await readdir(full, { withFileTypes: true })
    const out: DirEntry[] = []
    for (const e of entries) {
      const dir = e.isDirectory()
      let size = 0
      if (!dir) {
        try {
          size = (await stat(join(full, e.name))).size
        } catch {
          size = 0
        }
      }
      out.push({ name: e.name, dir, size })
    }
    out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
    return out
  }

  /** Current remembered answers (for Settings). */
  consents(): Partial<Record<SystemActionKind, 'always' | 'never'>> {
    return { ...(this.settings().systemConsents ?? {}) }
  }

  setConsent(kind: SystemActionKind, value: 'always' | 'never' | null): void {
    const s = this.settings()
    const consents = { ...(s.systemConsents ?? {}) }
    if (value === 'always' || value === 'never') consents[kind] = value
    else delete consents[kind]
    saveSettings(this.db, { ...s, systemConsents: consents })
  }

  resetConsents(): void {
    const s = this.settings()
    saveSettings(this.db, { ...s, systemConsents: {} })
  }
}
