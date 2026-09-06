import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AccountConfig, MessageRecord, ProviderHints } from '../../shared/types'
import { makeSnippet, threadKeyFor } from './imap'
import { htmlToText } from './graph'

/**
 * Gmail via "Sign in with Google" (OAuth 2.0 for installed apps: browser +
 * loopback redirect + PKCE). Gives us Gmail's own signals — Promotions /
 * Social / Updates categories, Important and Starred, read state, real
 * thread ids — which the IMAP app-password path cannot see. Read-only scope.
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_INITIAL = 150
export const GMAIL_FOLDER = 'gmail'

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface GoogleTokens {
  refreshToken: string
  accessToken: string
  expiresAt: number
}

/**
 * Interactive sign-in. Opens the system browser (via `openUrl`), listens on a
 * random localhost port for the redirect, exchanges the code with PKCE.
 */
export async function signInWithGoogle(
  clientId: string,
  clientSecret: string,
  openUrl: (url: string) => void,
  extraScopes: string[] = []
): Promise<{ email: string; tokens: GoogleTokens }> {
  if (!clientId) {
    throw new Error(
      'Google sign-in needs a Google OAuth client ID. Add one under Setup → Preferences → Advanced (see docs/GOOGLE.md).'
    )
  }
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  let redirectUri = ''

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      const gotCode = url.searchParams.get('code')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      if (err || url.searchParams.get('state') !== state || !gotCode) {
        res.end('<h2 style="font-family:sans-serif">Sign-in did not complete. You can close this window.</h2>')
        server.close()
        reject(new Error(err ?? 'Google sign-in was cancelled.'))
        return
      }
      res.end('<h2 style="font-family:sans-serif">✅ InboxScout is connected. You can close this window.</h2>')
      server.close()
      resolve(gotCode)
    })
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('Google sign-in timed out after 5 minutes.'))
    }, 5 * 60 * 1000)
    timer.unref()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      redirectUri = `http://127.0.0.1:${port}/callback`
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: [GMAIL_SCOPE, ...extraScopes].join(' '),
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      })
      openUrl(`${AUTH_URL}?${params.toString()}`)
    })
  })

  const tokens = await exchange({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  })
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token — remove InboxScout at myaccount.google.com/permissions and try again.')
  }
  const result: GoogleTokens = {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000 - 60000
  }
  const profile = await gmailGet(result.accessToken, `${API}/profile`)
  return { email: String(profile.emailAddress ?? '').toLowerCase(), tokens: result }
}

async function exchange(form: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  })
  const json: any = await res.json()
  if (!res.ok) throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}`)
  return json
}

/** Refresh when needed; returns possibly-updated tokens. */
export async function ensureAccessToken(clientId: string, clientSecret: string, tokens: GoogleTokens): Promise<GoogleTokens> {
  if (tokens.accessToken && Date.now() < tokens.expiresAt) return tokens
  const json = await exchange({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token'
  })
  return { ...tokens, accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60000 }
}

async function gmailGet(token: string, url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const text = await res.text()
    const err: any = new Error(`Gmail API error ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export interface GmailPart {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
  filename?: string
}

export interface GmailMessage {
  id: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart & { headers?: { name: string; value: string }[] }
}

function decode(data?: string): string {
  return data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : ''
}

/** Prefer text/plain; fall back to text/html → text. Also reports attachments. */
export function extractBody(payload?: GmailPart): { text: string; hasAttachments: boolean } {
  let plain = ''
  let html = ''
  let hasAttachments = false
  const walk = (p?: GmailPart): void => {
    if (!p) return
    if (p.filename && p.filename.length > 0) hasAttachments = true
    if (p.mimeType === 'text/plain' && p.body?.data && !plain) plain = decode(p.body.data)
    else if (p.mimeType === 'text/html' && p.body?.data && !html) html = decode(p.body.data)
    for (const child of p.parts ?? []) walk(child)
  }
  walk(payload)
  return { text: plain || (html ? htmlToText(html) : ''), hasAttachments }
}

function header(raw: GmailMessage, name: string): string {
  return raw.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function parseAddress(value: string): { address: string; name: string } {
  const m = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() }
  return { name: '', address: value.trim().toLowerCase() }
}

/** Pure mapping. */
export function mapGmailMessage(raw: GmailMessage, account: AccountConfig, storeFullBodies: boolean): MessageRecord {
  const from = parseAddress(header(raw, 'From'))
  const to = header(raw, 'To')
    .split(',')
    .map((s) => parseAddress(s).address)
    .filter(Boolean)
  const subject = header(raw, 'Subject') || '(no subject)'
  const messageId = header(raw, 'Message-ID') || `<${raw.id}@gmail>`
  const { text, hasAttachments } = extractBody(raw.payload)
  const bodyText = text.slice(0, 20000)
  const snippet = makeSnippet(bodyText || raw.snippet || '')
  const labels = raw.labelIds ?? []
  const category = labels.find((l) => l.startsWith('CATEGORY_'))?.replace('CATEGORY_', '').toLowerCase() ?? null
  const hints: ProviderHints = {
    source: 'gmail',
    category,
    important: labels.includes('IMPORTANT'),
    starred: labels.includes('STARRED'),
    unread: labels.includes('UNREAD'),
    focused: null
  }
  const listUnsub = header(raw, 'List-Unsubscribe')
  return {
    id: randomUUID(),
    accountId: account.id,
    folder: GMAIL_FOLDER,
    uid: parseInt(createHash('sha1').update(raw.id).digest('hex').slice(0, 12), 16),
    messageId,
    threadKey: raw.threadId ? createHash('sha1').update(raw.threadId).digest('hex') : threadKeyFor(subject, [], messageId),
    fromAddress: from.address,
    fromName: from.name,
    toAddresses: to.join(', '),
    subject,
    date: new Date(Number(raw.internalDate ?? Date.now())).toISOString(),
    snippet,
    bodyText: storeFullBodies ? bodyText : snippet,
    fromMe: labels.includes('SENT') || from.address === account.email.toLowerCase(),
    listUnsubscribe: listUnsub || null,
    hasAttachments,
    providerHints: hints
  }
}

// ---- Batched fetch (v1.4 item 5): 50 messages per HTTP round trip instead of one each ----

const BATCH_URL = 'https://gmail.googleapis.com/batch/gmail/v1'
export const GMAIL_BATCH_SIZE = 50
const SKIP_LABELS = new Set(['SPAM', 'TRASH', 'DRAFT'])

/** One part of a multipart/mixed batch response: the inner HTTP status and body, keyed by the request's Content-ID. */
export interface BatchPart {
  contentId: string | null
  status: number
  body: string
}

/** The multipart/mixed request body for a batch of `messages.get?format=full` calls. Content-ID `item-<i>` maps back to `ids[i]`. */
export function buildBatchBody(ids: string[], boundary: string): string {
  const parts = ids.map((id, i) =>
    [`--${boundary}`, 'Content-Type: application/http', `Content-ID: <item-${i}>`, '', `GET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full HTTP/1.1`, '', ''].join('\r\n')
  )
  return `${parts.join('')}--${boundary}--\r\n`
}

/** The boundary named in a `multipart/mixed; boundary=…` header (quotes tolerated), or null. */
export function batchBoundary(contentType: string | null | undefined): string | null {
  const m = String(contentType ?? '').match(/boundary="?([^";]+)"?/i)
  return m ? m[1].trim() : null
}

/**
 * Pure parser for the batch response. Each part is `<part headers>\r\n\r\nHTTP/1.1 <status> …\r\n<headers>\r\n\r\n<body>`.
 * Throws on anything that does not look like that — the caller then falls back to one request per message.
 */
export function parseBatchResponse(text: string, boundary: string): BatchPart[] {
  const out: BatchPart[] = []
  const pieces = text.split(`--${boundary}`)
  if (pieces.length < 2) throw new Error('batch response has no parts')
  for (let i = 1; i < pieces.length; i++) {
    let piece = pieces[i]
    if (piece.startsWith('--')) break // closing delimiter
    piece = piece.replace(/^\r?\n/, '')
    const split = splitHeaders(piece)
    if (!split) throw new Error('batch part without headers')
    const contentId = split.headers.match(/^content-id:\s*<?([^>\r\n]+)>?/im)?.[1]?.trim() ?? null
    const inner = splitHeaders(split.rest)
    if (!inner) throw new Error('batch part without an inner response')
    const status = inner.headers.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i)
    if (!status) throw new Error('batch part without an HTTP status line')
    out.push({ contentId, status: Number(status[1]), body: inner.rest.replace(/\r?\n$/, '') })
  }
  return out
}

function splitHeaders(block: string): { headers: string; rest: string } | null {
  const m = block.match(/\r?\n\r?\n/)
  if (!m || m.index === undefined) return null
  return { headers: block.slice(0, m.index), rest: block.slice(m.index + m[0].length) }
}

/** POST one batch; resolves to the parsed parts. Rejects on transport, HTTP, or parse problems. */
async function gmailBatch(token: string, ids: string[]): Promise<BatchPart[]> {
  const boundary = `batch_inboxscout_${randomBytes(8).toString('hex')}`
  const res = await fetch(BATCH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': `multipart/mixed; boundary=${boundary}` },
    body: buildBatchBody(ids, boundary)
  })
  const text = await res.text()
  if (!res.ok) {
    const err: any = new Error(`Gmail batch error ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const replyBoundary = batchBoundary(res.headers.get('content-type'))
  if (!replyBoundary) throw new Error('Gmail batch reply without a multipart boundary')
  return parseBatchResponse(text, replyBoundary)
}

/** The original path: four workers, one `messages.get` each. Still used when a batch cannot be read. */
async function fetchMessagesOneByOne(token: string, ids: string[], account: AccountConfig, storeFullBodies: boolean): Promise<MessageRecord[]> {
  const out: MessageRecord[] = []
  const queue = [...ids]
  const worker = async (): Promise<void> => {
    while (queue.length) {
      const id = queue.shift()!
      try {
        const raw = (await gmailGet(token, `${API}/messages/${id}?format=full`)) as GmailMessage
        if ((raw.labelIds ?? []).some((l) => SKIP_LABELS.has(l))) continue
        out.push(mapGmailMessage(raw, account, storeFullBodies))
      } catch {
        // one bad message never blocks the run
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return out
}

/**
 * Batched fetch: 50 `format=full` reads per round trip (a 300-message first sync is 6 requests, not 300).
 * Any batch that fails or cannot be parsed hands its ids to the one-by-one path; a part that answers
 * 404 (message gone) is skipped, any other non-200 part is retried one by one.
 */
export async function fetchMessages(token: string, ids: string[], account: AccountConfig, storeFullBodies: boolean): Promise<MessageRecord[]> {
  const out: MessageRecord[] = []
  const leftovers: string[] = []
  for (let i = 0; i < ids.length; i += GMAIL_BATCH_SIZE) {
    const group = ids.slice(i, i + GMAIL_BATCH_SIZE)
    let parts: BatchPart[]
    try {
      parts = await gmailBatch(token, group)
    } catch {
      leftovers.push(...group)
      continue
    }
    const seen = new Set<number>()
    parts.forEach((part, order) => {
      const m = part.contentId?.match(/item-(\d+)/)
      const index = m ? Number(m[1]) : order
      const id = group[index]
      if (!id || seen.has(index)) return
      seen.add(index)
      if (part.status === 404) return
      if (part.status !== 200) {
        leftovers.push(id)
        return
      }
      try {
        const raw = JSON.parse(part.body) as GmailMessage
        if ((raw.labelIds ?? []).some((l) => SKIP_LABELS.has(l))) return
        out.push(mapGmailMessage(raw, account, storeFullBodies))
      } catch {
        leftovers.push(id)
      }
    })
    group.forEach((id, index) => {
      if (!seen.has(index)) leftovers.push(id)
    })
  }
  if (leftovers.length) out.push(...(await fetchMessagesOneByOne(token, leftovers, account, storeFullBodies)))
  return out
}

/**
 * Delta sync via history.list when we have a historyId; otherwise the
 * last 30 days. Returns the new historyId to store.
 */
export async function syncGmail(
  token: string,
  account: AccountConfig,
  historyId: string | null,
  storeFullBodies: boolean
): Promise<{ messages: MessageRecord[]; historyId: string }> {
  const ids = new Set<string>()
  let newHistoryId = historyId ?? ''
  if (historyId) {
    try {
      let pageToken = ''
      do {
        const params = new URLSearchParams({ startHistoryId: historyId, historyTypes: 'messageAdded', maxResults: '500' })
        if (pageToken) params.set('pageToken', pageToken)
        const page = await gmailGet(token, `${API}/history?${params.toString()}`)
        for (const h of page.history ?? []) for (const a of h.messagesAdded ?? []) if (a.message?.id) ids.add(a.message.id)
        newHistoryId = page.historyId ?? newHistoryId
        pageToken = page.nextPageToken ?? ''
      } while (pageToken)
    } catch (err: any) {
      if (err?.status !== 404) throw err
      historyId = null // history expired; fall through to a fresh scan
    }
  }
  if (!historyId) {
    const params = new URLSearchParams({ q: 'newer_than:30d', maxResults: String(MAX_INITIAL) })
    const page = await gmailGet(token, `${API}/messages?${params.toString()}`)
    for (const m of page.messages ?? []) ids.add(m.id)
    const profile = await gmailGet(token, `${API}/profile`)
    newHistoryId = String(profile.historyId ?? '')
  }
  const messages = await fetchMessages(token, [...ids].slice(0, MAX_INITIAL * 2), account, storeFullBodies)
  return { messages, historyId: newHistoryId }
}
