import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createHash, randomUUID } from 'node:crypto'
import type { AccountConfig, MessageRecord } from '../../shared/types'

export interface FolderSyncResult {
  folder: string
  uidValidity: number
  lastUid: number
  messages: MessageRecord[]
}

const MAX_BODY_CHARS = 20000
const MAX_INITIAL_MESSAGES = 200

export function threadKeyFor(subject: string, references: string[], messageId: string): string {
  // Root of the References chain groups a thread; otherwise normalized subject.
  const root = references.length > 0 ? references[0] : ''
  if (root) return createHash('sha1').update(root).digest('hex')
  const normalized = subject
    .toLowerCase()
    .replace(/^((re|fw|fwd|aw)\s*:\s*)+/i, '')
    .trim()
  if (normalized) return createHash('sha1').update(normalized).digest('hex')
  return createHash('sha1').update(messageId).digest('hex')
}

export function makeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * Fetch messages newer than the stored UID watermark from one folder,
 * strictly read-only (EXAMINE, no flags changed).
 */
export async function syncFolder(
  account: AccountConfig,
  password: string,
  folder: string,
  prevUidValidity: number,
  prevLastUid: number,
  storeFullBodies: boolean
): Promise<FolderSyncResult> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.email, pass: password },
    logger: false
  })
  const messages: MessageRecord[] = []
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder, { readOnly: true })
    try {
      const mailbox = client.mailbox
      if (!mailbox || typeof mailbox === 'boolean') {
        return { folder, uidValidity: prevUidValidity, lastUid: prevLastUid, messages: [] }
      }
      const uidValidity = Number(mailbox.uidValidity ?? 0)
      // If UIDVALIDITY changed the old watermark is meaningless - restart from recent mail only.
      let sinceUid = uidValidity === prevUidValidity ? prevLastUid : 0
      if (sinceUid === 0) {
        const next = Number(mailbox.uidNext ?? 1)
        sinceUid = Math.max(0, next - MAX_INITIAL_MESSAGES - 1)
      }
      let lastUid = sinceUid
      const range = `${sinceUid + 1}:*`
      for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true }, { uid: true })) {
        if (msg.uid <= sinceUid) continue
        lastUid = Math.max(lastUid, msg.uid)
        if (!msg.source) continue
        const parsed = await simpleParser(msg.source)
        const env = msg.envelope
        const fromAddr = env?.from?.[0]?.address?.toLowerCase() ?? ''
        const fromName = env?.from?.[0]?.name ?? ''
        const to = (env?.to ?? []).map((a) => a.address?.toLowerCase() ?? '').filter(Boolean)
        const subject = env?.subject ?? parsed.subject ?? '(no subject)'
        const messageId = env?.messageId ?? parsed.messageId ?? randomUUID()
        const references = Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
            ? [parsed.references]
            : []
        const bodyFull = (parsed.text ?? '').slice(0, MAX_BODY_CHARS)
        const snippet = makeSnippet(bodyFull)
        const listUnsub = parsed.headers.get('list-unsubscribe')
        messages.push({
          listUnsubscribe: typeof listUnsub === 'string' ? listUnsub : listUnsub ? String(listUnsub) : null,
          hasAttachments: (parsed.attachments ?? []).length > 0,
          id: randomUUID(),
          accountId: account.id,
          folder,
          uid: msg.uid,
          messageId,
          threadKey: threadKeyFor(subject, references, messageId),
          fromAddress: fromAddr,
          fromName,
          toAddresses: to.join(', '),
          subject,
          date: (env?.date ?? parsed.date ?? new Date()).toISOString(),
          snippet,
          bodyText: storeFullBodies ? bodyFull : snippet,
          fromMe: fromAddr === account.email.toLowerCase()
        })
      }
      return { folder, uidValidity, lastUid, messages }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

/** Verify a connection without syncing anything. */
export async function testConnection(account: AccountConfig, password: string): Promise<void> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.email, pass: password },
    logger: false
  })
  await client.connect()
  await client.logout().catch(() => client.close())
}

export const PROVIDER_PRESETS: Record<string, { host: string; port: number; sentFolder: string; help: string }> = {
  gmail: {
    host: 'imap.gmail.com',
    port: 993,
    sentFolder: '[Gmail]/Sent Mail',
    help: 'Requires 2-Step Verification. Create an app password at myaccount.google.com/apppasswords.'
  },
  yahoo: {
    host: 'imap.mail.yahoo.com',
    port: 993,
    sentFolder: 'Sent',
    help: 'Create an app password at Yahoo Account Security -> "Generate and manage app passwords".'
  },
  icloud: {
    host: 'imap.mail.me.com',
    port: 993,
    sentFolder: 'Sent Messages',
    help: 'Create an app-specific password at appleid.apple.com -> Sign-In and Security -> App-Specific Passwords.'
  },
  imap: {
    host: '',
    port: 993,
    sentFolder: 'Sent',
    help: 'Enter your provider\'s IMAP server. Most providers require an app password.'
  }
}
