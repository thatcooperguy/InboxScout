import { BrowserWindow, app } from 'electron'
import { RECIPES } from '../agent/policy'
import { extractAppPassword } from './capture'

/**
 * "Get it for me" without an AI helper (v1.5.6).
 *
 * Opens the email service's own app-password page in an InboxScout window, lets the person sign in
 * and press Create there, and watches the page for the password the service shows. The moment it
 * appears InboxScout tests it, saves it, and closes the window — nothing to copy, nothing to type.
 * The window shares the Assistant's isolated session (its own cookies; the main app never sees them).
 * Deterministic: no model in the loop, so it works on a fresh install with no AI key.
 */

export type AppPasswordProvider = 'gmail' | 'yahoo' | 'icloud'

export interface AppPasswordEvent {
  status: 'opened' | 'captured' | 'done' | 'failed' | 'closed'
  provider: AppPasswordProvider
  email: string
  message: string
}

export interface AppPasswordDeps {
  emit: (e: AppPasswordEvent) => void
  /** Test the password, save the account, and return a one-line success message. Throws a plain-language error. */
  finish: (provider: AppPasswordProvider, email: string, password: string) => Promise<string>
  log?: (level: 'info' | 'warn' | 'error', message: string, extra?: unknown) => void
}

const POLL_MS = 1000
const TIMEOUT_MS = 15 * 60 * 1000
const APP_NAME = 'InboxScout'

/** Where the "create an app password" form lives; the name field is prefilled only on these pages. */
const FORM_PAGES: Record<AppPasswordProvider, RegExp> = {
  gmail: /^https:\/\/myaccount\.google\.com\/(u\/\d+\/)?apppasswords/i,
  yahoo: /^https:\/\/login\.yahoo\.com\/myaccount\/security\/app-password/i,
  icloud: /^https:\/\/account\.apple\.com\/account\/manage/i
}

export function startUrlFor(provider: AppPasswordProvider, email: string): string {
  const recipe = RECIPES.find((r) => r.id === `${provider}-app-password`)
  const base = recipe?.startUrl({ email }) ?? ''
  if (provider === 'gmail') {
    // Google's chooser lands on the right account when the person has several signed in.
    return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=${encodeURIComponent(base)}`
  }
  return base
}

/** Reads the page and fills the app name once so the person only has to press Create. */
const POLL_SCRIPT = (fill: boolean): string => `
(() => {
  const text = document.body ? document.body.innerText : '';
  let filled = false;
  if (${fill ? 'true' : 'false'}) {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 10; };
    for (const el of document.querySelectorAll('input')) {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type !== 'text') continue;
      const hint = ((el.getAttribute('name') || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.id || '')).toLowerCase();
      if (/user|email|login|phone|search|code|otp/.test(hint)) continue;
      if (!visible(el) || el.value) continue;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (setter && setter.set) setter.set.call(el, ${JSON.stringify(APP_NAME)}); else el.value = ${JSON.stringify(APP_NAME)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled = true;
      break;
    }
  }
  return { text, filled };
})()
`

export class AppPasswordWizard {
  private win: BrowserWindow | null = null
  private timer: NodeJS.Timeout | null = null
  private deadline = 0
  private current: { provider: AppPasswordProvider; email: string } | null = null
  private filledOn = ''
  private finishing = false
  private finished = false

  constructor(private deps: AppPasswordDeps) {}

  isRunning(): boolean {
    return !!this.current && !this.finished
  }

  start(provider: AppPasswordProvider, email: string): { ok: boolean; message?: string } {
    if (!FORM_PAGES[provider]) return { ok: false, message: 'This email service has no app-password page.' }
    if (!email.trim()) return { ok: false, message: 'Type your email address first.' }
    this.stop()
    this.current = { provider, email: email.trim() }
    this.finished = false
    this.finishing = false
    this.filledOn = ''
    this.deadline = Date.now() + TIMEOUT_MS
    const recipe = RECIPES.find((r) => r.id === `${provider}-app-password`)
    const allowed = recipe?.allowedDomains ?? []
    const win = new BrowserWindow({
      width: 1080,
      height: 820,
      title: `InboxScout — sign in to ${label(provider)}, then press Create`,
      webPreferences: { partition: 'persist:inboxscout-assistant', sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    this.win = win
    // Some sign-in pages refuse "Electron" browsers; present as the Chrome that this really is.
    win.webContents.setUserAgent(chromeUserAgent(win.webContents.getUserAgent(), app.getName()))
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowed(url, allowed)) void win.loadURL(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      if (!isAllowed(url, allowed)) event.preventDefault()
    })
    win.on('closed', () => {
      this.win = null
      this.clearTimer()
      if (this.current && !this.finished && !this.finishing) {
        this.deps.emit({ ...this.current, status: 'closed', message: 'The window was closed before a password appeared. You can try again or paste one below.' })
        this.current = null
      }
    })
    void win.loadURL(startUrlFor(provider, this.current.email))
    this.deps.emit({ ...this.current, status: 'opened', message: `${label(provider)}'s page is open in its own window. Sign in there and press Create. InboxScout will do the rest.` })
    this.timer = setInterval(() => void this.tick(), POLL_MS)
    return { ok: true }
  }

  stop(): void {
    this.clearTimer()
    this.finished = true
    if (this.win && !this.win.isDestroyed()) this.win.close()
    this.win = null
    this.current = null
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    const cur = this.current
    const win = this.win
    if (!cur || !win || win.isDestroyed() || this.finishing || this.finished) return
    if (Date.now() > this.deadline) {
      this.fail('That took too long, so InboxScout stopped waiting. You can try again or paste the app password below.')
      return
    }
    let url = ''
    try {
      url = win.webContents.getURL()
      if (win.webContents.isLoading()) return
      const onForm = FORM_PAGES[cur.provider].test(url)
      const fill = onForm && this.filledOn !== url
      const r = (await win.webContents.executeJavaScript(POLL_SCRIPT(fill), true)) as { text: string; filled: boolean }
      if (r.filled) this.filledOn = url
      if (!onForm) return
      const pw = extractAppPassword(cur.provider, r.text ?? '')
      if (!pw) return
      this.finishing = true
      this.clearTimer()
      this.deps.emit({ ...cur, status: 'captured', message: 'Got it. Checking that it works…' })
      try {
        const message = await this.deps.finish(cur.provider, cur.email, pw)
        this.finished = true
        this.deps.emit({ ...cur, status: 'done', message })
        this.deps.log?.('info', 'app password captured and account connected', { provider: cur.provider })
        setTimeout(() => {
          if (this.win && !this.win.isDestroyed()) this.win.close()
          this.win = null
          this.current = null
        }, 1500)
      } catch (err) {
        this.finishing = false
        this.fail(String((err as Error)?.message ?? err))
      }
    } catch (err) {
      // A page mid-navigation throws; the next tick tries again.
      this.deps.log?.('warn', 'app password window poll failed', { url, err: String((err as Error)?.message ?? err) })
    }
  }

  private fail(message: string): void {
    const cur = this.current
    this.clearTimer()
    this.finished = true
    if (cur) this.deps.emit({ ...cur, status: 'failed', message })
    this.current = null
  }
}

function label(provider: AppPasswordProvider): string {
  return provider === 'gmail' ? 'Google' : provider === 'yahoo' ? 'Yahoo' : 'Apple'
}

function isAllowed(url: string, domains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return domains.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

/** Exported for tests: drop the Electron and app tokens from the user agent, leaving plain Chrome. */
export function chromeUserAgent(ua: string, name = 'inboxscout'): string {
  return ua
    .replace(/\s?Electron\/\S+/g, '')
    .replace(new RegExp(`\\s?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/\\S+`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
