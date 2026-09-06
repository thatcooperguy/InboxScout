import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Linux-only glue that Electron does not provide itself.
 *
 * Windows and macOS have app.setLoginItemSettings; on Linux "start with your
 * computer" is an XDG autostart entry in ~/.config/autostart, which every
 * mainstream desktop (GNOME, KDE, XFCE, Cinnamon, MATE) honours. No Electron
 * import here so the helpers stay testable.
 */

export const AUTOSTART_FILE = 'inboxscout.desktop'

export function autostartDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env['XDG_CONFIG_HOME'] || join(env['HOME'] || homedir(), '.config'), 'autostart')
}

/** Quote a path for the Exec= line of a desktop entry (spaces and the few reserved characters). */
export function desktopExec(path: string): string {
  return `"${path.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`
}

export function autostartEntry(exec: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=InboxScout',
    'Comment=Know what needs you. Skip the rest.',
    `Exec=${desktopExec(exec)}`,
    'Icon=inboxscout',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

/**
 * Create or remove the autostart entry so it matches the setting. `exec` is the
 * AppImage path when running from one (process.env.APPIMAGE), else the binary.
 * Returns true when a file was written or removed.
 */
export function applyLinuxAutostart(enabled: boolean, exec: string, dir = autostartDir()): boolean {
  const file = join(dir, AUTOSTART_FILE)
  if (!enabled) {
    if (!existsSync(file)) return false
    unlinkSync(file)
    return true
  }
  const wanted = autostartEntry(exec)
  if (existsSync(file) && readFileSync(file, 'utf8') === wanted) return false
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, wanted, { mode: 0o644 })
  return true
}
