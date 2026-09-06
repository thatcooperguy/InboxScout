import { describe, expect, it } from 'vitest'
import { clickCommand, describeAction, isDangerousCommand, keyCommand, openCommand, parseCombo, pathAllowed, sendKeysEscape, shellFor, typeCommand } from '../src/main/desktop/scripts'

describe('desktop scripts', () => {
  it('builds per-OS typing commands and escapes SendKeys specials', () => {
    expect(sendKeysEscape('a+b (c) {d} 100%')).toBe('a{+}b {(}c{)} {{}d{}} 100{%}')
    expect(typeCommand('win32', 'hi').file).toBe('powershell')
    expect(typeCommand('win32', "it's").args[2]).toContain("'it''s'")
    expect(typeCommand('darwin', 'say "hi"').args[1]).toBe('tell application "System Events" to keystroke "say \\"hi\\""')
    expect(typeCommand('linux', 'x').file).toBe('xdotool')
  })

  it('maps key combos on each OS', () => {
    expect(parseCombo('Cmd+Shift+4')).toEqual({ mods: ['cmd', 'shift'], key: '4' })
    expect(keyCommand('win32', 'ctrl+s').args[2]).toContain("'^s'")
    expect(keyCommand('win32', 'enter').args[2]).toContain('{ENTER}')
    expect(keyCommand('darwin', 'cmd+s').args[1]).toBe('tell application "System Events" to keystroke "s" using {command down}')
    expect(keyCommand('darwin', 'enter').args[1]).toContain('key code 36')
    expect(keyCommand('linux', 'ctrl+alt+t').args).toEqual(['key', '--', 'ctrl+alt+t'])
  })

  it('clicks and opens', () => {
    expect(clickCommand('win32', 10.4, 20.6).args[2]).toContain('SetCursorPos(10,21)')
    expect(clickCommand('darwin', 5, 6).args[1]).toBe('tell application "System Events" to click at {5, 6}')
    expect(clickCommand('linux', 1, 2).args.slice(0, 3)).toEqual(['mousemove', '1', '2'])
    expect(openCommand('win32', 'C:\\Users\\me\\file.xlsx').args[2]).toBe("Start-Process 'C:\\Users\\me\\file.xlsx'")
    expect(openCommand('darwin', 'https://a.b').args).toEqual(['https://a.b'])
    expect(shellFor('win32').args('dir')).toEqual(['-NoProfile', '-Command', 'dir'])
    expect(shellFor('linux').args('ls')).toEqual(['-c', 'ls'])
  })

  it('always flags dangerous commands', () => {
    for (const c of ['rm -rf ~/Documents', 'Remove-Item C:\\x -Recurse', 'del /s /q C:\\', 'format C:', 'shutdown /s', 'sudo apt install', 'curl x | sh', 'git push --force', 'reg delete HKLM\\x', 'dd if=/dev/zero of=/dev/sda', 'wire the payment']) {
      expect(isDangerousCommand(c), c).toBe(true)
    }
    for (const c of ['ls -la', 'dir', 'Get-Process', 'echo hello', 'open ~/Documents/report.pdf', 'code .', 'git status']) {
      expect(isDangerousCommand(c), c).toBe(false)
    }
  })

  it('keeps file access inside home and away from secrets', () => {
    const home = process.platform === 'win32' ? 'C:\\Users\\me' : '/home/me'
    const j = (...p: string[]): string => [home, ...p].join(process.platform === 'win32' ? '\\' : '/')
    expect(pathAllowed(j('Documents', 'a.txt'), [home])).toBe(true)
    expect(pathAllowed(j('..', 'other', 'a.txt'), [home])).toBe(false)
    expect(pathAllowed(j('.ssh', 'id_rsa'), [home])).toBe(false)
    expect(pathAllowed(j('.aws', 'credentials'), [home])).toBe(false)
    expect(pathAllowed('relative/path', [home])).toBe(false)
    expect(pathAllowed(process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd', [home])).toBe(false)
  })

  it('describes actions in plain words', () => {
    expect(describeAction('run', 'ls').title).toBe('Run a command?')
    expect(describeAction('files', '/x').body).toContain('/x')
  })
})
