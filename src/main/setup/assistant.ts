import { BrowserWindow } from 'electron'
import { GOOGLE_STEPS, MICROSOFT_STEPS, extractCredentials, type Captured, type SetupKind } from './capture'

export * from './capture'

/**
 * Setup Assistant: the one-time "register an app with Google / Microsoft"
 * chore, done the way a human assistant would sit next to you. It opens the
 * exact console page for each step in a companion window, you click through
 * the provider's own UI, and InboxScout watches the page and captures the
 * IDs the moment they appear - no copy/paste, no hunting for fields.
 *
 * We deliberately do not click buttons inside Google's or Microsoft's
 * consoles: their UIs change constantly and a blind bot breaks silently.
 * Reading results off the page is robust to redesigns.
 */

export class SetupAssistant {
  private win: BrowserWindow | null = null
  private timer: NodeJS.Timeout | null = null
  private captured: Captured = {}

  constructor(
    private onCaptured: (kind: SetupKind, captured: Captured) => void,
    private onEvent: (payload: unknown) => void
  ) {}

  start(kind: SetupKind, stepIndex = 0): void {
    this.stop()
    this.captured = {}
    this.win = new BrowserWindow({
      width: 1180,
      height: 820,
      title: kind === 'google' ? 'Google setup — InboxScout is watching for your client ID' : 'Microsoft setup — InboxScout is watching for your app ID',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    this.win.on('closed', () => {
      this.win = null
      this.stopPolling()
      this.onEvent({ kind, type: 'closed' })
    })
    this.goto(kind, stepIndex)
    this.timer = setInterval(() => void this.scan(kind), 2000)
  }

  goto(kind: SetupKind, stepIndex: number): void {
    const steps = kind === 'google' ? GOOGLE_STEPS : MICROSOFT_STEPS
    const step = steps[Math.max(0, Math.min(stepIndex, steps.length - 1))]
    if (this.win) void this.win.loadURL(step.url)
    this.onEvent({ kind, type: 'step', index: stepIndex })
  }

  private async scan(kind: SetupKind): Promise<void> {
    if (!this.win || this.win.isDestroyed()) return
    try {
      const text: string = await this.win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true)
      const found = extractCredentials(kind, text)
      let changed = false
      for (const [k, v] of Object.entries(found) as [keyof Captured, string][]) {
        if (v && this.captured[k] !== v) {
          this.captured[k] = v
          changed = true
        }
      }
      if (changed) {
        this.onCaptured(kind, { ...this.captured })
        this.onEvent({ kind, type: 'captured', captured: { ...this.captured } })
      }
    } catch {
      // page mid-navigation; try again next tick
    }
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  stop(): void {
    this.stopPolling()
    if (this.win && !this.win.isDestroyed()) this.win.close()
    this.win = null
  }
}
