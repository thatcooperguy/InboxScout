import { generateObject, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { DB } from '../db/index'
import type { AttachmentFinding, IncomingAttachment, StoredAttachment, VisionFn } from '../attachments/types'
import type { MessageRecord, ProviderId, AttachmentInfo } from '../../shared/types'
import type { ClassifiableMessage } from '../ai/schemas'

export type { ClassifiableMessage, VisionFn }

/**
 * Reads attachments and photos (v1.5): the pipeline's side of the attachment store.
 *
 * Agent 1's `src/main/attachments/index.ts` owns saving, extracting, and searching. This module turns what it
 * finds into the two things the rest of the run understands — a plain-text `attachments` block per message for
 * the classifier and the built-in engine, and a "from the attached invoice.pdf" source line for the brief — and
 * builds the optional vision function when the connected AI helper can see images. Everything here takes the
 * store's functions as a parameter so tests can hand in fakes and the pipeline can hand in the real module.
 */

export type AttachmentLog = (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void

/** The slice of the attachment store the pipeline uses (see docs/design/ATTACHMENTS-CONTRACT.md). */
export interface AttachmentStore {
  saveIncoming: (db: DB, userDataDir: string, input: { messageId: string; accountId: string } & IncomingAttachment) => StoredAttachment
  extractPending: (
    db: DB,
    opts: { limit?: number; timeBudgetMs?: number; vision?: VisionFn | null; ocr?: boolean; log?: AttachmentLog }
  ) => Promise<{ done: number; failed: number; findings: AttachmentFinding[] }>
  findingsFor: (db: DB, messageIds: string[]) => Map<string, AttachmentFinding[]>
  attachmentsFor: (db: DB, messageId: string) => StoredAttachment[]
}

// ---- Which AI helpers can look at a photo (mirrors the Assistant's `vision` decision in ipc.ts) ----

export const VISION_PROVIDERS: ReadonlySet<string> = new Set(['gemini', 'openai', 'anthropic', 'xai', 'openrouter', 'custom'])

export function supportsVision(provider: ProviderId | string): boolean {
  return VISION_PROVIDERS.has(provider)
}

const visionSchema = z.object({
  summary: z.string().describe('One or two plain sentences: what this image is and the facts that matter (amount, due date, who, what for)'),
  text: z.string().describe('All readable text in the image, in reading order; empty when there is none')
})

/** The default model call: one image part plus the hint, answered as {summary, text}. Exported for tests. */
export async function callVisionModel(model: LanguageModel, image: Uint8Array, contentType: string, hint: string): Promise<{ summary: string; text: string }> {
  const { object } = await generateObject({
    model,
    schema: visionSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'This image was attached to an email in a person\'s own inbox. Read it for them. ' +
              'Give a one- or two-sentence plain-words summary with the facts that matter (amounts, due dates, names, what it is for), ' +
              'and transcribe all readable text. Never invent a number or a date that is not visible.' +
              (hint ? ` Context: ${hint.slice(0, 300)}` : '')
          },
          { type: 'image', image, mediaType: contentType || 'image/png' }
        ]
      }
    ]
  })
  return { summary: object.summary.trim(), text: object.text.trim() }
}

/**
 * A `VisionFn` for `extractPending`, protected the way the rest of the run protects the AI helper: the first
 * failure is logged once and every later call in this run is refused at once (so OCR handles the rest instead
 * of paying for a timeout per photo). Rejections leave the store free to fall back to OCR for that item.
 */
export function buildVision(model: LanguageModel, log: AttachmentLog = () => {}, call: typeof callVisionModel = callVisionModel): VisionFn {
  let down: string | null = null
  return async (image, contentType, hint) => {
    if (down) throw new Error(`vision unavailable this run (${down})`)
    try {
      return await call(model, image, contentType, hint)
    } catch (err) {
      down = String((err as Error)?.message ?? err).split('\n')[0].slice(0, 120)
      log('warn', 'attachments', 'the AI helper could not read an image; using the built-in reader for the rest of this run', { reason: down })
      throw err
    }
  }
}

// ---- Saving what the fetchers brought back ----

/** Save every attachment of a freshly inserted message. `saveIncoming` never throws; oversize files become 'skipped'. */
export function ingestAttachments(
  db: DB,
  userDataDir: string,
  message: Pick<MessageRecord, 'id' | 'accountId'>,
  attachments: IncomingAttachment[] | undefined,
  store: Pick<AttachmentStore, 'saveIncoming'>
): number {
  let saved = 0
  for (const a of attachments ?? []) {
    if (!a || !a.data || a.data.length === 0) continue
    const row = store.saveIncoming(db, userDataDir, { messageId: message.id, accountId: message.accountId, ...a })
    if (row.status !== 'skipped') saved++
  }
  return saved
}

// ---- Turning findings into words the engines understand ----

/** Per-message cap for the classifier block: two or three files' worth of facts and excerpts. */
export const ATTACHMENT_CONTEXT_MAX = 3000
const EXCERPT_MAX = 1200

const oneLine = (s: string): string => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * The `attachments` block for one message: file name, what it is, the facts, then the excerpt. Plain text the
 * classifier prompt and the built-in heuristics both scan.
 */
export function attachmentContext(findings: AttachmentFinding[]): string {
  const parts: string[] = []
  for (const f of findings) {
    const type = f.facts?.documentType || (f.kind === 'image' ? 'photo' : f.kind)
    const lines = [`${f.filename} (${type}): ${oneLine(f.summary) || 'no summary'}`]
    if (f.facts?.amounts?.length) lines.push(`Amounts: ${f.facts.amounts.slice(0, 6).join(', ')}`)
    if (f.facts?.dates?.length) lines.push(`Dates: ${f.facts.dates.slice(0, 6).join(', ')}`)
    if (f.facts?.people?.length) lines.push(`People: ${f.facts.people.slice(0, 4).join(', ')}`)
    const excerpt = oneLine(f.excerpt).slice(0, EXCERPT_MAX)
    if (excerpt) lines.push(`Text: ${excerpt}`)
    parts.push(lines.join('\n'))
  }
  const joined = parts.join('\n\n')
  return joined.length > ATTACHMENT_CONTEXT_MAX ? `${joined.slice(0, ATTACHMENT_CONTEXT_MAX - 1).trimEnd()}…` : joined
}

/** "from the attached invoice.pdf" — the source line the brief uses; three names at most. */
export function attachmentSource(filenames: string[]): string {
  const names = [...new Set(filenames.filter(Boolean))]
  if (names.length === 0) return ''
  const shown = names.slice(0, 3).join(', ')
  return `from the attached ${shown}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`
}

export interface AttachmentNote {
  messageId: string
  subject: string
  filenames: string[]
}

export interface ReadResult {
  /** messageId → the `attachments` block for the classifier. */
  context: Map<string, string>
  /** messageId → file names that were read (for the brief's sources). */
  files: Map<string, string[]>
  done: number
  failed: number
}

/**
 * Extract what is pending (newest first, bounded) and collect the findings for this run's new messages.
 * Never throws: an extraction problem is logged and the run goes on without attachment facts.
 */
export async function readNewAttachments(
  db: DB,
  store: Pick<AttachmentStore, 'extractPending' | 'findingsFor'>,
  opts: { messageIds: string[]; vision?: VisionFn | null; log?: AttachmentLog; limit?: number; timeBudgetMs?: number }
): Promise<ReadResult> {
  const out: ReadResult = { context: new Map(), files: new Map(), done: 0, failed: 0 }
  const log = opts.log ?? (() => {})
  try {
    const r = await store.extractPending(db, { limit: opts.limit ?? 40, timeBudgetMs: opts.timeBudgetMs, vision: opts.vision ?? null, log })
    out.done = r.done
    out.failed = r.failed
  } catch (err) {
    log('warn', 'attachments', 'reading attachments failed; the brief is built without them', { error: String((err as Error)?.message ?? err) })
  }
  if (opts.messageIds.length === 0) return out
  try {
    for (const [messageId, findings] of store.findingsFor(db, opts.messageIds)) {
      if (!findings.length) continue
      const text = attachmentContext(findings)
      if (text) out.context.set(messageId, text)
      out.files.set(messageId, findings.map((f) => f.filename))
    }
  } catch (err) {
    log('warn', 'attachments', 'could not collect attachment findings', { error: String((err as Error)?.message ?? err) })
  }
  return out
}

/** The brief's per-message notes, for messages that had readable attachments. */
export function attachmentNotes(messages: Pick<MessageRecord, 'id' | 'subject'>[], files: Map<string, string[]>): AttachmentNote[] {
  const notes: AttachmentNote[] = []
  for (const m of messages) {
    const names = files.get(m.id)
    if (names?.length) notes.push({ messageId: m.id, subject: m.subject, filenames: names })
  }
  return notes
}

// ---- What leaves the main process ----

/** The attachment without its file path or full text (the renderer, the phone, and the bridge see this). */
export function publicAttachment(a: StoredAttachment): AttachmentInfo {
  return {
    id: a.id,
    messageId: a.messageId,
    accountId: a.accountId,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    kind: a.kind,
    summary: a.summary,
    facts: a.facts ?? { amounts: [], dates: [], people: [], documentType: null },
    status: a.status,
    via: a.via,
    error: a.error,
    createdAt: a.createdAt,
    extractedAt: a.extractedAt,
    hasFile: !!a.path
  }
}

/**
 * One attachment by id. The store's API is keyed by message, so this reads the row's `message_id` (the one
 * column the contract fixes) and asks the store for that message's attachments.
 */
export function findAttachment(db: DB, id: string, store: Pick<AttachmentStore, 'attachmentsFor'>): StoredAttachment | null {
  if (!id) return null
  try {
    const row = db.prepare('SELECT message_id FROM attachments WHERE id = ?').get(id) as { message_id: string } | undefined
    if (!row) return null
    return store.attachmentsFor(db, row.message_id).find((a) => a.id === id) ?? null
  } catch {
    return null
  }
}

/** Newest messages that carry attachments, for "what was in the pdf?" with no sender named. */
export function recentMessageIdsWithAttachments(db: DB, limit = 20): string[] {
  try {
    return (db.prepare('SELECT id FROM messages WHERE has_attachments = 1 ORDER BY date DESC LIMIT ?').all(limit) as { id: string }[]).map((r) => r.id)
  } catch {
    return []
  }
}
