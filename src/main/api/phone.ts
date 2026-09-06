import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { loadSettings } from '../settings'
import type { SecretsLike } from '../signins'
import { buildOps, runOp, type Op, type OpsDeps } from './ops'
import { PHONE_APP_HTML, PHONE_ICON_SVG, phoneManifest } from './phoneApp'

/**
 * "InboxScout on your phone": a second, tiny HTTP server that serves a phone-friendly copy of the brief
 * on the home Wi‑Fi. The desktop shows a QR code; the phone scans it, opens the page, and can add it to
 * the home screen like an app. No app store, no cloud.
 *
 *   GET  /                     the phone web app (phoneApp.ts)
 *   GET  /manifest.webmanifest web app manifest (Add to Home Screen)
 *   GET  /icon.svg             the app icon
 *   GET|POST /api/<op>         a short allow-list of operations from ops.ts, bearer token required
 *
 * Off by default (it opens a door on the local network). Its own token, separate from the agent bridge,
 * regenerable with "New code". Never depends on the bridge being on.
 */

export interface PhoneDeps extends OpsDeps {
  db: DB
  secrets: SecretsLike
  version: string
}

/** Everything a phone may do. Nothing else — no settings, accounts, sign-ins, desktop or file control. */
export const PHONE_OPS = [
  'get_brief',
  'list_issues',
  'resolve_issue',
  'run_scan',
  'scan_status',
  'list_reports',
  'read_report',
  'get_schedule',
  'list_promises',
  'list_people',
  'health_check',
  // Trusted helpers (v1.4): the phone can ask a helper for a hand, never add or change helpers.
  'helper_list',
  'helper_ask',
  'helper_cancel',
  // Conversation (v1.4, Part B): the box at the top of the phone page. Read-only; one in flight per client.
  'ask',
  // Reads attachments (v1.5): what a file said, never the file itself (open_attachment is desktop only).
  'list_attachments',
  'read_attachment'
] as const

export const DEFAULT_PHONE_PORT = 47321
const TOKEN_KEY = 'phone-token'
const NO_STORE = { 'cache-control': 'no-store' }

let server: Server | null = null
let boundPort = 0
let lastError = ''

function token(deps: PhoneDeps): string {
  let t = deps.secrets.get(TOKEN_KEY)
  if (!t) {
    t = randomBytes(18).toString('hex')
    deps.secrets.set(TOKEN_KEY, t)
  }
  return t
}

/** "New code": everyone holding the old link is cut off at once. The server keeps running. */
export function regeneratePhoneToken(deps: PhoneDeps): void {
  deps.secrets.set(TOKEN_KEY, randomBytes(18).toString('hex'))
}

function sameToken(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb)
}

export interface NetAddress {
  address: string
  family: string | number
  internal: boolean
}

const isPrivate = (ip: string): boolean => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)

/**
 * The address a phone on the same Wi‑Fi can reach this computer at: the first non-internal IPv4,
 * preferring the private ranges (192.168.*, 10.*, 172.16–31.*) over anything else. Null when the
 * computer is not on a network at all.
 */
export function lanAddress(interfaces: Record<string, NetAddress[] | undefined> = networkInterfaces() as Record<string, NetAddress[] | undefined>): string | null {
  const candidates: string[] = []
  for (const list of Object.values(interfaces)) {
    for (const n of list ?? []) {
      if (n.internal) continue
      if (n.family !== 'IPv4' && n.family !== 4) continue
      if (n.address.startsWith('169.254.')) continue // link-local: no router, no phone
      candidates.push(n.address)
    }
  }
  return candidates.find(isPrivate) ?? candidates[0] ?? null
}

export function phoneUrl(address: string, port: number, tok: string): string {
  return `http://${address}:${port}/#t=${tok}`
}

export interface PhoneInfo {
  enabled: boolean
  running: boolean
  port: number
  /** This computer's Wi‑Fi address, or null when it is not on a network. */
  address: string | null
  /** The link the QR code holds (null without an address). */
  url: string | null
  qrDataUrl: string | null
  token: string
  /** Plain-words reason the server is not running when it should be ('' when fine). */
  error: string
}

export async function phoneInfo(deps: PhoneDeps): Promise<PhoneInfo> {
  const s = loadSettings(deps.db)
  const port = s.phonePort || DEFAULT_PHONE_PORT
  const enabled = s.phoneAccess === 'on'
  const address = lanAddress()
  const tok = token(deps)
  const url = address ? phoneUrl(address, port, tok) : null
  let qrDataUrl: string | null = null
  if (url) {
    try {
      qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#1e2430', light: '#ffffff' } })
    } catch {
      qrDataUrl = null
    }
  }
  return {
    enabled,
    running: !!server && boundPort === port,
    port,
    address,
    url,
    qrDataUrl,
    token: tok,
    error: enabled ? lastError : ''
  }
}

/** Start or stop the server to match settings. Idempotent; safe to call after every settings save. */
export function syncPhone(deps: PhoneDeps): void {
  const s = loadSettings(deps.db)
  const port = s.phonePort || DEFAULT_PHONE_PORT
  if (s.phoneAccess !== 'on') {
    if (server) {
      server.close()
      server = null
      boundPort = 0
    }
    lastError = ''
    return
  }
  if (server && boundPort === port) return
  if (server) server.close()
  boundPort = 0
  lastError = ''
  const next = createPhoneServer(deps)
  server = next
  next.on('error', (err: NodeJS.ErrnoException) => {
    lastError =
      err.code === 'EADDRINUSE'
        ? `Something else on this computer is already using door ${port}. Change "Door number for my phone" in Settings → Advanced.`
        : `Couldn't open door ${port}: ${err.message}`
    if (server === next) {
      server = null
      boundPort = 0
    }
  })
  next.listen(port, '0.0.0.0', () => {
    if (server === next) boundPort = port
  })
}

/** The server without listening — tests bind it to port 0 themselves. */
export function createPhoneServer(deps: PhoneDeps): Server {
  const ops = buildOps(deps)
  return createServer((req, res) => void handle(req, res, deps, ops))
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { ...NO_STORE, 'content-type': type, 'x-content-type-options': 'nosniff' })
  res.end(body)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body ?? null))
}

async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 64 * 1024) return {}
    chunks.push(c as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: PhoneDeps, ops: Op[]): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://phone.invalid')
  const method = (req.method ?? 'GET').toUpperCase()
  const path = url.pathname

  if (method === 'OPTIONS') {
    res.writeHead(204, NO_STORE)
    res.end()
    return
  }
  if (path === '/' || path === '/index.html') return send(res, 200, 'text/html; charset=utf-8', PHONE_APP_HTML)
  if (path === '/manifest.webmanifest') {
    // The start URL carries the key only for a requester that already has it (see phoneApp.ts).
    const t = url.searchParams.get('t') ?? ''
    const startUrl = t && sameToken(t, token(deps)) ? `/#t=${t}` : '/'
    return send(res, 200, 'application/manifest+json; charset=utf-8', JSON.stringify(phoneManifest(startUrl)))
  }
  if (path === '/icon.svg') return send(res, 200, 'image/svg+xml', PHONE_ICON_SVG)

  if (path.startsWith('/api/')) {
    const auth = req.headers.authorization ?? ''
    const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!sameToken(provided, token(deps))) {
      return json(res, 401, { error: 'This link no longer works. Scan the code on your computer again.' })
    }
    const name = path.slice('/api/'.length)
    if (!(PHONE_OPS as readonly string[]).includes(name)) return json(res, 404, { error: 'Not available from a phone.' })
    if (method !== 'GET' && method !== 'POST') {
      res.writeHead(405, { ...NO_STORE, allow: 'GET, POST' })
      res.end()
      return
    }
    try {
      const args = method === 'GET' ? Object.fromEntries(url.searchParams) : await readJson(req)
      let result = await runOp(ops, name, args, false)
      if (name === 'read_report' && result && typeof result === 'object') {
        // The phone renders the finished HTML brief when there is one (markdown is the fallback).
        const report = repo.getReport(deps.db, String(args.id ?? ''))
        if (report?.html) result = { ...(result as object), html: report.html }
      }
      return json(res, 200, result ?? null)
    } catch (err: any) {
      return json(res, Number(err?.status) || 500, { error: String(err?.message ?? err) })
    }
  }

  return json(res, 404, { error: 'Not found' })
}
