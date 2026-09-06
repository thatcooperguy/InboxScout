import { BrowserWindow } from 'electron'
import type { Observation, PageElement } from './policy'

/**
 * The Assistant's own browser window. Visible on purpose - the person can
 * watch, take over for sign-ins, and stop it. It runs in an isolated session
 * (its own cookies, no access to the main app or the system browser).
 */

const ENUMERATE = `
(() => {
  const SEL = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="option"], [contenteditable="true"], summary';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return false;
    return r.bottom > 0 && r.top < innerHeight + 200 && r.right > 0 && r.left < innerWidth;
  };
  const label = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const lab = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
    if (lab && lab.textContent) return lab.textContent;
    const wrap = el.closest('label');
    if (wrap && wrap.textContent) return wrap.textContent;
    return (el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
  };
  document.querySelectorAll('[data-is-id]').forEach((el) => el.removeAttribute('data-is-id'));
  const out = [];
  let id = 0;
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el)) continue;
    if (el.disabled) continue;
    id += 1;
    el.setAttribute('data-is-id', String(id));
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.getAttribute('type') || 'text') : undefined;
    const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? ((type === 'submit' || type === 'button') ? 'button' : 'input') : tag === 'select' ? 'select' : tag === 'textarea' ? 'input' : tag === 'button' ? 'button' : tag);
    out.push({
      id, tag, role,
      text: label(el).replace(/\\s+/g, ' ').slice(0, 120),
      name: el.getAttribute('name') || undefined,
      type,
      placeholder: el.getAttribute('placeholder') || undefined,
      href: tag === 'a' ? (el.getAttribute('href') || '').slice(0, 200) : undefined,
      value: (tag === 'input' && type !== 'password' && el.value) ? String(el.value).slice(0, 60) : undefined
    });
    if (out.length >= 150) break;
  }
  return { elements: out, title: document.title, text: (document.body ? document.body.innerText : '').slice(0, 20000) };
})()
`

export class AgentBrowser {
  private win: BrowserWindow | null = null

  constructor(private onClosed: () => void) {}

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  open(url: string): void {
    if (this.isOpen()) {
      void this.navigate(url)
      return
    }
    this.win = new BrowserWindow({
      width: 1180,
      height: 860,
      title: 'InboxScout Assistant — working… (you can take over any time)',
      webPreferences: {
        partition: 'persist:inboxscout-assistant',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    this.win.on('closed', () => {
      this.win = null
      this.onClosed()
    })
    void this.win.loadURL(url)
  }

  bringToFront(): void {
    if (this.isOpen()) this.win!.show()
  }

  setTitle(title: string): void {
    if (this.isOpen()) this.win!.setTitle(title)
  }

  url(): string {
    return this.isOpen() ? this.win!.webContents.getURL() : ''
  }

  async navigate(url: string): Promise<void> {
    if (!this.isOpen()) throw new Error('Assistant window is closed.')
    await this.win!.loadURL(url).catch(() => {})
    await this.settle()
  }

  /** Wait for navigations/AJAX to calm down a bit. */
  async settle(ms = 1200): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
    if (!this.isOpen()) return
    if (this.win!.webContents.isLoading()) {
      await new Promise<void>((resolve) => {
        const done = (): void => resolve()
        this.win!.webContents.once('did-stop-loading', done)
        setTimeout(done, 8000)
      })
    }
  }

  private async exec<T>(script: string): Promise<T> {
    if (!this.isOpen()) throw new Error('Assistant window is closed.')
    return (await this.win!.webContents.executeJavaScript(script, true)) as T
  }

  async observe(withScreenshot: boolean): Promise<Observation> {
    const data = await this.exec<{ elements: PageElement[]; title: string; text: string }>(ENUMERATE)
    let screenshotDataUrl: string | undefined
    if (withScreenshot && this.isOpen()) {
      try {
        const img = await this.win!.webContents.capturePage()
        screenshotDataUrl = img.resize({ width: 1000 }).toDataURL()
      } catch {
        screenshotDataUrl = undefined
      }
    }
    return { url: this.url(), title: data.title, elements: data.elements, text: data.text, screenshotDataUrl }
  }

  async pageText(): Promise<string> {
    return this.exec<string>('document.body ? document.body.innerText : ""')
  }

  async click(id: number): Promise<string> {
    const r = await this.exec<string>(`
      (() => {
        const el = document.querySelector('[data-is-id="${id}"]');
        if (!el) return 'no such element';
        el.scrollIntoView({ block: 'center', inline: 'center' });
        try { el.focus(); } catch (e) {}
        el.click();
        return 'clicked ' + (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 60);
      })()
    `)
    await this.settle()
    return r
  }

  async type(id: number, text: string, pressEnter: boolean): Promise<string> {
    if (!this.isOpen()) throw new Error('Assistant window is closed.')
    const focused = await this.exec<boolean>(`
      (() => {
        const el = document.querySelector('[data-is-id="${id}"]');
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.focus();
        if ('value' in el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
        return true;
      })()
    `)
    if (!focused) return 'no such element'
    // Real key events so React/Angular forms see the input.
    for (const ch of text) {
      this.win!.webContents.sendInputEvent({ type: 'char', keyCode: ch })
      await new Promise((r) => setTimeout(r, 12))
    }
    if (pressEnter) {
      this.win!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      this.win!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    }
    await this.settle(pressEnter ? 1500 : 400)
    return `typed ${text.length} characters${pressEnter ? ' and pressed Enter' : ''}`
  }

  async scroll(direction: 'down' | 'up'): Promise<string> {
    await this.exec(`window.scrollBy(0, ${direction === 'down' ? 600 : -600})`)
    await new Promise((r) => setTimeout(r, 400))
    return `scrolled ${direction}`
  }

  close(): void {
    if (this.isOpen()) this.win!.close()
    this.win = null
  }
}
