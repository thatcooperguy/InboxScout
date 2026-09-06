import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { saveSettings, loadSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { buildOps, runOp, SETTINGS_ALLOWLIST, type OpsDeps } from '../src/main/api/ops'
import { handleMcp } from '../src/main/api/mcp'
import { deleteSignin, getSignin, listSignins, pickSigninForHost, saveSignin } from '../src/main/signins'
import type { DesktopControl } from '../src/main/desktop/control'

class FakeSecrets {
  map = new Map<string, string>()
  get(name: string): string | null {
    return this.map.get(name) ?? null
  }
  set(name: string, value: string): void {
    this.map.set(name, value)
  }
  delete(name: string): void {
    this.map.delete(name)
  }
}

function makeDeps(): { deps: OpsDeps; calls: string[] } {
  const db = openDatabase(':memory:')
  const secrets = new FakeSecrets()
  const calls: string[] = []
  /** Minimal stand-in for DesktopControl: records calls; the person "says no" to anything mentioning "secret". */
  const denied = (detail: string): void => {
    if (/secret/i.test(detail)) throw new Error('consent_denied: You chose "Don\'t allow"')
  }
  const desktop = {
    screenshot: async () => ({ dataUrl: 'data:image/png;base64,AA==', width: 16, height: 10, screenWidth: 1600, screenHeight: 1000 }),
    click: async (x: number, y: number) => `clicked ${x},${y}`,
    type: async (text: string) => `typed ${text}`,
    key: async (combo: string) => `pressed ${combo}`,
    open: async (target: string) => `opened ${target}`,
    run: async (command: string) => {
      denied(command)
      calls.push(`run:${command}`)
      return { code: 0, stdout: 'ok\n', stderr: '', timedOut: false }
    },
    readFile: async (path: string) => {
      denied(path)
      return `contents of ${path}`
    },
    writeFile: async (path: string) => `wrote ${path}`,
    listDir: async () => [{ name: 'Documents', dir: true, size: 0 }]
  } as unknown as DesktopControl
  const deps: OpsDeps = {
    db,
    secrets,
    desktop,
    agent: {
      getStatus: () => ({ status: 'idle', log: [], captured: {}, task: null }),
      answer: (t) => calls.push(`answer:${t}`),
      continueAfterHandoff: () => calls.push('continue'),
      stop: () => calls.push('stop'),
      isBusy: () => false
    },
    startAgent: (input) => {
      calls.push(`start:${input.recipeId ?? input.goal}`)
      return { ok: true }
    },
    runNow: async () => calls.push('run'),
    isRunning: () => false,
    connectAccount: async (input) => {
      calls.push(`connect:${input.email}`)
      return { id: 'acc-1', label: input.email, email: input.email, provider: 'gmail', host: 'imap.gmail.com', port: 993, folders: ['INBOX'], createdAt: '' }
    },
    notify: (title, body) => calls.push(`notify:${title}:${body}`),
    speak: (text) => calls.push(`speak:${text}`),
    listSkills: () => [{ id: 'bills', name: 'Bills', description: '', enabled: true, builtin: true }],
    setEnabledSkills: (ids) => calls.push(`skills:${ids.join(',')}`)
  }
  return { deps, calls }
}

describe('bridge operations', () => {
  it('exposes read ops in read-only mode and blocks writes', async () => {
    const { deps, calls } = makeDeps()
    const ops = buildOps(deps)
    expect(await runOp(ops, 'get_brief', {}, true)).toBeNull()
    expect(await runOp(ops, 'list_issues', {}, true)).toEqual([])
    await expect(runOp(ops, 'run_scan', {}, true)).rejects.toThrow(/read-only/)
    expect(calls).not.toContain('run')
    expect(await runOp(ops, 'run_scan', {}, false)).toEqual({ started: true })
    expect(calls).toContain('run')
  })

  it('rejects unknown ops and missing required args', async () => {
    const ops = buildOps(makeDeps().deps)
    await expect(runOp(ops, 'launch_missiles', {}, false)).rejects.toThrow(/Unknown/)
    await expect(runOp(ops, 'search_mail', {}, false)).rejects.toThrow(/Missing required argument "q"/)
  })

  it('drives the Assistant and the desktop through ops', async () => {
    const { deps, calls } = makeDeps()
    const ops = buildOps(deps)
    await runOp(ops, 'assistant_start', { recipeId: 'gmail-app-password', params: { email: 'mom@gmail.com' } }, false)
    await runOp(ops, 'assistant_answer', { text: 'the second account' }, false)
    await runOp(ops, 'assistant_continue', {}, false)
    await runOp(ops, 'notify', { body: 'Bill due Friday' }, false)
    await runOp(ops, 'speak', { text: 'Hello' }, false)
    await runOp(ops, 'connect_account', { email: 'dad@yahoo.com', provider: 'yahoo', password: 'abcdabcdabcdabcd' }, false)
    expect(calls).toEqual([
      'start:gmail-app-password',
      'answer:the second account',
      'continue',
      'notify:InboxScout:Bill due Friday',
      'speak:Hello',
      'connect:dad@yahoo.com'
    ])
  })

  it('only lets agents touch allow-listed settings', async () => {
    const { deps } = makeDeps()
    const ops = buildOps(deps)
    const r: any = await runOp(ops, 'update_settings', { patch: { speakBriefs: true, googleClientSecret: 'hack', schedule: { hour: 9 } } }, false)
    expect(r.changed).toEqual(['schedule', 'speakBriefs'])
    const s = loadSettings(deps.db)
    expect(s.speakBriefs).toBe(true)
    expect(s.schedule.hour).toBe(9)
    expect(s.schedule.minute).toBe(DEFAULT_SETTINGS.schedule.minute)
    expect(s.googleClientSecret).toBe('')
    const pub: any = await runOp(ops, 'get_settings', {}, true)
    expect(Object.keys(pub).sort()).toEqual([...SETTINGS_ALLOWLIST].sort())
    expect(pub.googleClientSecret).toBeUndefined()
  })

  it('stores saved sign-ins encrypted-store-side and never lists passwords', async () => {
    const { deps } = makeDeps()
    const ops = buildOps(deps)
    await runOp(ops, 'save_signin', { email: 'Mom@Gmail.com', password: 'hunter2' }, false)
    expect(await runOp(ops, 'list_signins', {}, true)).toEqual(['mom@gmail.com'])
    expect(JSON.stringify(await runOp(ops, 'list_signins', {}, true))).not.toContain('hunter2')
    expect(getSignin(deps.db, deps.secrets, 'mom@gmail.com')).toEqual({ email: 'mom@gmail.com', password: 'hunter2' })
    expect(pickSigninForHost(deps.db, deps.secrets, 'accounts.google.com')?.email).toBe('mom@gmail.com')
    expect(pickSigninForHost(deps.db, deps.secrets, 'login.yahoo.com')).toBeNull()
    deleteSignin(deps.db, deps.secrets, 'mom@gmail.com')
    expect(listSignins(deps.db)).toEqual([])
    expect(getSignin(deps.db, deps.secrets, 'mom@gmail.com')).toBeNull()
    expect(() => saveSignin(deps.db, deps.secrets, '', 'x')).toThrow()
  })

  it('lists, detects, and sets profiles through ops', async () => {
    const { deps } = makeDeps()
    const ops = buildOps(deps)
    const list: any = await runOp(ops, 'list_profiles', {}, true)
    expect(list.profiles.length).toBeGreaterThanOrEqual(4)
    expect(list.current).toBe('general')
    expect(list.auto).toBe(true)
    expect(await runOp(ops, 'detect_profile', {}, true)).toBeNull()
    const set: any = await runOp(ops, 'set_profile', { id: 'realestate' }, false)
    expect(set).toEqual({ ok: true, profileId: 'realestate', auto: false })
    await expect(runOp(ops, 'set_profile', { id: 'astronaut-zzz' }, false)).rejects.toThrow(/Unknown profile/)
    const auto: any = await runOp(ops, 'set_profile', { id: 'auto' }, false)
    expect(auto.auto).toBe(true)
    expect(auto.profileId).toBe('realestate')
  })

  it('serves people, schedule, and promises from the latest brief', async () => {
    const ops = buildOps(makeDeps().deps)
    expect(await runOp(ops, 'list_people', {}, true)).toEqual([])
    expect(await runOp(ops, 'get_schedule', {}, true)).toBeNull()
    expect(await runOp(ops, 'list_promises', {}, true)).toEqual([])
  })

  // ---- Conversation (v1.4, Part B): the read-only `ask` op ----
  it('answers questions through the read-only ask op, one at a time', async () => {
    const { deps, calls } = makeDeps()
    const ops = buildOps(deps)
    const a: any = await runOp(ops, 'ask', { q: 'Who is waiting on me?' }, true)
    expect(a).toMatchObject({ engine: 'local', sources: [], unsure: false })
    expect(a.text).toContain('No brief yet')
    await expect(runOp(ops, 'ask', {}, true)).rejects.toThrow(/Missing required argument "q"/)
    // Without a health hook the local engine says it cannot check; nothing was run or sent.
    const h: any = await runOp(ops, 'ask', { q: 'Is anything wrong?' }, true)
    expect(h.text).toMatch(/can't check that from here/)
    expect(calls).toEqual([])
    // One in flight per client: the second concurrent question is refused with 429.
    const results = await Promise.allSettled([runOp(ops, 'ask', { q: 'What is new?' }, true), runOp(ops, 'ask', { q: 'What is new?' }, true)])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect((refused.reason as any).status).toBe(429)
    // A host-provided answerer (local + AI) is used when present, and its answers pass through untouched.
    const custom = buildOps({ ...deps, ask: async (q) => ({ text: `echo ${q}`, sources: [], actions: [], engine: 'ai' as const, unsure: false }) })
    expect(((await runOp(custom, 'ask', { q: 'hi' }, true)) as any).text).toBe('echo hi')
    // Never a write op: read-only access allows it, and it cannot send anything.
    expect(ops.find((o) => o.name === 'ask')?.write).toBe(false)
  })

  it('resolves issues and reads mail through ops', async () => {
    const { deps } = makeDeps()
    const ops = buildOps(deps)
    repo.upsertIssue(deps.db, { id: 'i1', title: 'Sign contract', severity: 'high', state: 'active', ownerAction: 'Sign', deadline: null, createdAt: 'a', updatedAt: 'a' })
    expect((await runOp(ops, 'list_issues', {}, true)) as any[]).toHaveLength(1)
    await runOp(ops, 'resolve_issue', { id: 'i1' }, false)
    expect((await runOp(ops, 'list_issues', {}, true)) as any[]).toHaveLength(0)
    expect((await runOp(ops, 'list_issues', { includeResolved: true }, true)) as any[]).toHaveLength(1)
    saveSettings(deps.db, { ...DEFAULT_SETTINGS })
  })

  // ---- Reads attachments and photos (v1.5) ----
  it('lists and reads attachments as read ops; opening one is a write op that needs the desktop', async () => {
    const { deps } = makeDeps()
    const ops = buildOps(deps)
    expect(ops.find((o) => o.name === 'list_attachments')?.write).toBe(false)
    expect(ops.find((o) => o.name === 'read_attachment')?.write).toBe(false)
    expect(ops.find((o) => o.name === 'open_attachment')?.write).toBe(true)
    expect(await runOp(ops, 'list_attachments', { messageId: 'nope' }, true)).toEqual([])
    expect(await runOp(ops, 'read_attachment', { id: 'nope' }, true)).toBeNull()
    await expect(runOp(ops, 'list_attachments', {}, true)).rejects.toThrow(/Missing required argument "messageId"/)
    await expect(runOp(ops, 'open_attachment', { id: 'x' }, true)).rejects.toThrow(/read-only/)
    // No openPath on a lean host: a plain error, never a crash.
    await expect(runOp(ops, 'open_attachment', { id: 'x' }, false)).rejects.toThrow(/only available on the computer/)
    const opened: string[] = []
    const desktopOps = buildOps({ ...deps, openPath: async (p) => (opened.push(p), '') })
    await expect(runOp(desktopOps, 'open_attachment', { id: 'x' }, false)).rejects.toThrow(/No such attachment/)
    expect(opened).toEqual([])
    // A real attachment: listed without its path, readable with text and facts, openable.
    const { saveIncoming, extractPending } = await import('../src/main/attachments/index')
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    repo.insertMessage(deps.db, { id: 'm-1', accountId: 'acc-1', folder: 'INBOX', uid: 1, messageId: '<m1@x>', threadKey: 't', fromAddress: 'a@b.com', fromName: 'A', toAddresses: 'me@x', subject: 'Invoice', date: '2026-09-05T00:00:00.000Z', snippet: '', bodyText: '', fromMe: false, listUnsubscribe: null, hasAttachments: true })
    const data = new TextEncoder().encode('INVOICE\nAmount due: $450.00\n')
    saveIncoming(deps.db, mkdtempSync(join(tmpdir(), 'inboxscout-ops-')), { messageId: 'm-1', accountId: 'acc-1', filename: 'invoice.txt', contentType: 'text/plain', size: data.length, data })
    await extractPending(deps.db, { limit: 5, ocr: false })
    const listed: any[] = (await runOp(ops, 'list_attachments', { messageId: 'm-1' }, true)) as any[]
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ filename: 'invoice.txt', status: 'done', hasFile: true })
    expect(listed[0]).not.toHaveProperty('path')
    expect(listed[0]).not.toHaveProperty('text')
    const read: any = await runOp(ops, 'read_attachment', { id: listed[0].id }, true)
    expect(read.filename).toBe('invoice.txt')
    expect(read.text).toContain('$450.00')
    expect(read.facts.amounts).toContain('$450.00')
    expect(await runOp(desktopOps, 'open_attachment', { id: listed[0].id }, false)).toEqual({ ok: true, filename: 'invoice.txt' })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatch(/invoice\.txt$/)
  })

  it('exposes system control as write ops and surfaces a refused popup as consent_denied', async () => {
    const { deps, calls } = makeDeps()
    const ops = buildOps(deps)
    // Every system op needs Full access.
    for (const name of ['desktop_screenshot', 'desktop_click', 'desktop_type', 'desktop_key', 'desktop_open', 'desktop_run', 'files_read', 'files_write', 'files_list']) {
      await expect(runOp(ops, name, { x: 1, y: 2, text: 't', combo: 'enter', target: 'x', command: 'ls', path: '~' }, true)).rejects.toThrow(/read-only/)
    }
    const shot: any = await runOp(ops, 'desktop_screenshot', {}, false)
    expect(shot).toMatchObject({ width: 16, height: 10, screenWidth: 1600, screenHeight: 1000 })
    expect(shot.dataUrl).toMatch(/^data:image\/png/)
    expect(await runOp(ops, 'desktop_click', { x: 0, y: 5 }, false)).toBe('clicked 0,5')
    expect(await runOp(ops, 'desktop_run', { command: 'ls' }, false)).toEqual({ code: 0, stdout: 'ok\n', stderr: '', timedOut: false })
    expect(await runOp(ops, 'files_read', { path: '~/notes.txt' }, false)).toEqual({ text: 'contents of ~/notes.txt' })
    expect(await runOp(ops, 'files_write', { path: '~/empty.txt' }, false)).toEqual({ ok: true })
    expect(calls).toContain('run:ls')
    // The person clicks "Don't allow": the error keeps the consent_denied prefix so agents know not to retry.
    await expect(runOp(ops, 'desktop_run', { command: 'cat secret' }, false)).rejects.toThrow(/consent_denied/)
    await expect(runOp(ops, 'files_read', { path: '~/secret.txt' }, false)).rejects.toThrow(/^consent_denied: /)
    const mcp = await handleMcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'desktop_run', arguments: { command: 'cat secret' } } }, ops, { readOnly: false, version: '1.1.0' })
    expect((mcp.body as any).result.isError).toBe(true)
    expect((mcp.body as any).result.content[0].text).toContain('consent_denied')
  })
})

describe('trusted helper ops (v1.4)', () => {
  const withHelperDeps = (): { deps: OpsDeps; sent: string[] } => {
    const { deps } = makeDeps()
    const sent: string[] = []
    repo.upsertAccount(deps.db, { id: 'acc-1', label: 'Mom', email: 'mom@example.com', provider: 'gmail', host: 'imap.gmail.com', port: 993, folders: ['INBOX'], createdAt: '' })
    deps.secrets.set('account:acc-1', 'app-password')
    deps.helpers = { askDelayMs: 5, personName: 'Mom', send: async (_o, _p, to, subject) => void sent.push(`${to}:${subject}`) }
    return { deps, sent }
  }

  it('respects read-only: listing and the log are reads, everything else needs Full', async () => {
    const ops = buildOps(withHelperDeps().deps)
    expect(await runOp(ops, 'helper_list', {}, true)).toEqual({ paused: false, helpers: [] })
    expect(await runOp(ops, 'helper_log', {}, true)).toEqual([])
    for (const name of ['helper_add', 'helper_update', 'helper_remove', 'helper_ask', 'helper_cancel', 'helper_pause_all']) {
      await expect(runOp(ops, name, { name: 'Sarah', level: 'needs', id: 'x', patch: {}, helperId: 'x', title: 't', sendId: 's', paused: true }, true)).rejects.toThrow(/read-only/)
    }
  })

  it('helper_add sends the hello, starts the 7-day notice, and helper_list masks contact details', async () => {
    const { deps, sent } = withHelperDeps()
    const ops = buildOps(deps)
    const added: any = await runOp(ops, 'helper_add', { name: 'Sarah', relationship: 'daughter', email: 'sarah@gmail.com', phone: '5551234567', carrier: 'verizon', level: 'needs' }, false)
    expect(added.email).toBe('s***@gmail.com')
    expect(added.phone).toBe('***-***-4567')
    expect(added.addedBy).toBe('bridge')
    expect(sent).toEqual(['sarah@gmail.com:InboxScout: Mom added you as a trusted helper'])
    const listed: any = await runOp(ops, 'helper_list', {}, true)
    expect(listed.helpers).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain('sarah@gmail.com')
    expect(JSON.stringify(listed)).not.toContain('5551234567')
    expect(loadSettings(deps.db).helperNoticeUntil).not.toBeNull()
    // The full address is only on the person's own screen (settings), never through the bridge.
    expect(loadSettings(deps.db).helpers[0].email).toBe('sarah@gmail.com')
    const log: any[] = (await runOp(ops, 'helper_log', {}, true)) as any[]
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ kind: 'hello', status: 'sent', channel: 'email' })

    const updated: any = await runOp(ops, 'helper_update', { id: added.id, patch: { level: 'schedule', paused: true, email: 'hacker@evil.example' } }, false)
    expect(updated).toMatchObject({ level: 'schedule', paused: true, email: 's***@gmail.com' })
    expect(await runOp(ops, 'helper_pause_all', { paused: true }, false)).toEqual({ paused: true })
    expect(loadSettings(deps.db).helpersPaused).toBe(true)
    expect(await runOp(ops, 'helper_pause_all', { paused: false }, false)).toEqual({ paused: false })
    expect(await runOp(ops, 'helper_remove', { id: added.id }, false)).toEqual({ ok: true })
    expect(((await runOp(ops, 'helper_list', {}, true)) as any).helpers).toEqual([])
  })

  it('helper_ask queues with a delay and helper_cancel stops it', async () => {
    const { deps, sent } = withHelperDeps()
    const ops = buildOps(deps)
    const added: any = await runOp(ops, 'helper_add', { name: 'Sarah', email: 'sarah@gmail.com', level: 'ask' }, false)
    const r: any = await runOp(ops, 'helper_ask', { helperId: added.id, title: 'Sign the lease', nextStep: 'Open the PDF' }, false)
    expect(r.sendId).toBeTruthy()
    expect(r.helperName).toBe('Sarah')
    expect(new Date(r.sendsAt).getTime()).toBeGreaterThan(Date.now() - 1000)
    expect(await runOp(ops, 'helper_cancel', { sendId: r.sendId }, false)).toEqual({ cancelled: true })
    await new Promise((res) => setTimeout(res, 20))
    expect(sent.filter((s) => s.includes('needs a hand'))).toEqual([])
    const log: any[] = (await runOp(ops, 'helper_log', {}, true)) as any[]
    expect(log.find((l) => l.id === r.sendId)).toMatchObject({ kind: 'ask', status: 'cancelled' })
    await expect(runOp(ops, 'helper_ask', { helperId: 'nope', title: 'x' }, false)).rejects.toThrow(/No helper/)
  })

  it('update_settings cannot touch helpers, helpersPaused, or setupBy', async () => {
    const { deps } = withHelperDeps()
    const ops = buildOps(deps)
    const r: any = await runOp(ops, 'update_settings', { patch: { helpers: [{ name: 'Mallory', email: 'm@evil.example' }], helpersPaused: true, setupBy: 'someone_else', speakBriefs: true } }, false)
    expect(r.changed).toEqual(['speakBriefs'])
    expect(loadSettings(deps.db).helpers).toEqual([])
    expect(loadSettings(deps.db).helpersPaused).toBe(false)
    expect(SETTINGS_ALLOWLIST).not.toContain('helpers')
    const pub: any = await runOp(ops, 'get_settings', {}, true)
    expect(pub.helpers).toBeUndefined()
  })
})

describe('MCP server', () => {
  it('handles initialize, tools/list, and tools/call', async () => {
    const { deps, calls } = makeDeps()
    const ops = buildOps(deps)
    const init = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ops, { readOnly: false, version: '0.7.0' })
    expect(init.status).toBe(200)
    expect((init.body as any).result.serverInfo.name).toBe('inboxscout')
    expect((init.body as any).result.protocolVersion).toBe('2025-06-18')

    const note = await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, ops, { readOnly: false, version: '0.7.0' })
    expect(note.status).toBe(202)

    const list = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ops, { readOnly: false, version: '0.7.0' })
    const names = (list.body as any).result.tools.map((t: any) => t.name)
    expect(names).toContain('get_brief')
    expect(names).toContain('assistant_start')
    expect((list.body as any).result.tools.find((t: any) => t.name === 'search_mail').inputSchema.required).toEqual(['q'])

    const call = await handleMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'notify', arguments: { body: 'hi' } } }, ops, { readOnly: false, version: '0.7.0' })
    expect((call.body as any).result.isError).toBe(false)
    expect(calls).toContain('notify:InboxScout:hi')
  })

  it('hides write tools in read-only mode and reports errors as tool errors', async () => {
    const ops = buildOps(makeDeps().deps)
    const list = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ops, { readOnly: true, version: '0.7.0' })
    const names = (list.body as any).result.tools.map((t: any) => t.name)
    expect(names).toContain('get_brief')
    expect(names).not.toContain('run_scan')
    const call = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'run_scan', arguments: {} } }, ops, { readOnly: true, version: '0.7.0' })
    expect((call.body as any).result.isError).toBe(true)
    expect((call.body as any).result.content[0].text).toMatch(/read-only/)
    const bad = await handleMcp({ jsonrpc: '2.0', id: 3, method: 'nope' }, ops, { readOnly: true, version: '0.7.0' })
    expect((bad.body as any).error.code).toBe(-32601)
  })
})
