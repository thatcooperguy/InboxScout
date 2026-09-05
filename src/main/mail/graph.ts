import { createHash, randomUUID } from 'node:crypto'
import { PublicClientApplication, type ICachePlugin, type TokenCacheContext } from '@azure/msal-node'
import type { AccountConfig, MessageRecord } from '../../shared/types'
import { makeSnippet, threadKeyFor } from './imap'

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
    hasAttachments: !!raw.hasAttachments
  }
}

const SELECT =
  'id,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,body,conversationId,internetMessageId,hasAttachments'

/**
 * Fetch messages newer than `sinceMs` (epoch ms) from a well-known folder
 * ("inbox" or "sentitems"). Returns the new watermark.
 */
export async function syncGraphFolder(
  accessToken: string,
  account: AccountConfig,
  folder: string,
  sinceMs: number,
  storeFullBodies: boolean
): Promise<{ messages: MessageRecord[]; lastMs: number }> {
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
  const messages: MessageRecord[] = []
  let lastMs = sinceMs
  let fetched = 0
  while (url && fetched < MAX_INITIAL) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Microsoft Graph error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const page = (await res.json()) as { value: GraphMessage[]; '@odata.nextLink'?: string }
    for (const raw of page.value ?? []) {
      const m = mapGraphMessage(raw, account, folder, storeFullBodies)
      messages.push(m)
      lastMs = Math.max(lastMs, new Date(m.date).getTime())
      fetched++
    }
    url = page['@odata.nextLink'] ?? ''
  }
  return { messages, lastMs }
}
