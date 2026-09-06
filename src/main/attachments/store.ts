// Rows and files for attachments. Files live under userData/attachments/<messageId>/<safe filename>;
// rows carry the extracted text so the file itself can be deleted later without losing what it said.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type { DB } from '../db/index'
import { toFtsQuery } from '../db/repo'
import { EMPTY_FACTS, type AttachmentFacts, type StoredAttachment } from './types'

export const ATTACHMENTS_DIR = 'attachments'

export function attachmentsRoot(userDataDir: string): string {
  return join(userDataDir, ATTACHMENTS_DIR)
}

// ---- Filenames ----

const MAX_NAME_CHARS = 120

/**
 * A filename that is safe on every OS and cannot escape its folder: no path separators, no control or reserved
 * characters, no leading dots, Windows device names renamed, length capped while keeping the extension.
 */
export function safeFilename(name: string): string {
  const raw = String(name ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
  let base = raw || 'attachment'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(base)) base = `_${base}`
  if (base.length > MAX_NAME_CHARS) {
    const ext = extname(base).slice(0, 16)
    base = base.slice(0, MAX_NAME_CHARS - ext.length) + ext
  }
  return base
}

/** `<messageId>` is our UUID; anything else is squeezed into a safe folder name too. */
function safeFolder(messageId: string): string {
  const s = String(messageId ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  return s || 'message'
}

/** Write bytes under the attachments folder; a name already taken gets `-2`, `-3`… before its extension. */
export function writeAttachmentFile(userDataDir: string, messageId: string, filename: string, data: Uint8Array): string {
  const dir = join(attachmentsRoot(userDataDir), safeFolder(messageId))
  mkdirSync(dir, { recursive: true })
  const safe = safeFilename(filename)
  const ext = extname(safe)
  const stem = ext ? safe.slice(0, -ext.length) : safe
  let candidate = join(dir, safe)
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${stem}-${n}${ext}`)
  writeFileSync(candidate, data)
  return candidate
}

/** True when `p` is inside userData/attachments — the only place we ever delete from. */
export function isManagedPath(userDataDir: string, p: string | null): p is string {
  if (!p) return false
  const root = resolve(attachmentsRoot(userDataDir)) + sep
  return resolve(p).startsWith(root)
}

// ---- Rows ----

export function newAttachmentId(): string {
  return randomUUID()
}

function parseFacts(raw: unknown): AttachmentFacts {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!v || typeof v !== 'object') return { ...EMPTY_FACTS }
    const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [])
    return {
      amounts: list(v.amounts),
      dates: list(v.dates),
      people: list(v.people),
      documentType: typeof v.documentType === 'string' ? v.documentType : null
    }
  } catch {
    return { ...EMPTY_FACTS }
  }
}

export function rowToAttachment(r: any): StoredAttachment {
  return {
    id: r.id,
    messageId: r.message_id,
    accountId: r.account_id,
    filename: r.filename,
    contentType: r.content_type,
    size: r.size,
    kind: r.kind,
    path: r.path ?? null,
    text: r.text ?? null,
    summary: r.summary ?? null,
    facts: parseFacts(r.facts),
    status: r.status,
    via: r.via ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
    extractedAt: r.extracted_at ?? null
  }
}

export function insertAttachment(db: DB, a: StoredAttachment): void {
  db.prepare(
    `INSERT INTO attachments (id, message_id, account_id, filename, content_type, size, kind, path, text, summary, facts,
       status, via, error, created_at, extracted_at)
     VALUES (@id, @messageId, @accountId, @filename, @contentType, @size, @kind, @path, @text, @summary, @facts,
       @status, @via, @error, @createdAt, @extractedAt)`
  ).run({ ...a, facts: JSON.stringify(a.facts ?? EMPTY_FACTS) })
}

export function getAttachment(db: DB, id: string): StoredAttachment | null {
  const r = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any
  return r ? rowToAttachment(r) : null
}

/** Every row for one message, in the order they were saved. */
export function listForMessage(db: DB, messageId: string): StoredAttachment[] {
  return (db.prepare('SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at, rowid').all(messageId) as any[]).map(rowToAttachment)
}

/** Pending rows, newest first (the latest mail is what the next brief is about). */
export function listPending(db: DB, limit: number): StoredAttachment[] {
  return (db.prepare(`SELECT * FROM attachments WHERE status = 'pending' ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit) as any[]).map(
    rowToAttachment
  )
}

const CHUNK = 500

/** Rows with status 'done' for these messages, in one query per 500 ids. */
export function listDoneForMessages(db: DB, messageIds: string[]): StoredAttachment[] {
  const out: StoredAttachment[] = []
  const unique = [...new Set(messageIds)]
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK)
    const placeholders = slice.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT * FROM attachments WHERE status = 'done' AND message_id IN (${placeholders}) ORDER BY created_at, rowid`)
      .all(...slice) as any[]
    for (const r of rows) out.push(rowToAttachment(r))
  }
  return out
}

export interface ExtractionPatch {
  text: string | null
  summary: string | null
  facts: AttachmentFacts
  via: StoredAttachment['via']
  status: StoredAttachment['status']
  error: string | null
  extractedAt: string
}

/** What extraction learned about one file. */
export function updateExtraction(db: DB, id: string, patch: ExtractionPatch): void {
  db.prepare(
    `UPDATE attachments SET text = @text, summary = @summary, facts = @facts, via = @via, status = @status, error = @error,
       extracted_at = @extractedAt WHERE id = @id`
  ).run({ ...patch, id, facts: JSON.stringify(patch.facts ?? EMPTY_FACTS) })
}

export function setPath(db: DB, id: string, path: string | null): void {
  db.prepare('UPDATE attachments SET path = ? WHERE id = ?').run(path, id)
}

// ---- Search ----

/** Full-text search over filenames and extracted text: all words first, then any word, like repo.searchMessages. */
export function searchAttachmentRows(db: DB, query: string, limit: number): { attachment: StoredAttachment; snippet: string }[] {
  const run = (q: string): { attachment: StoredAttachment; snippet: string }[] =>
    (
      db
        .prepare(
          `SELECT a.*, snippet(attachments_fts, -1, '', '', '…', 24) AS snip
           FROM attachments_fts f JOIN attachments a ON a.rowid = f.rowid
           WHERE attachments_fts MATCH ? ORDER BY rank LIMIT ?`
        )
        .all(q, limit) as any[]
    ).map((r) => ({ attachment: rowToAttachment(r), snippet: String(r.snip ?? '').replace(/\s+/g, ' ').trim() }))
  const all = toFtsQuery(query, 'and')
  if (!all) return []
  const hits = run(all)
  if (hits.length > 0) return hits
  const any = toFtsQuery(query, 'or')
  return any === all ? [] : run(any)
}

// ---- Files on disk ----

function fileSize(p: string): number | null {
  try {
    const st = statSync(p)
    return st.isFile() ? st.size : null
  } catch {
    return null
  }
}

/** Files we still keep: how many, how big, and when the oldest was saved. */
export function storageStatsFor(db: DB, userDataDir: string): { files: number; bytes: number; oldestAt: string | null } {
  const rows = db.prepare('SELECT path, size, created_at FROM attachments WHERE path IS NOT NULL ORDER BY created_at').all() as any[]
  let files = 0
  let bytes = 0
  let oldestAt: string | null = null
  for (const r of rows) {
    if (!isManagedPath(userDataDir, r.path)) continue
    const size = fileSize(r.path)
    if (size === null) continue
    files++
    bytes += size
    if (!oldestAt) oldestAt = r.created_at
  }
  return { files, bytes, oldestAt }
}

/** Delete files saved more than `days` ago; rows, text, and summaries stay, `path` goes null. Empty folders go too. */
export function cleanupFilesOlderThan(db: DB, userDataDir: string, days: number, now = new Date()): { removed: number; bytes: number } {
  const d = Number.isFinite(days) ? Math.max(0, days) : 0
  const cutoff = new Date(now.getTime() - d * 86400000).toISOString()
  const rows = db.prepare('SELECT id, path FROM attachments WHERE path IS NOT NULL AND created_at < ?').all(cutoff) as any[]
  let removed = 0
  let bytes = 0
  const clear = db.prepare('UPDATE attachments SET path = NULL WHERE id = ?')
  const dirs = new Set<string>()
  for (const r of rows) {
    if (!isManagedPath(userDataDir, r.path)) {
      clear.run(r.id)
      continue
    }
    const size = fileSize(r.path)
    try {
      if (size !== null) {
        unlinkSync(r.path)
        removed++
        bytes += size
      }
      dirs.add(dirname(r.path))
      clear.run(r.id)
    } catch {
      // Locked or already gone: leave the row for next time.
    }
  }
  for (const dir of dirs) {
    try {
      if (basename(dir) && readdirSync(dir).length === 0) rmdirSync(dir)
    } catch {
      // Not empty or gone — fine.
    }
  }
  return { removed, bytes }
}
