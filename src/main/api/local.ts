import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { DB } from '../db/index'
import { loadSettings } from '../settings'
import type { SecretsLike } from '../signins'
import { buildOps, runOp, type Op, type OpsDeps } from './ops'
import { handleMcp } from './mcp'

/**
 * Local bridge: a small HTTP API on 127.0.0.1 so other agents on this
 * computer — Hermes, a custom bot, a script — can use InboxScout as a tool.
 * Three doors, one set of operations (see ops.ts):
 *
 *   REST     GET/POST /v1/...          simple curl-able endpoints
 *   MCP      POST /mcp                 Model Context Protocol (Streamable HTTP)
 *   Events   GET /v1/events            Server-Sent Events: scan progress, Assistant steps
 *
 * Off by default. Bearer token required. Never bound to the network.
 * Access level (read / full) is a user setting checked on every call.
 */

export interface BridgeDeps extends OpsDeps {
  db: DB
  secrets: SecretsLike
  version: string
}

const TOKEN_KEY = 'bridge-token'
let server: Server | null = null
let boundPort = 0
let ops: Op[] = []
const sseClients = new Set<ServerResponse>()

function token(deps: BridgeDeps): string {
  let t = deps.secrets.get(TOKEN_KEY)
  if (!t) {
    t = randomBytes(24).toString('hex')
    deps.secrets.set(TOKEN_KEY, t)
  }
  return t
}

export function regenerateBridgeToken(deps: BridgeDeps): void {
  deps.secrets.set(TOKEN_KEY, randomBytes(24).toString('hex'))
}

export interface BridgeInfo {
  enabled: boolean
  running: boolean
  port: number
  token: string
  url: string
  mcpUrl: string
  access: 'read' | 'full'
}

export function bridgeInfo(deps: BridgeDeps): BridgeInfo {
  const s = loadSettings(deps.db)
  const port = s.bridgePort || 47311
  return {
    enabled: !!s.bridgeEnabled,
    running: !!server && boundPort === port,
    port,
    token: token(deps),
    url: `http://127.0.0.1:${port}/v1`,
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    access: s.bridgeAccess === 'read' ? 'read' : 'full'
  }
}

/** Push an app event (scan progress, Assistant step) to every connected SSE listener. */
export function bridgeBroadcast(channel: string, payload: unknown): void {
  if (sseClients.size === 0) return
  const frame = `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of sseClients) {
    try {
      res.write(frame)
    } catch {
      sseClients.delete(res)
    }
  }
}

/** Start or stop the server to match settings. Idempotent. */
export function syncBridge(deps: BridgeDeps): void {
  const s = loadSettings(deps.db)
  const port = s.bridgePort || 47311
  ops = buildOps(deps)
  if (!s.bridgeEnabled) {
    if (server) {
      for (const c of sseClients) c.end()
      sseClients.clear()
      server.close()
      server = null
      boundPort = 0
    }
    return
  }
  if (server && boundPort === port) return
  if (server) server.close()
  server = createServer((req, res) => void handle(req, res, deps))
  server.on('error', () => {
    server = null
    boundPort = 0
  })
  server.listen(port, '127.0.0.1', () => {
    boundPort = port
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': 'null' })
  res.end(body === null ? '' : JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/** REST routes → operations. `:x` segments become args. */
interface Route {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH'
  path: string
  op: string
  /** Extra arg mapping from query/body (defaults: query for GET, JSON body otherwise). */
  args?: (ctx: { params: Record<string, string>; query: URLSearchParams; body: any }) => Record<string, any>
}

const ROUTES: Route[] = [
  { method: 'GET', path: '/v1/brief', op: 'get_brief' },
  { method: 'GET', path: '/v1/issues', op: 'list_issues', args: ({ query }) => ({ includeResolved: query.get('all') === '1' }) },
  { method: 'POST', path: '/v1/issues/:id/done', op: 'resolve_issue' },
  { method: 'GET', path: '/v1/projects', op: 'list_projects', args: ({ query }) => ({ activeOnly: query.get('active') === '1' }) },
  { method: 'GET', path: '/v1/search', op: 'search_mail', args: ({ query }) => ({ q: query.get('q') ?? '', limit: Number(query.get('limit')) || undefined }) },
  { method: 'GET', path: '/v1/messages', op: 'recent_mail', args: ({ query }) => ({ limit: Number(query.get('limit')) || undefined }) },
  { method: 'GET', path: '/v1/messages/:id', op: 'read_message' },
  { method: 'GET', path: '/v1/reports', op: 'list_reports', args: ({ query }) => ({ limit: Number(query.get('limit')) || undefined }) },
  { method: 'GET', path: '/v1/reports/:id', op: 'read_report' },
  { method: 'POST', path: '/v1/run', op: 'run_scan' },
  { method: 'GET', path: '/v1/run', op: 'scan_status' },
  { method: 'GET', path: '/v1/health', op: 'health_check' },
  { method: 'POST', path: '/v1/health/repair', op: 'health_repair' },
  { method: 'GET', path: '/v1/accounts', op: 'list_accounts' },
  { method: 'POST', path: '/v1/accounts', op: 'connect_account' },
  { method: 'DELETE', path: '/v1/accounts/:id', op: 'remove_account' },
  { method: 'GET', path: '/v1/signins', op: 'list_signins' },
  { method: 'POST', path: '/v1/signins', op: 'save_signin' },
  { method: 'DELETE', path: '/v1/signins/:email', op: 'delete_signin' },
  { method: 'GET', path: '/v1/assistant/recipes', op: 'list_recipes' },
  { method: 'POST', path: '/v1/assistant/start', op: 'assistant_start' },
  { method: 'GET', path: '/v1/assistant/status', op: 'assistant_status' },
  { method: 'POST', path: '/v1/assistant/answer', op: 'assistant_answer' },
  { method: 'POST', path: '/v1/assistant/continue', op: 'assistant_continue' },
  { method: 'POST', path: '/v1/assistant/stop', op: 'assistant_stop' },
  { method: 'POST', path: '/v1/notify', op: 'notify' },
  { method: 'POST', path: '/v1/speak', op: 'speak' },
  { method: 'GET', path: '/v1/people', op: 'list_people', args: ({ query }) => ({ tier: query.get('tier') ?? undefined, limit: Number(query.get('limit')) || undefined }) },
  { method: 'GET', path: '/v1/schedule', op: 'get_schedule' },
  { method: 'GET', path: '/v1/promises', op: 'list_promises' },
  { method: 'GET', path: '/v1/profiles', op: 'list_profiles' },
  { method: 'GET', path: '/v1/profiles/detect', op: 'detect_profile' },
  { method: 'POST', path: '/v1/profiles', op: 'set_profile' },
  { method: 'GET', path: '/v1/skills', op: 'list_skills' },
  { method: 'POST', path: '/v1/skills', op: 'set_skills' },
  { method: 'GET', path: '/v1/settings', op: 'get_settings' },
  { method: 'PATCH', path: '/v1/settings', op: 'update_settings', args: ({ body }) => ({ patch: body?.patch ?? body }) },
  // System control (Full access only; each may pop up a question on the person's screen)
  { method: 'POST', path: '/v1/desktop/screenshot', op: 'desktop_screenshot' },
  { method: 'POST', path: '/v1/desktop/click', op: 'desktop_click' },
  { method: 'POST', path: '/v1/desktop/type', op: 'desktop_type' },
  { method: 'POST', path: '/v1/desktop/key', op: 'desktop_key' },
  { method: 'POST', path: '/v1/desktop/open', op: 'desktop_open' },
  { method: 'POST', path: '/v1/desktop/run', op: 'desktop_run' },
  { method: 'POST', path: '/v1/files/read', op: 'files_read' },
  { method: 'POST', path: '/v1/files/write', op: 'files_write' },
  { method: 'POST', path: '/v1/files/list', op: 'files_list' },
  // Trusted helpers (v1.4, Part A): masked list + log are reads; everything else needs Full access.
  { method: 'GET', path: '/v1/helpers', op: 'helper_list' },
  { method: 'POST', path: '/v1/helpers', op: 'helper_add' },
  { method: 'PATCH', path: '/v1/helpers/:id', op: 'helper_update', args: ({ body }) => ({ patch: body?.patch ?? body }) },
  { method: 'DELETE', path: '/v1/helpers/:id', op: 'helper_remove' },
  { method: 'POST', path: '/v1/helpers/ask', op: 'helper_ask' },
  { method: 'POST', path: '/v1/helpers/cancel', op: 'helper_cancel' },
  { method: 'GET', path: '/v1/helpers/log', op: 'helper_log', args: ({ query }) => ({ limit: Number(query.get('limit')) || undefined, helperId: query.get('helperId') ?? undefined }) },
  { method: 'POST', path: '/v1/helpers/pause', op: 'helper_pause_all' }
]

function matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  const parts = pathname.split('/').filter(Boolean)
  for (const route of ROUTES) {
    if (route.method !== method) continue
    const rp = route.path.split('/').filter(Boolean)
    if (rp.length !== parts.length) continue
    const params: Record<string, string> = {}
    let ok = true
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i])
      else if (rp[i] !== parts[i]) {
        ok = false
        break
      }
    }
    if (ok) return { route, params }
  }
  return null
}

/** OpenAPI 3 description generated from the routes + op schemas. */
export function openApi(version: string): unknown {
  const paths: Record<string, any> = {}
  for (const r of ROUTES) {
    const op = ops.find((o) => o.name === r.op)
    if (!op) continue
    const oaPath = r.path.replace(/:(\w+)/g, '{$1}')
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }))
    const entry: any = { operationId: op.name, summary: op.description, parameters: params, responses: { '200': { description: 'JSON result' } } }
    if (r.method === 'GET') {
      for (const [k, v] of Object.entries(op.input.properties)) {
        if (!params.some((p) => p.name === k)) entry.parameters.push({ name: k === 'includeResolved' ? 'all' : k === 'activeOnly' ? 'active' : k, in: 'query', schema: { type: v.type } })
      }
    } else if (Object.keys(op.input.properties).length) {
      entry.requestBody = { content: { 'application/json': { schema: op.input } } }
    }
    if (op.write) entry['x-requires-access'] = 'full'
    paths[oaPath] = { ...(paths[oaPath] ?? {}), [r.method.toLowerCase()]: entry }
  }
  paths['/v1/events'] = { get: { summary: 'Server-Sent Events: run:progress, run:finished, agent:event', responses: { '200': { description: 'text/event-stream' } } } }
  paths['/mcp'] = { post: { summary: 'Model Context Protocol (Streamable HTTP, JSON-RPC 2.0). Same tools as above.', responses: { '200': { description: 'JSON-RPC response' } } } }
  return {
    openapi: '3.0.0',
    info: { title: 'InboxScout local bridge', version, description: 'Use InboxScout as a tool from another agent on this computer. Bearer token from Setup → Preferences → Agent bridge.' },
    servers: [{ url: `http://127.0.0.1:${boundPort || 47311}` }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths
  }
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: BridgeDeps): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'OPTIONS') return send(res, 204, null)
  if (url.pathname === '/v1/openapi.json' || url.pathname === '/openapi.json') return send(res, 200, openApi(deps.version))
  if (url.pathname === '/' || url.pathname === '/v1') {
    return send(res, 200, { name: 'InboxScout local bridge', version: deps.version, rest: '/v1/openapi.json', mcp: '/mcp', events: '/v1/events' })
  }

  const auth = req.headers.authorization ?? ''
  const expected = token(deps)
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : url.searchParams.get('token') ?? ''
  if (provided !== expected) return send(res, 401, { error: 'Missing or wrong bearer token. Find it in InboxScout → Setup → Preferences → Agent bridge.' })

  const readOnly = loadSettings(deps.db).bridgeAccess === 'read'

  // ---- MCP ----
  if (url.pathname === '/mcp') {
    if (method === 'GET') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }
    if (method === 'DELETE') return send(res, 200, null)
    const body = await readJson(req)
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((r) => handleMcp(r, ops, { readOnly, version: deps.version })))
      const bodies = results.map((r) => r.body).filter((b) => b !== null)
      return bodies.length ? send(res, 200, bodies) : send(res, 202, null)
    }
    const out = await handleMcp(body, ops, { readOnly, version: deps.version })
    return send(res, out.status, out.body)
  }

  // ---- Events (SSE) ----
  if (method === 'GET' && url.pathname === '/v1/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(`event: hello\ndata: ${JSON.stringify({ version: deps.version, access: readOnly ? 'read' : 'full' })}\n\n`)
    sseClients.add(res)
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        clearInterval(keepAlive)
      }
    }, 25000)
    req.on('close', () => {
      clearInterval(keepAlive)
      sseClients.delete(res)
    })
    return
  }

  // ---- REST ----
  const match = matchRoute(method, url.pathname)
  if (!match) return send(res, 404, { error: 'unknown endpoint; see /v1/openapi.json' })
  try {
    const body = method === 'GET' ? {} : await readJson(req)
    const extra = match.route.args ? match.route.args({ params: match.params, query: url.searchParams, body }) : method === 'GET' ? {} : body
    const args = { ...(typeof extra === 'object' && extra ? extra : {}), ...match.params }
    const result = await runOp(ops, match.route.op, args, readOnly)
    return send(res, 200, result ?? null)
  } catch (err: any) {
    return send(res, Number(err?.status) || 500, { error: String(err?.message ?? err) })
  }
}
