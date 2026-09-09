import type { DB } from './index'
import type {
  AccountConfig,
  Category,
  Classification,
  HelperSend,
  IssueRecord,
  MessageRecord,
  ProjectRecord,
  ReportRecord,
  RunRecord
} from '../../shared/types'

export function upsertAccount(db: DB, a: AccountConfig): void {
  db.prepare(
    `INSERT OR REPLACE INTO accounts (id, label, email, provider, host, port, folders, created_at)
     VALUES (@id, @label, @email, @provider, @host, @port, @folders, @createdAt)`
  ).run({ ...a, folders: JSON.stringify(a.folders) })
}

export function listAccounts(db: DB): AccountConfig[] {
  return (db.prepare('SELECT * FROM accounts ORDER BY created_at').all() as any[]).map((r) => ({
    id: r.id,
    label: r.label,
    email: r.email,
    provider: r.provider,
    host: r.host,
    port: r.port,
    folders: JSON.parse(r.folders),
    createdAt: r.created_at
  }))
}

export function deleteAccount(db: DB, id: string): void {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  db.prepare('DELETE FROM sync_state WHERE account_id = ?').run(id)
}

export function getSyncState(db: DB, accountId: string, folder: string): { uidValidity: number; lastUid: number } {
  const r = db
    .prepare('SELECT uid_validity, last_uid FROM sync_state WHERE account_id = ? AND folder = ?')
    .get(accountId, folder) as any
  return r ? { uidValidity: r.uid_validity, lastUid: r.last_uid } : { uidValidity: 0, lastUid: 0 }
}

export function setSyncState(db: DB, accountId: string, folder: string, uidValidity: number, lastUid: number): void {
  db.prepare(
    `INSERT INTO sync_state (account_id, folder, uid_validity, last_uid) VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, folder) DO UPDATE SET uid_validity = excluded.uid_validity, last_uid = excluded.last_uid`
  ).run(accountId, folder, uidValidity, lastUid)
}

export function insertMessage(db: DB, m: MessageRecord): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO messages
       (id, account_id, folder, uid, message_id, thread_key, from_address, from_name, to_addresses,
        subject, date, snippet, body_text, from_me, list_unsubscribe, has_attachments, provider_hints)
       VALUES (@id, @accountId, @folder, @uid, @messageId, @threadKey, @fromAddress, @fromName, @toAddresses,
        @subject, @date, @snippet, @bodyText, @fromMe, @listUnsubscribe, @hasAttachments, @providerHints)`
    )
    .run({
      ...m,
      fromMe: m.fromMe ? 1 : 0,
      hasAttachments: m.hasAttachments ? 1 : 0,
      providerHints: m.providerHints ? JSON.stringify(m.providerHints) : null
    })
  return res.changes > 0
}

function rowToMessage(r: any): MessageRecord {
  return {
    id: r.id,
    accountId: r.account_id,
    folder: r.folder,
    uid: r.uid,
    messageId: r.message_id,
    threadKey: r.thread_key,
    fromAddress: r.from_address,
    fromName: r.from_name,
    toAddresses: r.to_addresses,
    subject: r.subject,
    date: r.date,
    snippet: r.snippet,
    bodyText: r.body_text,
    fromMe: !!r.from_me,
    listUnsubscribe: r.list_unsubscribe ?? null,
    hasAttachments: !!r.has_attachments,
    providerHints: r.provider_hints ? JSON.parse(r.provider_hints) : null
  }
}

export function getMessages(db: DB, ids: string[]): MessageRecord[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return (db.prepare(`SELECT * FROM messages WHERE id IN (${placeholders})`).all(...ids) as any[]).map(rowToMessage)
}

export function recentMessagesWithClassification(db: DB, limit: number): any[] {
  return db
    .prepare(
      `SELECT m.id, m.subject, m.from_address, m.from_name, m.date, m.snippet, m.account_id, m.list_unsubscribe,
              c.category, c.importance, c.screening, c.action_summary, c.sensitivity
       FROM messages m LEFT JOIN classifications c ON c.message_id = m.id
       ORDER BY m.date DESC LIMIT ?`
    )
    .all(limit)
}

// ---- Conversation (v1.4, Part B): safe full-text queries and per-sender lookups ----

/** Words that carry no search meaning; dropped before a query reaches FTS5. */
const FTS_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'did', 'do', 'does', 'for', 'from', 'has', 'have', 'he', 'her', 'his', 'i',
  'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them', 'they', 'this', 'to',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'you', 'your', 's', 't', 'll', 're', 've', 'm', 'd'
])

/**
 * Turn free text into a query FTS5 will never choke on: keep `[\p{L}\p{N}]+` tokens, drop stop-words, quote each
 * token, join with a space (implicit AND) or with OR. Returns '' when nothing searchable is left. Idempotent on
 * its own output ("jane's write back?" → `"jane" "write" "back"`). Punctuation, quotes, apostrophes, and emoji
 * cannot reach MATCH, so `Jane's` and `write back?` no longer raise syntax errors.
 */
export function toFtsQuery(text: string, mode: 'and' | 'or' = 'and'): string {
  const tokens = (String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !FTS_STOP_WORDS.has(t))
  const unique = [...new Set(tokens)].slice(0, 12)
  if (unique.length === 0) return ''
  return unique.map((t) => `"${t}"`).join(mode === 'or' ? ' OR ' : ' ')
}

/** Full-text search, safe for any text: all words first, then any word when that finds nothing. */
export function searchMessages(db: DB, query: string, limit: number): any[] {
  const run = (q: string): any[] =>
    db
      .prepare(
        `SELECT m.id, m.subject, m.from_address, m.from_name, m.date, m.snippet
         FROM messages_fts f JOIN messages m ON m.rowid = f.rowid
         WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(q, limit)
  const all = toFtsQuery(query, 'and')
  if (!all) return []
  const hits = run(all)
  if (hits.length > 0) return hits
  const any = toFtsQuery(query, 'or')
  return any === all ? [] : run(any)
}

/**
 * Mail from one sender, newest first. `who` is an address (exact, case-insensitive) or a word matched
 * against the sender's name and address ("bank" → alerts@bank.com, "Chase Bank"). Never the person's own mail.
 */
export function searchMessagesFrom(db: DB, who: string, limit = 3): MessageRecord[] {
  const w = String(who ?? '').trim().toLowerCase()
  if (!w) return []
  const rows = w.includes('@')
    ? db.prepare('SELECT * FROM messages WHERE from_me = 0 AND lower(from_address) = ? ORDER BY date DESC LIMIT ?').all(w, limit)
    : db
        .prepare(
          `SELECT * FROM messages WHERE from_me = 0 AND (lower(from_name) LIKE ? OR lower(from_address) LIKE ?)
           ORDER BY date DESC LIMIT ?`
        )
        .all(`%${w}%`, `%${w}%`, limit)
  return (rows as any[]).map(rowToMessage)
}

/** The newest message this address sent to the person (null when they never wrote). */
export function latestInboundFrom(db: DB, address: string): MessageRecord | null {
  const r = db
    .prepare('SELECT * FROM messages WHERE from_me = 0 AND lower(from_address) = ? ORDER BY date DESC LIMIT 1')
    .get(String(address ?? '').trim().toLowerCase()) as any
  return r ? rowToMessage(r) : null
}

/** The newest message the person sent to this address (null when they never wrote to them). */
export function latestSentTo(db: DB, address: string): MessageRecord | null {
  const a = String(address ?? '').trim().toLowerCase()
  if (!a) return null
  const r = db.prepare('SELECT * FROM messages WHERE from_me = 1 AND lower(to_addresses) LIKE ? ORDER BY date DESC LIMIT 1').get(`%${a}%`) as any
  return r ? rowToMessage(r) : null
}

/**
 * Senders whose name starts with `prefix` (any word of it), one row per address, newest first — the
 * fallback when the People list does not know a name yet. Also matches names the classifier recorded.
 */
export function findSendersByName(db: DB, prefix: string, limit = 5): { name: string; address: string; lastSeen: string }[] {
  const p = String(prefix ?? '').trim().toLowerCase()
  if (!p) return []
  const rows = db
    .prepare(
      `SELECT m.from_name AS name, lower(m.from_address) AS address, MAX(m.date) AS lastSeen
       FROM messages m LEFT JOIN classifications c ON c.message_id = m.id
       WHERE m.from_me = 0 AND (lower(m.from_name) LIKE ? OR lower(m.from_name) LIKE ? OR lower(c.people) LIKE ?)
       GROUP BY lower(m.from_address) ORDER BY lastSeen DESC LIMIT ?`
    )
    .all(`${p}%`, `% ${p}%`, `%"${p}%`, limit) as any[]
  return rows.map((r) => ({ name: r.name || r.address, address: r.address, lastSeen: r.lastSeen }))
}

export function upsertClassification(db: DB, c: Classification): void {
  db.prepare(
    `INSERT OR REPLACE INTO classifications
     (message_id, category, importance, screening, is_actionable, action_summary, deadline,
      topics, project_hint, people, sensitivity, run_id, model, corrected)
     VALUES (@messageId, @category, @importance, @screening, @isActionable, @actionSummary, @deadline,
      @topics, @projectHint, @people, @sensitivity, @runId, @model, @corrected)`
  ).run({
    ...c,
    isActionable: c.isActionable ? 1 : 0,
    topics: JSON.stringify(c.topics),
    people: JSON.stringify(c.people),
    sensitivity: JSON.stringify(c.sensitivity),
    corrected: c.corrected ? 1 : 0
  })
}

export function getClassifications(db: DB, messageIds: string[]): Classification[] {
  if (messageIds.length === 0) return []
  const placeholders = messageIds.map(() => '?').join(',')
  return (
    db.prepare(`SELECT * FROM classifications WHERE message_id IN (${placeholders})`).all(...messageIds) as any[]
  ).map((r) => ({
    messageId: r.message_id,
    category: r.category,
    importance: r.importance,
    screening: r.screening,
    isActionable: !!r.is_actionable,
    actionSummary: r.action_summary,
    deadline: r.deadline,
    topics: JSON.parse(r.topics),
    projectHint: r.project_hint,
    people: JSON.parse(r.people),
    sensitivity: JSON.parse(r.sensitivity),
    runId: r.run_id,
    model: r.model,
    corrected: !!r.corrected
  }))
}

export function setCorrection(db: DB, messageId: string, category: string, note: string | null): void {
  db.prepare(
    `INSERT OR REPLACE INTO corrections (message_id, category, note, created_at) VALUES (?, ?, ?, ?)`
  ).run(messageId, category, note, new Date().toISOString())
  db.prepare('UPDATE classifications SET category = ?, corrected = 1 WHERE message_id = ?').run(category, messageId)
}

export function listCorrections(db: DB, limit: number): { subject: string; from: string; category: string }[] {
  return (
    db
      .prepare(
        `SELECT m.subject as subject, m.from_address as fromAddr, c.category as category
         FROM corrections c JOIN messages m ON m.id = c.message_id
         ORDER BY c.created_at DESC LIMIT ?`
      )
      .all(limit) as any[]
  ).map((r) => ({ subject: r.subject, from: r.fromAddr, category: r.category }))
}

export function upsertProject(db: DB, p: ProjectRecord): void {
  db.prepare(
    `INSERT OR REPLACE INTO projects (id, name, status_summary, trend, state, last_activity, last_change)
     VALUES (@id, @name, @statusSummary, @trend, @state, @lastActivity, @lastChange)`
  ).run(p)
}

export function listProjects(db: DB, activeOnly = false): ProjectRecord[] {
  const sql = activeOnly
    ? `SELECT * FROM projects WHERE state = 'active' ORDER BY last_activity DESC`
    : 'SELECT * FROM projects ORDER BY last_activity DESC'
  return (db.prepare(sql).all() as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    statusSummary: r.status_summary,
    trend: r.trend,
    state: r.state,
    lastActivity: r.last_activity,
    lastChange: r.last_change
  }))
}

export function upsertIssue(db: DB, i: IssueRecord): void {
  db.prepare(
    `INSERT OR REPLACE INTO issues (id, title, severity, state, owner_action, deadline, created_at, updated_at)
     VALUES (@id, @title, @severity, @state, @ownerAction, @deadline, @createdAt, @updatedAt)`
  ).run(i)
}

export function listIssues(db: DB, openOnly = false): IssueRecord[] {
  const sql = openOnly
    ? `SELECT * FROM issues WHERE state != 'resolved' ORDER BY updated_at DESC`
    : 'SELECT * FROM issues ORDER BY updated_at DESC'
  return (db.prepare(sql).all() as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    state: r.state,
    ownerAction: r.owner_action,
    deadline: r.deadline,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

export function resolveIssue(db: DB, id: string): void {
  db.prepare(`UPDATE issues SET state = 'resolved', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
}

/** Titles of issues resolved since `sinceIso`, newest first. */
export function resolvedSince(db: DB, sinceIso: string): string[] {
  return (
    db.prepare(`SELECT title FROM issues WHERE state = 'resolved' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 20`).all(sinceIso) as any[]
  ).map((r) => r.title)
}

export function insertRun(db: DB, r: RunRecord): void {
  db.prepare(
    `INSERT INTO runs (id, started_at, finished_at, status, trigger_kind, messages_scanned, error)
     VALUES (@id, @startedAt, @finishedAt, @status, @trigger, @messagesScanned, @error)`
  ).run(r)
}

export function finishRun(db: DB, id: string, status: string, messagesScanned: number, error: string | null): void {
  db.prepare('UPDATE runs SET finished_at = ?, status = ?, messages_scanned = ?, error = ? WHERE id = ?').run(
    new Date().toISOString(),
    status,
    messagesScanned,
    error,
    id
  )
}

export function listRuns(db: DB, limit: number): RunRecord[] {
  return (db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit) as any[]).map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    trigger: r.trigger_kind,
    messagesScanned: r.messages_scanned,
    error: r.error
  }))
}

export function insertReport(db: DB, r: ReportRecord, briefJson: string): void {
  db.prepare(
    `INSERT INTO reports (id, run_id, period_type, created_at, markdown, html, file_path, brief_json)
     VALUES (@id, @runId, @periodType, @createdAt, @markdown, @html, @filePath, @briefJson)`
  ).run({ ...r, briefJson })
}

/** The most recent structured brief, for the Today screen. */
export function latestBrief(db: DB): { brief: any; createdAt: string; reportId: string } | null {
  const r = db.prepare('SELECT id, created_at, brief_json FROM reports ORDER BY created_at DESC LIMIT 1').get() as any
  if (!r || !r.brief_json) return null
  try {
    return { brief: JSON.parse(r.brief_json), createdAt: r.created_at, reportId: r.id }
  } catch {
    return null
  }
}

export function insertSkillMatch(db: DB, m: { messageId: string; skillId: string; extracted: Record<string, string>; urgent: boolean }, runId: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO skill_matches (message_id, skill_id, extracted, urgent, run_id) VALUES (?, ?, ?, ?, ?)`
  ).run(m.messageId, m.skillId, JSON.stringify(m.extracted), m.urgent ? 1 : 0, runId)
}

export function listReports(db: DB, limit: number): Omit<ReportRecord, 'markdown' | 'html'>[] {
  return (
    db.prepare('SELECT id, run_id, period_type, created_at, file_path FROM reports ORDER BY created_at DESC LIMIT ?').all(limit) as any[]
  ).map((r) => ({ id: r.id, runId: r.run_id, periodType: r.period_type, createdAt: r.created_at, filePath: r.file_path }))
}

export function getReport(db: DB, id: string): ReportRecord | null {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as any
  if (!r) return null
  return {
    id: r.id,
    runId: r.run_id,
    periodType: r.period_type,
    createdAt: r.created_at,
    markdown: r.markdown,
    html: r.html,
    filePath: r.file_path
  }
}

export function getMeta(db: DB, key: string): string | null {
  const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any
  return r ? r.value : null
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
}

// ---- Quiet intelligence (v0.9): people, recent mail windows, skill matches ----

/** Messages from the last `days` days across every account, newest first, capped. */
export function messagesSince(db: DB, days: number, limit = 4000): MessageRecord[] {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  return (db.prepare('SELECT * FROM messages WHERE date >= ? ORDER BY date DESC LIMIT ?').all(cutoff, limit) as any[]).map(rowToMessage)
}

export interface StoredPerson {
  key: string
  name: string
  addresses: string[]
  domain: string
  received: number
  sent: number
  repliedByMe: number
  repliedToMe: number
  firstSeen: string
  lastSeen: string
  cadenceDays: number | null
  accounts: string[]
  role: string
  tier: string
  score: number
  goingQuiet: boolean
  quietDays: number
  isNew: boolean
}

export function replacePeople(db: DB, people: StoredPerson[]): void {
  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT OR REPLACE INTO people (key, name, addresses, domain, received, sent, replied_by_me, replied_to_me, first_seen, last_seen,
       cadence_days, accounts, role, tier, score, going_quiet, quiet_days, is_new, updated_at)
     VALUES (@key, @name, @addresses, @domain, @received, @sent, @repliedByMe, @repliedToMe, @firstSeen, @lastSeen,
       @cadenceDays, @accounts, @role, @tier, @score, @goingQuiet, @quietDays, @isNew, @updatedAt)`
  )
  const tx = db.transaction((rows: StoredPerson[]) => {
    db.prepare('DELETE FROM people').run()
    for (const p of rows) {
      insert.run({
        ...p,
        addresses: JSON.stringify(p.addresses),
        accounts: JSON.stringify(p.accounts),
        cadenceDays: p.cadenceDays ?? null,
        goingQuiet: p.goingQuiet ? 1 : 0,
        isNew: p.isNew ? 1 : 0,
        updatedAt: now
      })
    }
  })
  tx(people)
}

export function listPeople(db: DB, limit = 300): StoredPerson[] {
  return (db.prepare('SELECT * FROM people ORDER BY score DESC LIMIT ?').all(limit) as any[]).map((r) => ({
    key: r.key,
    name: r.name,
    addresses: JSON.parse(r.addresses),
    domain: r.domain,
    received: r.received,
    sent: r.sent,
    repliedByMe: r.replied_by_me,
    repliedToMe: r.replied_to_me,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    cadenceDays: r.cadence_days,
    accounts: JSON.parse(r.accounts),
    role: r.role,
    tier: r.tier,
    score: r.score,
    goingQuiet: !!r.going_quiet,
    quietDays: r.quiet_days,
    isNew: !!r.is_new
  }))
}

/** Skill matches recorded in the last `days` days, joined with the message they came from. */
export function recentSkillMatches(db: DB, days: number): { messageId: string; skillId: string; extracted: Record<string, string>; urgent: boolean; subject: string; fromName: string; fromAddress: string; accountId: string; date: string }[] {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  return (
    db
      .prepare(
        `SELECT s.message_id, s.skill_id, s.extracted, s.urgent, m.subject, m.from_name, m.from_address, m.account_id, m.date
         FROM skill_matches s JOIN messages m ON m.id = s.message_id WHERE m.date >= ? ORDER BY m.date DESC LIMIT 2000`
      )
      .all(cutoff) as any[]
  ).map((r) => ({
    messageId: r.message_id,
    skillId: r.skill_id,
    extracted: safeJson(r.extracted),
    urgent: !!r.urgent,
    subject: r.subject,
    fromName: r.from_name,
    fromAddress: r.from_address,
    accountId: r.account_id,
    date: r.date
  }))
}

/** Classifications with a deadline from the last `days` days, with their message. */
export function recentDeadlines(db: DB, days: number): { messageId: string; deadline: string; subject: string; fromName: string; fromAddress: string; accountId: string; date: string }[] {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  return (
    db
      .prepare(
        `SELECT c.message_id, c.deadline, m.subject, m.from_name, m.from_address, m.account_id, m.date
         FROM classifications c JOIN messages m ON m.id = c.message_id
         WHERE c.deadline IS NOT NULL AND c.deadline != '' AND m.date >= ? ORDER BY m.date DESC LIMIT 1000`
      )
      .all(cutoff) as any[]
  ).map((r) => ({ messageId: r.message_id, deadline: r.deadline, subject: r.subject, fromName: r.from_name, fromAddress: r.from_address, accountId: r.account_id, date: r.date }))
}

function safeJson(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** Undo for "Done ✓". */
export function reopenIssue(db: DB, id: string): void {
  db.prepare(`UPDATE issues SET state = 'active', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
}

// ---- Self-healing (v1.2) ----

/** Forget where we were in an account's mailboxes so the next scan starts from scratch (Gmail history too). Messages stay. */
export function resetSyncState(db: DB, accountId: string): void {
  db.prepare('DELETE FROM sync_state WHERE account_id = ?').run(accountId)
  db.prepare('DELETE FROM meta WHERE key = ?').run(`gmail-history:${accountId}`)
}

/** Add one to a numeric meta counter and return the new value (missing or garbage counts as 0). */
export function bumpCounter(db: DB, key: string): number {
  const current = Number(getMeta(db, key) ?? 0)
  const next = (Number.isFinite(current) && current > 0 ? Math.floor(current) : 0) + 1
  setMeta(db, key, String(next))
  return next
}

// ---- v1.4 quality sweep (items 6, 7): lighter per-run reads ----

const LITE_COLUMNS =
  'id, account_id, folder, uid, message_id, thread_key, from_address, from_name, to_addresses, subject, date, snippet, from_me, list_unsubscribe, has_attachments, provider_hints'

/**
 * `messagesSince` without the 20 KB bodies: `bodyChars` > 0 keeps only that many leading characters
 * (the people engine reads at most 2000), 0 leaves `bodyText` empty (the reply tracker reads none).
 * Same window, order, and cap as `messagesSince`.
 */
export function messagesSinceLite(db: DB, days: number, limit = 4000, bodyChars = 0): MessageRecord[] {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const body = bodyChars > 0 ? `substr(body_text, 1, ${Math.floor(bodyChars)})` : `''`
  return (
    db.prepare(`SELECT ${LITE_COLUMNS}, ${body} AS body_text FROM messages WHERE date >= ? ORDER BY date DESC LIMIT ?`).all(cutoff, limit) as any[]
  ).map(rowToMessage)
}

const CATEGORY_CHUNK = 500

/** Stored category per message id, in one `IN (…)` query per 500 ids (instead of one query per message). */
export function categoryMap(db: DB, ids: string[]): Map<string, Category> {
  const out = new Map<string, Category>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += CATEGORY_CHUNK) {
    const slice = unique.slice(i, i + CATEGORY_CHUNK)
    const placeholders = slice.map(() => '?').join(',')
    const rows = db.prepare(`SELECT message_id, category FROM classifications WHERE message_id IN (${placeholders})`).all(...slice) as any[]
    for (const r of rows) out.set(r.message_id, r.category)
  }
  return out
}

// ---- Trusted helpers (v1.4): the sent log, verbatim ----

function rowToHelperSend(r: any): HelperSend {
  return {
    id: r.id,
    helperId: r.helper_id,
    kind: r.kind,
    channel: r.channel,
    sentAt: r.sent_at,
    subject: r.subject,
    text: r.text,
    triggerKey: r.trigger_key ?? null,
    status: r.status,
    error: r.error ?? null
  }
}

export function insertHelperSend(db: DB, s: HelperSend): void {
  db.prepare(
    `INSERT OR REPLACE INTO helper_sends (id, helper_id, kind, channel, sent_at, subject, text, trigger_key, status, error)
     VALUES (@id, @helperId, @kind, @channel, @sentAt, @subject, @text, @triggerKey, @status, @error)`
  ).run({ ...s, triggerKey: s.triggerKey ?? null, error: s.error ?? null })
}

/** Newest first. `helperId` narrows to one helper; `limit` defaults to 100. */
export function listHelperSends(db: DB, opts: { helperId?: string; limit?: number } = {}): HelperSend[] {
  const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 100)))
  const rows = opts.helperId
    ? db.prepare('SELECT * FROM helper_sends WHERE helper_id = ? ORDER BY sent_at DESC LIMIT ?').all(opts.helperId, limit)
    : db.prepare('SELECT * FROM helper_sends ORDER BY sent_at DESC LIMIT ?').all(limit)
  return (rows as any[]).map(rowToHelperSend)
}

export function updateHelperSend(db: DB, id: string, patch: Partial<Pick<HelperSend, 'status' | 'error' | 'sentAt' | 'channel' | 'text' | 'subject'>>): void {
  const current = db.prepare('SELECT * FROM helper_sends WHERE id = ?').get(id) as any
  if (!current) return
  const next = { ...rowToHelperSend(current), ...patch }
  db.prepare('UPDATE helper_sends SET status = ?, error = ?, sent_at = ?, channel = ?, text = ?, subject = ? WHERE id = ?').run(
    next.status,
    next.error ?? null,
    next.sentAt,
    next.channel,
    next.text,
    next.subject,
    id
  )
}

/** The most recent log row for one helper (the health check looks at whether it failed). */
export function lastHelperSend(db: DB, helperId: string): HelperSend | null {
  const r = db.prepare('SELECT * FROM helper_sends WHERE helper_id = ? ORDER BY sent_at DESC LIMIT 1').get(helperId) as any
  return r ? rowToHelperSend(r) : null
}
