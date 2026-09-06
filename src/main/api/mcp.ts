import { runOp, type Op } from './ops'

/**
 * A tiny Model Context Protocol server (Streamable HTTP transport, JSON
 * responses) so Hermes, Claude Code, Cursor, and any MCP client can attach
 * InboxScout as a native tool server. No SDK needed: MCP over HTTP is
 * JSON-RPC 2.0 with a handful of methods.
 */

export const MCP_PROTOCOL_VERSION = '2025-03-26'

export interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: any
}

export interface McpResult {
  /** HTTP status to send. 202 for notifications (no body). */
  status: number
  body: unknown | null
}

const rpcError = (id: JsonRpcRequest['id'], code: number, message: string): McpResult => ({
  status: 200,
  body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
})

export async function handleMcp(req: JsonRpcRequest, ops: Op[], opts: { readOnly: boolean; version: string }): Promise<McpResult> {
  if (!req || typeof req !== 'object' || typeof req.method !== 'string') return rpcError(null, -32600, 'Invalid request')
  const { id, method, params } = req
  const ok = (result: unknown): McpResult => ({ status: 200, body: { jsonrpc: '2.0', id: id ?? null, result } })

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'inboxscout', version: opts.version },
        instructions:
          'InboxScout is the email assistant on this computer. Use get_brief for what needs attention, search_mail/read_message for specifics, run_scan to refresh, and the assistant_* tools to have the Assistant browser do web chores (it opens a visible window; when status is waiting_user the person must act on it, then call assistant_continue). Briefs are personal data — summarize, do not forward.'
      })
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return { status: 202, body: null }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({
        tools: ops
          .filter((o) => !(opts.readOnly && o.write))
          .map((o) => ({ name: o.name, description: o.description, inputSchema: o.input }))
      })
    case 'tools/call': {
      const name = String(params?.name ?? '')
      const args = (params?.arguments ?? {}) as Record<string, any>
      try {
        const result = await runOp(ops, name, args, opts.readOnly)
        return ok({
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result ?? null, null, 2) }],
          structuredContent: result && typeof result === 'object' && !Array.isArray(result) ? result : undefined,
          isError: false
        })
      } catch (err: any) {
        return ok({ content: [{ type: 'text', text: String(err?.message ?? err) }], isError: true })
      }
    }
    case 'resources/list':
    case 'prompts/list':
      return ok(method === 'resources/list' ? { resources: [] } : { prompts: [] })
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}
