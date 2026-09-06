import type { DB } from '../db/index'
import type { SystemActionKind } from '../../shared/types'

/**
 * Full system control for the Assistant and connected agents: look at the
 * screen, click and type on the desktop, open apps and files, run commands,
 * read and write files under the home folder. Every kind of action is gated
 * by the person's remembered answer or a popup; dangerous commands always ask.
 *
 * STUB — an implementation agent fills this in (Electron: desktopCapturer for
 * screenshots, dialog.showMessageBox for popups, child_process for the OS
 * commands from ./scripts.ts). Keep every export and signature.
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

export interface DesktopDeps {
  db: DB
  /** Parent window for popups (may be null when hidden to tray). */
  getWindow: () => Electron.BrowserWindow | null
  /** The person's home folder (app.getPath('home')). */
  homeDir: string
  /** Who is asking, shown in popups ("the Assistant", "Hermes"). */
}

export class DesktopControl {
  constructor(_deps: DesktopDeps) {}

  /** True when Settings → systemControl is on. */
  enabled(): boolean {
    return false
  }

  /**
   * Ask (or recall) permission for a kind of action. `requester` names who is asking.
   * Returns quickly when the answer is remembered; otherwise shows a popup with
   * "Allow once" / "Always allow" / "Don't allow". `force` ignores a remembered
   * "always" (used for dangerous commands).
   */
  async consent(_kind: SystemActionKind, _detail: string, _requester: string, _force = false): Promise<ConsentResult> {
    return { allowed: false, reason: 'stub' }
  }

  /** PNG data URL of the primary display (scaled to ≤ 1600 px wide). */
  async screenshot(_requester: string): Promise<string> {
    throw new Error('stub')
  }

  async click(_x: number, _y: number, _requester: string, _opts: { button?: 'left' | 'right'; double?: boolean } = {}): Promise<string> {
    throw new Error('stub')
  }

  async type(_text: string, _requester: string): Promise<string> {
    throw new Error('stub')
  }

  async key(_combo: string, _requester: string): Promise<string> {
    throw new Error('stub')
  }

  async open(_target: string, _requester: string): Promise<string> {
    throw new Error('stub')
  }

  /** Run a shell command with a timeout (default 60 s) in the home folder unless `cwd` is given. */
  async run(_command: string, _requester: string, _opts: { cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
    throw new Error('stub')
  }

  async readFile(_path: string, _requester: string): Promise<string> {
    throw new Error('stub')
  }

  async writeFile(_path: string, _text: string, _requester: string): Promise<string> {
    throw new Error('stub')
  }

  async listDir(_path: string, _requester: string): Promise<{ name: string; dir: boolean; size: number }[]> {
    throw new Error('stub')
  }

  /** Current remembered answers (for Settings). */
  consents(): Partial<Record<SystemActionKind, 'always' | 'never'>> {
    return {}
  }

  setConsent(_kind: SystemActionKind, _value: 'always' | 'never' | null): void {}

  resetConsents(): void {}
}
