import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { saveSettings, loadSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { buildOps, runOp, SETTINGS_ALLOWLIST, type OpsDeps } from '../src/main/api/ops'
import { handleMcp } from '../src/main/api/mcp'
import { deleteSignin, getSignin, listSignins, pickSigninForHost, saveSignin } from '../src/main/signins'

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
  const deps: OpsDeps = {
    db,
    secrets,
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
