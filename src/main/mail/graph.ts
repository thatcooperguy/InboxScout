import { createHash, randomUUID } from 'node:crypto'
import { PublicClientApplication, type ICachePlugin, type TokenCacheContext } from '@azure/msal-node'
import type { AccountConfig, MessageRecord, ProviderHints } from '../../shared/types'
import type { IncomingAttachment } from '../attachments/types'
import { SyncBudget, shouldKeep } from './attachmentsPolicy'
import { makeSnippet, threadKeyFor } from './imap'
import type { FetchedMessage } from './types'

/**
 * Outlook.com / Hotmail / Live via Microsoft Graph.
 * Microsoft removed password and app-password IMAP in 2024, so this is the
 * only door. Sign-in uses the device-code flow: the app shows a short code,
 * the person types it at microsoft.com/devicelogin, done. Read-only scope.
 */

export const GRAPH_SCOPES = ['Mail.Read', 'User.Read']
const AUTHORITY = 'https://login.microsoftonline.com/common'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const MAX_INITIAL = 200

export interface TokenStore {
  load: () => string | null
  save: (serialized: string) => void
}

function cachePlugin(store: TokenStore): ICachePlugin {
  return {
    beforeCacheAccess: async (ctx: TokenCacheContext) => {
      const data = store.load()
      if (data) ctx.tokenCache.deserialize(data)
    },
    afterCacheAccess: async (ctx: TokenCacheContext) => {
      if (ctx.cacheHasChanged) store.save(ctx.tokenCache.serialize())
    }
  }
}

function client(clientId: string, store: TokenStore): PublicClientApplication {
  if (!clientId) {
    throw new Error(
      'Outlook sign-in needs a Microsoft app ID. Add one under Setup → Preferences → Advanced (see docs/OUTLOOK.md).'
    )
  }
  return new PublicClientApplication({ auth: { clientId, authority: AUTHORITY }, cache: { cachePlugin: cachePlugin(store) } })
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  message: string
}

/** Interactive sign-in. Resolves with the signed-in address and MSAL account id. */
export async function signInWithDeviceCode(
  clientId: string,
  store: TokenStore,
  onCode: (info: DeviceCodeInfo) => void
): Promise<{ email: string; homeAccountId: string }> {
  const pca = client(clientId, store)
  const result = await pca.acquireTokenByDeviceCode({
    scopes: GRAPH_SCOPES,
    deviceCodeCallback: (info) =>
      onCode({ userCode: info.userCode, verificationUri: info.verificationUri, message: info.message })
  })
  if (!result?.account) throw new Error('Microsoft sign-in did not complete.')
  const email = (result.account.username || '').toLowerCase()
  return { email, homeAccountId: result.account.homeAccountId }
}

/** Silent token from the cached refresh token; throws when the person must sign in again. */
export async function getAccessToken(clientId: string, store: TokenStore, homeAccountId: string): Promise<string> {
  const pca = client(clientId, store)
  const account = await pca.getTokenCache().getAccountByHomeId(homeAccountId)
  if (!account) throw new Error('Microsoft sign-in expired — reconnect this account.')
  const result = await pca.acquireTokenSilent({ account, scopes: GRAPH_SCOPES })
  return result.accessToken
}

/** Minimal HTML → text good enough for classification. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Stable 48-bit integer from a Graph message id, for the (account, folder, uid) dedupe index. */
export function graphUid(id: string): number {
  return parseInt(createHash('sha1').update(id).digest('hex').slice(0, 12), 16)
}

export interface GraphMessage {
  id: string
  subject?: string | null
  from?: { emailAddress?: { address?: string; name?: string } } | null
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[]
  receivedDateTime?: string
  sentDateTime?: string
  bodyPreview?: string | null
  body?: { contentType?: string; content?: string } | null
  conversationId?: string | null
  internetMessageId?: string | null
  hasAttachments?: boolean
  inferenceClassification?: 'focused' | 'other' | string | null
  importance?: 'low' | 'normal' | 'high' | string | null
  isRead?: boolean
  flag?: { flagStatus?: string } | null
}

/** Pure mapping from a Graph message to our record. */
export function mapGraphMessage(
  raw: GraphMessage,
  account: AccountConfig,
  folder: string,
  storeFullBodies: boolean
): MessageRecord {
  const fromAddr = raw.from?.emailAddress?.address?.toLowerCase() ?? ''
  const fromName = raw.from?.emailAddress?.name ?? ''
  const to = (raw.toRecipients ?? []).map((r) => r.emailAddress?.address?.toLowerCase() ?? '').filter(Boolean)
  const subject = raw.subject || '(no subject)'
  const messageId = raw.internetMessageId || `<${raw.id}@graph>`
  const bodyRaw = raw.body?.content ?? raw.bodyPreview ?? ''
  const bodyText = (raw.body?.contentType === 'html' ? htmlToText(bodyRaw) : bodyRaw).slice(0, 20000)
  const snippet = makeSnippet(bodyText || raw.bodyPreview || '')
  const date = raw.receivedDateTime ?? raw.sentDateTime ?? new Date().toISOString()
  const hints: ProviderHints = {
    source: 'outlook',
    category: null,
    important: raw.importance === 'high',
    starred: raw.flag?.flagStatus === 'flagged',
    unread: raw.isRead === false,
    focused: raw.inferenceClassification === 'focused' ? true : raw.inferenceClassification === 'other' ? false : null
  }
  return {
    id: randomUUID(),
    accountId: account.id,
    folder,
    uid: graphUid(raw.id),
    messageId,
    threadKey: raw.conversationId
      ? createHash('sha1').update(raw.conversationId).digest('hex')
      : threadKeyFor(subject, [], messageId),
    fromAddress: fromAddr,
    fromName,
    toAddresses: to.join(', '),
    subject,
    date: new Date(date).toISOString(),
    snippet,
    bodyText: storeFullBodies ? bodyText : snippet,
    fromMe: fromAddr === account.email.toLowerCase(),
    listUnsubscribe: null,
    hasAttachments: !!raw.hasAttachments,
    providerHints: hints
  }
}

const SELECT =
  'id,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,body,conversationId,internetMessageId,hasAttachments,' +
  'inferenceClassification,importance,isRead,flag'

/** One row of `GET /me/messages/{id}/attachments` (metadata only; bytes come from `/$value`). */
export interface GraphAttachmentInfo {
  '@odata.type'?: string
  id: string
  name?: string | null
  contentType?: string | null
  size?: number | null
  isInline?: boolean | null
}

const FILE_ATTACHMENT = '#microsoft.graph.fileattachment'

/**
 * Download the file attachments of one message that pass the policy and the budgets (v1.5).
 * Reference and item attachments (links, embedded mails) are skipped. Never throws: a failed
 * listing returns []; a failed download skips that one file.
 */
export async function fetchGraphAttachments(accessToken: string, messageId: string, sync: SyncBudget = new SyncBudget()): Promise<IncomingAttachment[]> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const base = `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments`
  const out: IncomingAttachment[] = []
  let list: GraphAttachmentInfo[]
  try {
    const res = await fetch(`${base}?$select=id,name,contentType,size,isInline`, { headers })
    if (!res.ok) return out
    list = ((await res.json()) as { value?: GraphAttachmentInfo[] }).value ?? []
  } catch {
    return out
  }
  const budget = sync.forMessage()
  for (const info of list) {
    if (budget.exhausted) break
    if (String(info['@odata.type'] ?? '').toLowerCase() !== FILE_ATTACHMENT) continue
    const filename = info.name || 'attachment'
    const contentType = (info.contentType || 'application/octet-stream').toLowerCase()
    const size = Number(info.size ?? 0)
    const inline = info.isInline === true
    if (!shouldKeep({ filename, contentType, size, inline })) continue
    if (!budget.take(size)) continue
    try {
      const res = await fetch(`${base}/${encodeURIComponent(info.id)}/$value`, { headers })
      if (!res.ok) continue
      const data = new Uint8Array(await res.arrayBuffer())
      if (data.byteLength === 0) continue
      budget.adjust(size, data.byteLength)
      out.push({ filename, contentType, size: data.byteLength, data, inline: inline || undefined })
    } catch {
      // one bad attachment never blocks the message
    }
  }
  return out
}

/**
 * Fetch messages newer than `sinceMs` (epoch ms) from a well-known folder
 * ("inbox" or "sentitems"). Returns the new watermark.
 */
export async function syncGraphFolder(
  accessToken: string,
  account: AccountConfig,
  folder: string,
  sinceMs: number,
  storeFullBodies: boolean,
  budget: SyncBudget = new SyncBudget()
): Promise<{ messages: FetchedMessage[]; lastMs: number }> {
  const headers = { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' }
  const dateField = folder === 'sentitems' ? 'sentDateTime' : 'receivedDateTime'
  let url: string
  if (sinceMs > 0) {
    const since = new Date(sinceMs + 1).toISOString()
    url =
      `${GRAPH}/me/mailFolders/${folder}/messages?$select=${SELECT}` +
      `&$filter=${dateField} gt ${since}&$orderby=${dateField} asc&$top=50`
  } else {
    url = `${GRAPH}/me/mailFolders/${folder}/messages?$select=${SELECT}&$orderby=${dateField} desc&$top=${Math.min(50, MAX_INITIAL)}`
  }
  const messages: FetchedMessage[] = []
  const withAttachments: { record: FetchedMessage; graphId: string }[] = []
  let lastMs = sinceMs
  let fetched = 0
  while (url && fetched < MAX_INITIAL) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Microsoft Graph error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const page = (await res.json()) as { value: GraphMessage[]; '@odata.nextLink'?: string }
    for (const raw of page.value ?? []) {
      const m: FetchedMessage = mapGraphMessage(raw, account, folder, storeFullBodies)
      messages.push(m)
      if (raw.hasAttachments) withAttachments.push({ record: m, graphId: raw.id })
      lastMs = Math.max(lastMs, new Date(m.date).getTime())
      fetched++
    }
    url = page['@odata.nextLink'] ?? ''
  }
  // Attachment bytes (v1.5): four messages at a time; never fails the sync.
  const queue = [...withAttachments]
  const worker = async (): Promise<void> => {
    while (queue.length) {
      const item = queue.shift()!
      if (budget.exhausted) continue
      try {
        const attachments = await fetchGraphAttachments(accessToken, item.graphId, budget)
        if (attachments.length) item.record.attachments = attachments
      } catch {
        // attachments are a bonus; the message itself always goes through
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return { messages, lastMs }
}
