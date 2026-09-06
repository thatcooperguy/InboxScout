import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { loadSettings, saveSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import type { OpsDeps } from '../src/main/api/ops'
import type { DesktopControl } from '../src/main/desktop/control'
import { PHONE_OPS, createPhoneServer, lanAddress, phoneInfo, phoneUrl, regeneratePhoneToken, type PhoneDeps } from '../src/main/api/phone'
import { PHONE_APP_HTML, PHONE_ICON_SVG, phoneManifest } from '../src/main/api/phoneApp'

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

function makeDeps(): { deps: PhoneDeps; calls: string[] } {
  const db = openDatabase(':memory:')
  const secrets = new FakeSecrets()
  const calls: string[] = []
  const desktop = {
    run: async (command: string) => {
      calls.push(`run:${command}`)
      return { code: 0, stdout: '', stderr: '', timedOut: false }
    }
  } as unknown as DesktopControl
  const base: OpsDeps = {
    db,
    secrets,
    desktop,
    agent: { getStatus: () => ({}), answer: () => undefined, continueAfterHandoff: () => undefined, stop: () => undefined, isBusy: () => false },
    startAgent: () => ({ ok: true }),
    runNow: async () => {
      calls.push('run')
    },
    isRunning: () => false,
    connectAccount: async (input) => {
      calls.push(`connect:${input.email}`)
      return { id: 'acc-1', label: input.email, email: input.email, provider: 'gmail', host: '', port: 993, folders: ['INBOX'], createdAt: '' }
    },
    notify: (t, b) => calls.push(`notify:${t}:${b}`),
    speak: (t) => calls.push(`speak:${t}`),
    listSkills: () => [],
    setEnabledSkills: () => undefined
  }
  return { deps: { ...base, db, secrets, version: '1.3.0' }, calls }
}

describe('lanAddress', () => {
  const iface = (address: string, internal = false, family: string | number = 'IPv4'): { address: string; internal: boolean; family: string | number } => ({ address, internal, family })

  it('prefers a private Wi‑Fi address over loopback, IPv6, link-local, and public ones', () => {
    expect(
      lanAddress({
        lo: [iface('127.0.0.1', true)],
        eth0: [iface('fe80::1', false, 'IPv6'), iface('203.0.113.9')],
        wlan0: [iface('169.254.10.10'), iface('192.168.1.42')]
      })
    ).toBe('192.168.1.42')
    expect(lanAddress({ en0: [iface('10.0.0.7')], docker0: [iface('172.17.0.1')] })).toBe('10.0.0.7')
    expect(lanAddress({ en0: [iface('172.20.4.4')] })).toBe('172.20.4.4')
  })

  it('accepts the numeric family Node once used and falls back to any non-internal IPv4', () => {
    expect(lanAddress({ en0: [iface('192.168.0.5', false, 4)] })).toBe('192.168.0.5')
    expect(lanAddress({ eth0: [iface('203.0.113.9')] })).toBe('203.0.113.9')
  })

  it('is null with no usable network', () => {
    expect(lanAddress({})).toBeNull()
    expect(lanAddress({ lo: [iface('127.0.0.1', true)], x: undefined })).toBeNull()
    expect(lanAddress({ eth0: [iface('fe80::1', false, 'IPv6')] })).toBeNull()
  })
})

describe('phone server', () => {
  const { deps, calls } = makeDeps()
  let server: Server
  let base = ''
  const token = (): string => deps.secrets.get('phone-token') ?? ''
  const call = (path: string, init: RequestInit = {}, tok: string | null = token()): Promise<Response> =>
    fetch(`${base}${path}`, { ...init, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(init.headers ?? {}) } })
  const post = (op: string, body: unknown = {}, tok: string | null = token()): Promise<Response> =>
    call(`/api/${op}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, tok)
  const jsonOf = (r: Response): Promise<any> => r.json()

  beforeAll(async () => {
    saveSettings(deps.db, { ...DEFAULT_SETTINGS, phoneAccess: 'on' })
    await phoneInfo(deps) // mints the token the way the desktop would before showing the QR
    server = createPhoneServer(deps)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('serves the phone page, manifest, and icon without a token — and without leaking it', async () => {
    const page = await call('/', {}, null)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(page.headers.get('cache-control')).toBe('no-store')
    const html = await page.text()
    expect(html).toContain('InboxScout')
    expect(html).toContain('apple-mobile-web-app-capable')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('Check my email')
    expect(html).not.toContain(token())
    expect(html).toBe(PHONE_APP_HTML)

    const manifest = await call('/manifest.webmanifest', {}, null)
    expect(manifest.headers.get('content-type')).toContain('manifest+json')
    const m = await jsonOf(manifest)
    expect(m.name).toBe('InboxScout')
    expect(m.display).toBe('standalone')
    expect(m.theme_color).toBe('#2456a6')
    expect(m.start_url).toBe('/')
    expect(m.icons[0].src.startsWith('data:image/svg+xml')).toBe(true)
    expect(JSON.stringify(m)).not.toContain(token())

    const icon = await call('/icon.svg', {}, null)
    expect(icon.headers.get('content-type')).toContain('image/svg+xml')
    expect(await icon.text()).toBe(PHONE_ICON_SVG)
    expect(PHONE_ICON_SVG).toContain('#c0392f')
  })

  it('puts the key in the manifest start URL only for a requester that already has it', async () => {
    const withKey = await jsonOf(await call(`/manifest.webmanifest?t=${token()}`, {}, null))
    expect(withKey.start_url).toBe(`/#t=${token()}`)
    const wrong = await jsonOf(await call('/manifest.webmanifest?t=nope', {}, null))
    expect(wrong.start_url).toBe('/')
    expect(phoneManifest().start_url).toBe('/')
  })

  it('rejects /api without the token and accepts it with', async () => {
    expect((await call('/api/get_brief', {}, null)).status).toBe(401)
    expect((await call('/api/get_brief', {}, 'wrong-token')).status).toBe(401)
    expect((await call('/api/get_brief', { headers: { authorization: 'Basic abc' } }, null)).status).toBe(401)
    const body = await jsonOf(await call('/api/get_brief', {}, null))
    expect(JSON.stringify(body)).not.toContain(token())

    const ok = await call('/api/get_brief')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(await jsonOf(ok)).toBeNull()
    expect(await jsonOf(await post('scan_status'))).toEqual({ running: false, lastRunAt: null })
  })

  it('refuses everything outside the allow-list, even with the token', async () => {
    for (const op of ['get_settings', 'update_settings', 'list_accounts', 'connect_account', 'save_signin', 'list_signins', 'desktop_run', 'files_read', 'assistant_start', 'search_mail', 'read_message', 'health_repair', 'nope']) {
      const r = await post(op, { command: 'ls', path: '~', patch: {} })
      expect(r.status, op).toBe(404)
    }
    expect(calls).not.toContain('run:ls')
    expect(PHONE_OPS).not.toContain('get_settings')
    expect((await call('/nope')).status).toBe(404)
    expect((await call('/api/get_brief', { method: 'DELETE' })).status).toBe(405)
  })

  it('runs the allowed ops: check email, mark done, read past briefs', async () => {
    expect(await jsonOf(await post('run_scan'))).toEqual({ started: true })
    expect(calls).toContain('run')

    repo.upsertIssue(deps.db, { id: 'i1', title: 'Sign the form', severity: 'high', state: 'active', ownerAction: 'Sign', deadline: null, createdAt: 'a', updatedAt: 'a' })
    expect(await jsonOf(await call('/api/list_issues'))).toHaveLength(1)
    expect(await jsonOf(await post('resolve_issue', { id: 'i1' }))).toEqual({ ok: true })
    expect(await jsonOf(await call('/api/list_issues'))).toHaveLength(0)
    expect((await post('resolve_issue', {})).status).toBe(400)

    repo.insertRun(deps.db, { id: 'run-1', startedAt: 'a', finishedAt: 'a', status: 'succeeded', trigger: 'manual', messagesScanned: 1, error: null })
    repo.insertReport(
      deps.db,
      { id: 'rep-1', runId: 'run-1', periodType: 'daily', createdAt: '2026-09-06T07:30:00.000Z', markdown: '# Brief\n\n- one', html: '<h1>Brief</h1>', filePath: null },
      JSON.stringify({ headline: 'Quiet day', topIssues: [], waitingOnYou: [], deadlines: [] })
    )
    const latest = await jsonOf(await call('/api/get_brief'))
    expect(latest.brief.headline).toBe('Quiet day')
    const list = await jsonOf(await post('list_reports', { limit: 5 }))
    expect(list.map((r: any) => r.id)).toEqual(['rep-1'])
    const report = await jsonOf(await post('read_report', { id: 'rep-1' }))
    expect(report).toMatchObject({ id: 'rep-1', markdown: '# Brief\n\n- one', html: '<h1>Brief</h1>' })
    expect(await jsonOf(await call('/api/read_report?id=missing'))).toBeNull()
    expect(await jsonOf(await call('/api/get_schedule'))).toBeNull()
    expect(await jsonOf(await call('/api/list_promises'))).toEqual([])
    expect(await jsonOf(await call('/api/list_people'))).toEqual([])
    expect((await jsonOf(await call('/api/health_check'))).ok).toBe(true)
  })

  // ---- Conversation (v1.4, Part B): the box at the top of the phone page ----
  it('answers questions from the phone through the read-only ask op', async () => {
    expect(PHONE_OPS).toContain('ask')
    expect(PHONE_APP_HTML).toContain('id="chat-form"')
    expect(PHONE_APP_HTML).toContain('Ask about your mail…')
    expect(PHONE_APP_HTML.indexOf('id="chat-form"')).toBeLessThan(PHONE_APP_HTML.indexOf('id="check"'))
    const r = await post('ask', { q: 'Who is waiting on me?' })
    expect(r.status).toBe(200)
    const a = await jsonOf(r)
    expect(a.engine).toBe('local')
    expect(typeof a.text).toBe('string')
    expect(Array.isArray(a.sources)).toBe(true)
    expect(Array.isArray(a.actions)).toBe(true)
    expect((await post('ask', {})).status).toBe(400)
    expect(calls).not.toContain('run:ls')
  })

  it('trusted helpers (v1.4): the phone may list and ask, never add, change, or read the log', async () => {
    for (const op of ['helper_add', 'helper_update', 'helper_remove', 'helper_pause_all', 'helper_log']) {
      expect((await post(op, { name: 'Mallory', level: 'all', id: 'x', patch: {}, paused: true })).status, op).toBe(404)
    }
    expect(await jsonOf(await call('/api/helper_list'))).toEqual({ paused: false, helpers: [] })
    // Allowed, but there is no helper yet: a plain 400, not "not available".
    const none = await post('helper_ask', { helperId: 'nope', title: 'Sign the form' })
    expect(none.status).toBe(400)
    expect((await jsonOf(none)).error).toMatch(/No helper yet/)
    expect((await post('helper_ask', {})).status).toBe(400)
    expect(await jsonOf(await post('helper_cancel', { sendId: 'nope' }))).toEqual({ cancelled: false })
    expect(PHONE_OPS).toContain('helper_ask')
    expect(PHONE_OPS).not.toContain('helper_add')
    expect(PHONE_APP_HTML).toContain('Ask for help')
    expect(PHONE_APP_HTML).toContain('helper_ask')
    expect(PHONE_APP_HTML).toContain('helper_cancel')
  })

  // ---- Reads attachments and photos (v1.5): what a file said, never the file, never "open" ----
  it('lets the phone list and read attachments but never open one', async () => {
    expect(PHONE_OPS).toContain('list_attachments')
    expect(PHONE_OPS).toContain('read_attachment')
    expect(PHONE_OPS).not.toContain('open_attachment')
    expect((await post('open_attachment', { id: 'x' })).status).toBe(404)
    expect(await jsonOf(await call('/api/list_attachments?messageId=nope'))).toEqual([])
    expect(await jsonOf(await post('read_attachment', { id: 'nope' }))).toBeNull()
    expect((await post('list_attachments', {})).status).toBe(400)
    // The Needs-you rows show the attachment source line when the brief carries one.
    expect(PHONE_APP_HTML).toContain('attached')
  })

  it('cuts old links off with a new code', async () => {
    const old = token()
    regeneratePhoneToken(deps)
    expect(token()).not.toBe(old)
    expect((await call('/api/get_brief', {}, old)).status).toBe(401)
    expect((await call('/api/get_brief')).status).toBe(200)
  })

  it('describes itself for the desktop: port, link with the key, QR image', async () => {
    const info = await phoneInfo(deps)
    expect(info.enabled).toBe(true)
    expect(info.port).toBe(47321)
    expect(info.token).toBe(token())
    expect(info.error).toBe('')
    expect(phoneUrl('192.168.1.9', 47321, 'abc')).toBe('http://192.168.1.9:47321/#t=abc')
    if (info.address) {
      expect(info.url).toBe(phoneUrl(info.address, 47321, token()))
      expect(info.qrDataUrl?.startsWith('data:image/png;base64,')).toBe(true)
    } else {
      expect(info.url).toBeNull()
      expect(info.qrDataUrl).toBeNull()
    }
    saveSettings(deps.db, { ...loadSettings(deps.db), phoneAccess: 'off' })
    expect((await phoneInfo(deps)).enabled).toBe(false)
  })
})
