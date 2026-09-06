import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

/**
 * Pure building blocks for desktop control: which OS command performs a
 * click, keystroke, or app launch, which commands count as dangerous, and
 * which paths are inside the allowed area. Electron-free and unit-tested.
 */
export type Platform = 'win32' | 'darwin' | 'linux'

export interface OsCommand {
  file: string
  args: string[]
}

/** Map a friendly key combo ("ctrl+s", "enter", "cmd+shift+4") to per-OS syntax. */
const WIN_KEYS: Record<string, string> = {
  enter: '{ENTER}',
  return: '{ENTER}',
  tab: '{TAB}',
  esc: '{ESC}',
  escape: '{ESC}',
  backspace: '{BACKSPACE}',
  delete: '{DELETE}',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  home: '{HOME}',
  end: '{END}',
  pageup: '{PGUP}',
  pagedown: '{PGDN}',
  space: ' ',
  f1: '{F1}',
  f2: '{F2}',
  f3: '{F3}',
  f4: '{F4}',
  f5: '{F5}',
  f6: '{F6}',
  f7: '{F7}',
  f8: '{F8}',
  f9: '{F9}',
  f10: '{F10}',
  f11: '{F11}',
  f12: '{F12}'
}
const MAC_KEYCODES: Record<string, number> = {
  enter: 36,
  return: 36,
  tab: 48,
  esc: 53,
  escape: 53,
  backspace: 51,
  delete: 117,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  space: 49,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111
}

export function parseCombo(combo: string): { mods: string[]; key: string } {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  const key = parts.pop() ?? ''
  const mods = parts.map((m) => (m === 'control' ? 'ctrl' : m === 'command' || m === 'meta' || m === 'super' || m === 'win' ? 'cmd' : m === 'option' ? 'alt' : m))
  return { mods, key }
}

/** Escape text for PowerShell SendKeys (its special characters are + ^ % ~ ( ) { }). */
export function sendKeysEscape(text: string): string {
  return text.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`)
}

const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`
const asQuote = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Type literal text at the current focus. */
export function typeCommand(platform: Platform, text: string): OsCommand {
  if (platform === 'win32') {
    return { file: 'powershell', args: ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psQuote(sendKeysEscape(text))})`] }
  }
  if (platform === 'darwin') return { file: 'osascript', args: ['-e', `tell application "System Events" to keystroke ${asQuote(text)}`] }
  return { file: 'xdotool', args: ['type', '--delay', '12', '--', text] }
}

/** Press a key or combo, e.g. "enter", "ctrl+s", "cmd+shift+4". */
export function keyCommand(platform: Platform, combo: string): OsCommand {
  const { mods, key } = parseCombo(combo)
  if (platform === 'win32') {
    const prefix = mods.map((m) => (m === 'ctrl' ? '^' : m === 'alt' ? '%' : m === 'shift' ? '+' : '')).join('')
    const k = WIN_KEYS[key] ?? (key.length === 1 ? sendKeysEscape(key) : `{${key.toUpperCase()}}`)
    return { file: 'powershell', args: ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psQuote(prefix + k)})`] }
  }
  if (platform === 'darwin') {
    const using = mods.length ? ` using {${mods.map((m) => (m === 'ctrl' ? 'control down' : m === 'alt' ? 'option down' : m === 'shift' ? 'shift down' : 'command down')).join(', ')}}` : ''
    const code = MAC_KEYCODES[key]
    const action = code !== undefined ? `key code ${code}` : `keystroke ${asQuote(key)}`
    return { file: 'osascript', args: ['-e', `tell application "System Events" to ${action}${using}`] }
  }
  const xk = [...mods.map((m) => (m === 'cmd' ? 'super' : m)), key === 'esc' ? 'Escape' : key === 'enter' ? 'Return' : key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1)].join('+')
  return { file: 'xdotool', args: ['key', '--', xk] }
}

/** Click at screen coordinates (top-left origin, physical pixels). */
export function clickCommand(platform: Platform, x: number, y: number, button: 'left' | 'right' = 'left', double = false): OsCommand {
  const X = Math.round(x)
  const Y = Math.round(y)
  if (platform === 'win32') {
    const down = button === 'left' ? 0x0002 : 0x0008
    const up = button === 'left' ? 0x0004 : 0x0010
    const one = `[W.U]::mouse_event(${down},0,0,0,0); [W.U]::mouse_event(${up},0,0,0,0)`
    const script =
      `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);' -Name U -Namespace W; ` +
      `[W.U]::SetCursorPos(${X},${Y}); Start-Sleep -Milliseconds 40; ${one}${double ? `; Start-Sleep -Milliseconds 60; ${one}` : ''}`
    return { file: 'powershell', args: ['-NoProfile', '-Command', script] }
  }
  if (platform === 'darwin') {
    // System Events can click at a point; for a right-click it opens the contextual menu of whatever is there.
    const times = double ? ' with double click' : ''
    return { file: 'osascript', args: ['-e', `tell application "System Events" to click at {${X}, ${Y}}${times}`] }
  }
  return { file: 'xdotool', args: ['mousemove', String(X), String(Y), 'click', double ? '--repeat' : '1', ...(double ? ['2', button === 'left' ? '1' : '3'] : [button === 'left' ? '1' : '3'])] }
}

/** Open a file, folder, app, or URL with the OS default. */
export function openCommand(platform: Platform, target: string): OsCommand {
  if (platform === 'win32') return { file: 'powershell', args: ['-NoProfile', '-Command', `Start-Process ${psQuote(target)}`] }
  if (platform === 'darwin') return { file: 'open', args: [target] }
  return { file: 'xdg-open', args: [target] }
}

/** The shell used for free-form commands. */
export function shellFor(platform: Platform): { file: string; args: (command: string) => string[] } {
  if (platform === 'win32') return { file: 'powershell', args: (c) => ['-NoProfile', '-Command', c] }
  return { file: '/bin/sh', args: (c) => ['-c', c] }
}

/**
 * Commands that must always ask, even under "Always allow": destruction,
 * account/system changes, disabling protection, money.
 */
const DANGER = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i,
  /\brm\s+-r?f?\s+[~/]/i,
  /\b(del|erase|rd|rmdir)\b.*\/[sq]\b/i,
  /\bremove-item\b.*-recurse/i,
  /\bformat(\.com)?\b\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdiskpart\b/i,
  /\b(shutdown|restart-computer|stop-computer|reboot|halt|poweroff)\b/i,
  /\breg(\.exe)?\s+(delete|add)\b/i,
  /\bnet\s+user\b/i,
  /\b(passwd|chpasswd|set-localuser|dscl)\b/i,
  /\bsudo\b/i,
  /\b(bitlocker|manage-bde|fdesetup)\b/i,
  /\b(set-mppreference|disable.*(defender|firewall)|netsh\s+advfirewall\s+set)/i,
  /\b(curl|wget|invoke-webrequest|iwr)\b.*\|\s*(sh|bash|powershell|iex)\b/i,
  /\biex\b|\binvoke-expression\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,
  /\b(git\s+push\s+--force|git\s+reset\s+--hard)\b/i,
  /\b(pay|payment|transfer|wire)\b/i
]

export function isDangerousCommand(command: string): boolean {
  const c = command.trim()
  return DANGER.some((re) => re.test(c))
}

/** Folders that are never touched, even inside home. */
const PROTECTED_SUBDIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.config/gcloud', 'AppData/Local/Microsoft/Credentials', 'AppData/Roaming/Microsoft/Protect', 'Library/Keychains']

/** True when `p` is inside the person's home folder (or another allowed root) and not in a protected subfolder. */
export function pathAllowed(p: string, roots: string[]): boolean {
  if (!p || !isAbsolute(p)) return false
  const target = normalize(resolve(p))
  return roots.some((root) => {
    const r = normalize(resolve(root))
    const rel = relative(r, target)
    if (rel.startsWith('..') || isAbsolute(rel)) return false
    const relPosix = rel.split(sep).join('/')
    return !PROTECTED_SUBDIRS.some((sub) => relPosix === sub || relPosix.startsWith(`${sub}/`))
  })
}

/** Short, human description of a system action for the confirmation popup. */
export function describeAction(kind: 'screenshot' | 'input' | 'open' | 'run' | 'files', detail: string): { title: string; body: string } {
  switch (kind) {
    case 'screenshot':
      return { title: 'Look at your screen?', body: 'InboxScout wants to take a picture of your screen to see what to do next. It stays on this computer.' }
    case 'input':
      return { title: 'Use your keyboard and mouse?', body: `InboxScout wants to click and type on your desktop: ${detail}` }
    case 'open':
      return { title: 'Open something?', body: `InboxScout wants to open: ${detail}` }
    case 'run':
      return { title: 'Run a command?', body: `InboxScout wants to run this on your computer:\n\n${detail}` }
    case 'files':
      return { title: 'Read or change a file?', body: `InboxScout wants to work with: ${detail}` }
  }
}
