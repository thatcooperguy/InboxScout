import type { AccountConfig, Category, InboxSummary, MessageRecord } from '../../shared/types'
import type { ReplyTrackerResult } from './replies'

/**
 * Multi-inbox organisation: what each connected inbox is for and what came
 * through it, plus cross-account de-duplication. Pure and electron-free.
 *
 * Per account:
 * - role: from the category mix of its most recent 200 inbound (non-fromMe) messages that have a
 *   classification. Work ≥ 65% → 'work'; personal + promotions ≥ 65% → 'personal'; otherwise
 *   'mixed'. Fewer than 10 classified messages → 'mixed' (not enough to say).
 * - newCount: messages of that account whose id is in newMessageIds.
 * - waitingOnYou: reply-tracker "waiting on you" threads that came through this inbox. A thread is
 *   matched to the account whose messages include one from that sender address (case-insensitive)
 *   with the same subject; when no subject matches, any message from that address will do.
 * - needsYou: waitingOnYou plus this run's new inbound work messages that are not already part of
 *   a waiting-on-you thread. Importance is unknown here, so the new-work part is capped at
 *   NEW_WORK_CAP (25) per inbox so one busy morning cannot turn into a scary number.
 */
export function summarizeInboxes(
  accounts: AccountConfig[],
  messages: MessageRecord[],
  categoryOf: (messageId: string) => Category | undefined,
  replies: ReplyTrackerResult,
  newMessageIds: Set<string>
): InboxSummary[] {
  const list = Array.isArray(messages) ? messages.filter(Boolean) : []
  const byAccount = new Map<string, MessageRecord[]>()
  for (const m of list) {
    const l = byAccount.get(m.accountId) ?? []
    l.push(m)
    byAccount.set(m.accountId, l)
  }

  // Which inbox each waiting-on-you thread belongs to.
  const waitingPerAccount = new Map<string, number>()
  const waitingAddressesPerAccount = new Map<string, Set<string>>()
  const senderIndex = buildSenderIndex(list)
  for (const w of replies?.waitingOnYou ?? []) {
    const address = norm(w.address)
    if (!address) continue
    const entry = senderIndex.get(address)
    if (!entry) continue
    const subject = normSubject(w.subject)
    const targets = entry.bySubject.get(subject) ?? entry.anySubject
    for (const accountId of targets) {
      waitingPerAccount.set(accountId, (waitingPerAccount.get(accountId) ?? 0) + 1)
      const set = waitingAddressesPerAccount.get(accountId) ?? new Set<string>()
      set.add(address)
      waitingAddressesPerAccount.set(accountId, set)
    }
  }

  const ids = newMessageIds instanceof Set ? newMessageIds : new Set<string>()
  return (accounts ?? []).map((a) => {
    const mine = byAccount.get(a.id) ?? []
    const role = inferRole(mine, categoryOf)
    let newCount = 0
    let newWork = 0
    const waitingAddresses = waitingAddressesPerAccount.get(a.id) ?? new Set<string>()
    for (const m of mine) {
      if (!ids.has(m.id)) continue
      newCount++
      if (m.fromMe) continue
      if (waitingAddresses.has(norm(m.fromAddress))) continue
      if (safeCategory(categoryOf, m.id) === 'work') newWork++
    }
    const waitingOnYou = waitingPerAccount.get(a.id) ?? 0
    return {
      accountId: a.id,
      label: a.label,
      email: a.email,
      role,
      newCount,
      needsYou: waitingOnYou + Math.min(newWork, NEW_WORK_CAP),
      waitingOnYou
    }
  })
}

const ROLE_SAMPLE = 200
const ROLE_MIN_CLASSIFIED = 10
const ROLE_SHARE = 0.65
const NEW_WORK_CAP = 25

function inferRole(mine: MessageRecord[], categoryOf: (id: string) => Category | undefined): InboxSummary['role'] {
  const inbound = mine.filter((m) => !m.fromMe).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  let work = 0
  let nonWork = 0
  for (const m of inbound.slice(0, ROLE_SAMPLE)) {
    const c = safeCategory(categoryOf, m.id)
    if (c === 'work') work++
    else if (c === 'personal' || c === 'promotions_noise') nonWork++
  }
  const total = work + nonWork
  if (total < ROLE_MIN_CLASSIFIED) return 'mixed'
  if (work / total >= ROLE_SHARE) return 'work'
  if (nonWork / total >= ROLE_SHARE) return 'personal'
  return 'mixed'
}

function safeCategory(categoryOf: (id: string) => Category | undefined, id: string): Category | undefined {
  try {
    return categoryOf(id)
  } catch {
    return undefined
  }
}

interface SenderEntry {
  anySubject: Set<string>
  bySubject: Map<string, Set<string>>
}

function buildSenderIndex(messages: MessageRecord[]): Map<string, SenderEntry> {
  const index = new Map<string, SenderEntry>()
  for (const m of messages) {
    const address = norm(m.fromAddress)
    if (!address) continue
    const entry = index.get(address) ?? { anySubject: new Set<string>(), bySubject: new Map<string, Set<string>>() }
    entry.anySubject.add(m.accountId)
    const subject = normSubject(m.subject)
    const set = entry.bySubject.get(subject) ?? new Set<string>()
    set.add(m.accountId)
    entry.bySubject.set(subject, set)
    index.set(address, entry)
  }
  return index
}

function norm(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase()
}

function normSubject(s: string | null | undefined): string {
  return norm(s).replace(/^(?:(?:re|fw|fwd|aw|sv)\s*:\s*)+/i, '').replace(/\s+/g, ' ')
}

/**
 * The same email delivered to two of the owner's inboxes counts once (keeps the earliest copy).
 * Two messages are "the same" when their RFC Message-ID header matches after normalisation
 * (trimmed, lower-cased, angle brackets removed) AND they sit in different accounts. Messages
 * with an empty Message-ID are always kept, and copies within one account (INBOX + Sent, say)
 * are left alone. Order is otherwise preserved.
 */
export function dedupeAcrossAccounts<T extends { messageId: string; accountId: string; date: string }>(messages: T[]): T[] {
  if (!Array.isArray(messages) || messages.length < 2) return messages
  // Earliest copy per Message-ID, remembering which account it lives in.
  const keeper = new Map<string, { accountId: string; time: number; index: number }>()
  const keys: (string | null)[] = new Array(messages.length)
  messages.forEach((m, i) => {
    const key = normMessageId(m?.messageId)
    keys[i] = key
    if (!key) return
    const time = Date.parse(m.date)
    const t = isNaN(time) ? Number.POSITIVE_INFINITY : time
    const current = keeper.get(key)
    if (!current || t < current.time) keeper.set(key, { accountId: m.accountId, time: t, index: i })
  })
  return messages.filter((m, i) => {
    const key = keys[i]
    if (!key) return true
    const k = keeper.get(key)
    return !k || k.accountId === m.accountId
  })
}

function normMessageId(id: string | null | undefined): string {
  return String(id ?? '').trim().toLowerCase().replace(/^<+|>+$/g, '').trim()
}
