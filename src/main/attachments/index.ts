// Reads attachments and photos (v1.5) — the public API from docs/design/ATTACHMENTS-CONTRACT.md.
// Fetchers call saveIncoming; the pipeline calls extractPending before classification and reads findings;
// Ask, the bridge, and the UI use the lookups. Nothing here throws: bad files become 'failed' rows.
import { readFileSync } from 'node:fs'
import type { DB } from '../db/index'
import { extractOne, kindFor, plainError } from './extract'
import { extractFacts, summarize } from './facts'
import {
  cleanupFilesOlderThan,
  getAttachment,
  insertAttachment,
  listDoneForMessages,
  listForMessage,
  listPending,
  newAttachmentId,
  searchAttachmentRows,
  storageStatsFor,
  updateExtraction,
  writeAttachmentFile
} from './store'
import { EMPTY_FACTS, EXCERPT_CHARS, FILE_MAX_BYTES, MAX_TEXT_CHARS, type AttachmentFinding, type IncomingAttachment, type StoredAttachment, type VisionFn } from './types'

export type { AttachmentFinding, AttachmentKind, IncomingAttachment, StoredAttachment, VisionFn } from './types'

/** Inline images below this are logos and signatures, not content (the fetchers drop them too). */
const INLINE_MIN_BYTES = 20 * 1024
const DEFAULT_LIMIT = 40
const DEFAULT_BUDGET_MS = 90_000
/** Anything under this per item is not worth starting a reader for. */
const MIN_ITEM_MS = 1_500

/** Save bytes to disk (under `userDataDir/attachments`) and insert a `pending` row. Never throws; oversize → 'skipped'. */
export function saveIncoming(db: DB, userDataDir: string, input: { messageId: string; accountId: string } & IncomingAttachment): StoredAttachment {
  const filename = String(input.filename ?? '').trim() || 'attachment'
  const contentType = String(input.contentType ?? '').toLowerCase().split(';')[0].trim() || 'application/octet-stream'
  const data = input.data ?? new Uint8Array(0)
  const size = Math.max(Number(input.size) || 0, data.byteLength)
  const row: StoredAttachment = {
    id: newAttachmentId(),
    messageId: input.messageId,
    accountId: input.accountId,
    filename,
    contentType,
    size,
    kind: kindFor(filename, contentType),
    path: null,
    text: null,
    summary: null,
    facts: { ...EMPTY_FACTS },
    status: 'pending',
    via: null,
    error: null,
    createdAt: new Date().toISOString(),
    extractedAt: null
  }
  try {
    if (size > FILE_MAX_BYTES) {
      row.status = 'skipped'
      row.error = 'Too big to read (over 10 MB)'
    } else if (data.byteLength === 0) {
      row.status = 'skipped'
      row.error = 'The file is empty'
    } else {
      try {
        row.path = writeAttachmentFile(userDataDir, input.messageId, filename, data)
      } catch (err) {
        row.status = 'failed'
        row.error = `Could not save the file: ${plainError(err)}`
      }
      if (row.status === 'pending') {
        if (row.kind === 'other') {
          row.status = 'skipped'
          row.error = 'This kind of file is not read'
        } else if (row.kind === 'image' && input.inline && size < INLINE_MIN_BYTES) {
          row.status = 'skipped'
          row.error = 'Small inline image (a logo or signature)'
        }
      }
    }
    insertAttachment(db, row)
  } catch (err) {
    row.status = 'failed'
    row.error = row.error ?? `Could not record the file: ${plainError(err)}`
    try {
      insertAttachment(db, row)
    } catch {
      // The database is unavailable; the caller still gets a row-shaped answer.
    }
  }
  return row
}

/** Extract text/summary/facts for pending rows, newest first. Documents locally; images via `vision` when given, else OCR. Bounded by `limit` and `timeBudgetMs`. Never throws. */
export async function extractPending(
  db: DB,
  opts: {
    limit?: number
    timeBudgetMs?: number
    vision?: VisionFn | null
    ocr?: boolean
    log?: (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void
  } = {}
): Promise<{ done: number; failed: number; findings: AttachmentFinding[] }> {
  const out = { done: 0, failed: 0, findings: [] as AttachmentFinding[] }
  const log = opts.log
  try {
    const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT))
    const budget = Math.max(0, opts.timeBudgetMs ?? DEFAULT_BUDGET_MS)
    const deadline = Date.now() + budget
    const rows = listPending(db, limit)
    if (rows.length === 0) return out
    for (const row of rows) {
      const remaining = deadline - Date.now()
      if (remaining < MIN_ITEM_MS) {
        log?.('info', 'attachments', `Out of time; ${rows.length - out.done - out.failed} attachments wait for the next run`)
        break
      }
      let status: 'done' | 'failed'
      try {
        status = await extractRow(db, row, { vision: opts.vision, ocr: opts.ocr, log, timeoutMs: remaining })
      } catch (err) {
        // A reader or the database misbehaved for this one file; record it and move on.
        status = 'failed'
        log?.('warn', 'attachments', `Could not read ${row.filename}: ${plainError(err)}`)
        try {
          updateExtraction(db, row.id, { text: null, summary: null, facts: { ...EMPTY_FACTS }, via: null, status: 'failed', error: plainError(err), extractedAt: new Date().toISOString() })
        } catch {
          // Leave it pending for the next run.
        }
      }
      if (status === 'done') out.done++
      else out.failed++
      const fresh = getAttachment(db, row.id)
      if (fresh && fresh.status === 'done') out.findings.push(findingOf(fresh))
    }
  } catch (err) {
    log?.('error', 'attachments', `Reading attachments stopped: ${plainError(err)}`)
  }
  return out
}

async function extractRow(
  db: DB,
  row: StoredAttachment,
  opts: { vision?: VisionFn | null; ocr?: boolean; log?: (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void; timeoutMs: number }
): Promise<'done' | 'failed'> {
  const finish = (patch: Parameters<typeof updateExtraction>[2]): 'done' | 'failed' => {
    updateExtraction(db, row.id, patch)
    return patch.status === 'done' ? 'done' : 'failed'
  }
  const extractedAt = new Date().toISOString()
  let bytes: Uint8Array
  try {
    if (!row.path) throw new Error('The file was not kept')
    bytes = new Uint8Array(readFileSync(row.path))
  } catch (err) {
    return finish({ text: null, summary: null, facts: { ...EMPTY_FACTS }, via: null, status: 'failed', error: plainError(err), extractedAt })
  }
  const result = await extractOne({ filename: row.filename, contentType: row.contentType, bytes }, { vision: opts.vision, ocr: opts.ocr, log: opts.log, timeoutMs: opts.timeoutMs })
  if (result.status === 'failed') {
    opts.log?.('warn', 'attachments', `Could not read ${row.filename}: ${result.error}`)
    return finish({ text: null, summary: null, facts: { ...EMPTY_FACTS }, via: result.via, status: 'failed', error: result.error, extractedAt })
  }
  const now = new Date(extractedAt)
  const source = result.text || result.summary || ''
  const facts = extractFacts(row.kind, row.filename, source, now)
  const summary = result.summary ?? summarize(row.kind, row.filename, result.text, facts, result.shape, now)
  return finish({ text: result.text.slice(0, MAX_TEXT_CHARS), summary, facts, via: result.via, status: 'done', error: null, extractedAt })
}

export function attachmentsFor(db: DB, messageId: string): StoredAttachment[] {
  return listForMessage(db, messageId)
}

/** Findings for the given messages (done rows only), keyed by message id; messages without any are absent. */
export function findingsFor(db: DB, messageIds: string[]): Map<string, AttachmentFinding[]> {
  const out = new Map<string, AttachmentFinding[]>()
  for (const row of listDoneForMessages(db, messageIds)) {
    const list = out.get(row.messageId) ?? []
    list.push(findingOf(row))
    out.set(row.messageId, list)
  }
  return out
}

export function attachmentText(db: DB, id: string, maxChars = MAX_TEXT_CHARS): string | null {
  const row = getAttachment(db, id)
  if (!row || row.text === null) return null
  const max = Math.max(0, Math.floor(maxChars))
  return row.text.length > max ? row.text.slice(0, max) : row.text
}

/** FTS over attachment text (and file names), safe for any input; uses repo.toFtsQuery. */
export function searchAttachments(db: DB, q: string, limit = 20): { attachment: StoredAttachment; snippet: string }[] {
  return searchAttachmentRows(db, q, Math.max(1, Math.min(200, Math.floor(limit))))
}

export function storageStats(db: DB, userDataDir: string): { files: number; bytes: number; oldestAt: string | null } {
  return storageStatsFor(db, userDataDir)
}

/** Delete files (not rows/text) older than `days`; returns bytes freed. */
export function cleanupFiles(db: DB, userDataDir: string, days: number): { removed: number; bytes: number } {
  return cleanupFilesOlderThan(db, userDataDir, days)
}

function findingOf(row: StoredAttachment): AttachmentFinding {
  return {
    attachmentId: row.id,
    messageId: row.messageId,
    filename: row.filename,
    kind: row.kind,
    summary: row.summary ?? row.filename,
    facts: row.facts,
    excerpt: excerptOf(row.text)
  }
}

function excerptOf(text: string | null): string {
  const t = String(text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (t.length <= EXCERPT_CHARS) return t
  const cut = t.slice(0, EXCERPT_CHARS)
  const at = cut.lastIndexOf(' ')
  return `${(at > EXCERPT_CHARS * 0.7 ? cut.slice(0, at) : cut).trim()}…`
}
