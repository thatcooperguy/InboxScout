import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/main/db/index'
import { loadSettings, saveSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS } from '../src/shared/types'

/**
 * DesktopControl without Electron: the dialog is a scripted fake, so we can
 * check the consent rules (off / never / always / dangerous / override), the
 * consent_denied prefix, and the real /bin/sh + file operations in a temp home.
 */
const fake = vi.hoisted(() => ({
  answers: [] as number[],
  shown: [] as { title: string; buttons: string[]; detail: string }[],
  opened: [] as string[]
}))

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: async (...args: any[]) => {
      const options = args.length === 2 ? args[1] : args[0]
      fake.shown.push({ title: options.title, buttons: options.buttons, detail: options.detail })
      return { response: fake.answers.shift() ?? options.cancelId, checkboxChecked: false }
    }
  },
  desktopCapturer: { getSources: async () => [] },
  screen: { getPrimaryDisplay: () => ({ id: 1, size: { width: 1920, height: 1080 } }) },
  shell: { openExternal: async (url: string) => void fake.opened.push(url) }
}))

import { DesktopControl } from '../src/main/desktop/control'

const home = mkdtempSync(join(tmpdir(), 'inboxscout-home-'))
const posix = process.platform !== 'win32'

function make(patch: Partial<typeof DEFAULT_SETTINGS> = {}): DesktopControl {
  const db = openDatabase(':memory:')
  saveSettings(db, { ...DEFAULT_SETTINGS, ...patch })
  const desktop = new DesktopControl({ db, getWindow: () => null, homeDir: home })
  ;(desktop as any).__db = db
  return desktop
}
const dbOf = (d: DesktopControl): any => (d as any).__db

beforeEach(() => {
  fake.answers.length = 0
  fake.shown.length = 0
  fake.opened.length = 0
})
afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('DesktopControl consent', () => {
  it('is off when Settings says off, and every action then fails with consent_denied', async () => {
    const d = make({ systemControl: 'off' })
    expect(d.enabled()).toBe(false)
    expect(await d.consent('open', 'x', 'Hermes')).toEqual({ allowed: false, reason: 'System control is off in Settings → Who can help' })
    await expect(d.open('https://example.com', 'Hermes')).rejects.toThrow(/^consent_denied: System control is off/)
    expect(fake.shown).toHaveLength(0)
    expect(fake.opened).toEqual([])
  })

  it('honours a remembered Never and Always without a popup', async () => {
    const d = make({ systemConsents: { files: 'never', open: 'always' } })
    expect(d.enabled()).toBe(true)
    await expect(d.readFile('~/anything.txt', 'Hermes')).rejects.toThrow('consent_denied: You set "files" to Never in Settings')
    expect(await d.consent('open', 'x', 'Hermes')).toEqual({ allowed: true, remembered: 'always' })
    await d.open('https://example.com/a', 'the Assistant')
    expect(fake.opened).toEqual(['https://example.com/a'])
    expect(fake.shown).toHaveLength(0)
  })

  it('asks with three buttons, remembers "Always allow", and treats "Don\'t allow" as a refusal', async () => {
    const d = make()
    fake.answers.push(2)
    await expect(d.open('https://example.com', 'Hermes')).rejects.toThrow(/^consent_denied: You chose "Don't allow"/)
    expect(fake.shown[0].buttons).toEqual(['Allow once', 'Always allow', "Don't allow"])
    expect(fake.shown[0].title).toBe('Open something?')
    expect(fake.shown[0].detail).toContain('Hermes — ')
    expect(fake.opened).toEqual([])
    expect(d.consents()).toEqual({})

    fake.answers.push(0)
    expect(await d.consent('open', 'x', 'Hermes')).toEqual({ allowed: true })
    expect(d.consents()).toEqual({})

    fake.answers.push(1)
    expect(await d.consent('open', 'x', 'Hermes')).toEqual({ allowed: true, remembered: 'always' })
    expect(d.consents()).toEqual({ open: 'always' })
    expect(loadSettings(dbOf(d)).systemConsents).toEqual({ open: 'always' })
    // Now remembered: no more popups for "open".
    expect(await d.consent('open', 'y', 'Hermes')).toEqual({ allowed: true, remembered: 'always' })
    expect(fake.shown).toHaveLength(3)

    d.setConsent('open', 'never')
    expect(d.consents()).toEqual({ open: 'never' })
    d.setConsent('open', null)
    d.setConsent('run', 'always')
    d.resetConsents()
    expect(d.consents()).toEqual({})
  })

  it('always asks for dangerous commands with a two-button popup, unless the override is on', async () => {
    const d = make({ systemConsents: { run: 'always' } })
    expect(await d.consent('run', 'ls', 'Hermes', false)).toEqual({ allowed: true, remembered: 'always' })
    fake.answers.push(1)
    expect((await d.consent('run', 'rm -rf ~', 'Hermes', true)).allowed).toBe(false)
    expect(fake.shown[0].buttons).toEqual(['Allow this once', "Don't allow"])
    fake.answers.push(0)
    expect(await d.consent('run', 'rm -rf ~', 'Hermes', true)).toEqual({ allowed: true })
    expect(d.consents()).toEqual({ run: 'always' })

    const full = make({ systemConsents: { run: 'always' }, systemDangerousOverride: true })
    expect(await full.consent('run', 'sudo reboot', 'Hermes', true)).toEqual({ allowed: true, remembered: 'always' })
    expect(fake.shown).toHaveLength(2)
  })

  it('shows popups one at a time, in order', async () => {
    const d = make()
    fake.answers.push(0, 2, 0)
    const results = await Promise.all([d.consent('open', 'a', 'x'), d.consent('files', 'b', 'x'), d.consent('run', 'c', 'x')])
    expect(results.map((r) => r.allowed)).toEqual([true, false, true])
    expect(fake.shown.map((s) => s.title)).toEqual(['Open something?', 'Read or change a file?', 'Run a command?'])
  })
})

describe.skipIf(!posix)('DesktopControl commands and files', () => {
  it('runs commands in the home folder and reports exit codes instead of throwing', async () => {
    const d = make({ systemConsents: { run: 'always' } })
    const ok = await d.run('echo hi; pwd', 'Hermes')
    expect(ok.code).toBe(0)
    expect(ok.timedOut).toBe(false)
    expect(ok.stdout.split('\n')[0]).toBe('hi')
    expect(ok.stdout).toContain(home)
    const bad = await d.run('echo oops >&2; exit 3', 'Hermes')
    expect(bad).toEqual({ code: 3, stdout: '', stderr: 'oops\n', timedOut: false })
    const slow = await d.run('sleep 5', 'Hermes', { timeoutMs: 1000 })
    expect(slow.timedOut).toBe(true)
    await expect(d.run('ls', 'Hermes', { cwd: '/' })).rejects.toThrow(/outside your home folder/)
    mkdirSync(join(home, 'proj'), { recursive: true })
    // macOS temp folders are symlinks (/var → /private/var), so compare real paths.
    expect(realpathSync((await d.run('pwd', 'Hermes', { cwd: '~/proj' })).stdout.trim())).toBe(realpathSync(join(home, 'proj')))
  })

  it('dangerous commands go through the popup even when run is Always', async () => {
    const d = make({ systemConsents: { run: 'always' } })
    fake.answers.push(1)
    await expect(d.run('sudo ls', 'Hermes')).rejects.toThrow(/^consent_denied: /)
    expect(fake.shown).toHaveLength(1)
  })

  it('reads, writes, and lists inside the home folder only, and never in secret folders', async () => {
    const d = make({ systemConsents: { files: 'always' } })
    expect(await d.writeFile('~/notes/todo.txt', 'buy milk', 'Hermes')).toMatch(/Wrote 8 bytes/)
    expect(await d.readFile(join(home, 'notes', 'todo.txt'), 'Hermes')).toBe('buy milk')
    expect(await d.readFile('notes/todo.txt', 'Hermes')).toBe('buy milk')
    writeFileSync(join(home, 'notes', 'big.txt'), 'x'.repeat(200 * 1024 + 10))
    const big = await d.readFile('~/notes/big.txt', 'Hermes')
    expect(big.endsWith('…[truncated]')).toBe(true)
    expect(big.length).toBe(200 * 1024 + '…[truncated]'.length)
    const list = await d.listDir('~', 'Hermes')
    expect(list.find((e) => e.name === 'notes')).toEqual({ name: 'notes', dir: true, size: 0 })
    const inNotes = await d.listDir('~/notes', 'Hermes')
    expect(inNotes.map((e) => e.name)).toEqual(['big.txt', 'todo.txt'])
    expect(inNotes[1].size).toBe(8)
    await expect(d.readFile('/etc/hostname', 'Hermes')).rejects.toThrow('That file is outside your home folder')
    await expect(d.readFile('~/../outside.txt', 'Hermes')).rejects.toThrow('That file is outside your home folder')
    await expect(d.writeFile('~/.ssh/id_rsa', 'nope', 'Hermes')).rejects.toThrow('That file is outside your home folder')
    await expect(d.listDir('~/.aws', 'Hermes')).rejects.toThrow('That file is outside your home folder')
    await expect(d.readFile('~/notes', 'Hermes')).rejects.toThrow(/is a folder/)
  })

  it('refuses to open paths outside home before touching the OS', async () => {
    const d = make({ systemConsents: { open: 'always' } })
    await expect(d.open('/etc/passwd', 'Hermes')).rejects.toThrow('That is outside your home folder')
    await expect(d.open('~/.gnupg/secring', 'Hermes')).rejects.toThrow('That is outside your home folder')
  })
})
