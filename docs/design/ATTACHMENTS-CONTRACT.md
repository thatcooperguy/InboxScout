# v1.5 — Reads attachments and photos: build contract

Three agents build this concurrently. This file is the shared contract; do not change the signatures
below without updating this file and saying so in your report.

## Goal

InboxScout reads what is *inside* attachments, not just that they exist: invoices in PDFs, forms in Word
files, amounts in spreadsheets, and the text in photos and scanned pages (a photographed bill, a screenshot
of a schedule). What it finds feeds the same brief: bills, deadlines, sensitive documents, "needs you".
Everything happens on the person's computer; images go to the AI helper only when one is configured and
can see images, otherwise a built-in offline OCR reads them. Off switch: `readAttachments: 'off'`.

## Types (src/main/attachments/types.ts — owned by Agent 1, created first)

```ts
export type AttachmentKind = 'document' | 'image' | 'other'
export interface IncomingAttachment {
  filename: string
  contentType: string
  size: number
  /** Raw bytes. Fetchers cap: skip > 10 MB per file, > 60 MB per message, > 250 MB per sync; skip inline images < 20 KB (logos, signatures). */
  data: Uint8Array
  /** True for inline/embedded parts (Content-Disposition: inline or a Content-ID that the HTML references). */
  inline?: boolean
}
export interface StoredAttachment {
  id: string
  messageId: string          // messages.id (our UUID), not the RFC Message-ID
  accountId: string
  filename: string
  contentType: string
  size: number
  kind: AttachmentKind
  /** Absolute path under userData/attachments/<messageId>/<safe filename>, or null when the bytes were not kept. */
  path: string | null
  /** Extracted text (documents: full text ≤ 60 000 chars; images: OCR/vision text). Null until extracted. */
  text: string | null
  /** One or two plain-words sentences: what this is and the facts that matter (amount, due date, who, what for). */
  summary: string | null
  /** Structured facts pulled from text/summary. */
  facts: { amounts: string[]; dates: string[]; people: string[]; documentType: string | null }
  status: 'pending' | 'done' | 'skipped' | 'failed'
  /** How the text was obtained. */
  via: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text' | 'html' | 'ocr' | 'vision' | 'none' | null
  error: string | null
  createdAt: string
  extractedAt: string | null
}
export interface AttachmentFinding {
  attachmentId: string
  messageId: string
  filename: string
  kind: AttachmentKind
  summary: string
  facts: StoredAttachment['facts']
  /** ≤ 1 200 chars of the text for the classifier prompt. */
  excerpt: string
}
```

## Storage and extraction API (src/main/attachments/index.ts — Agent 1)

```ts
/** Save bytes to disk (under `userDataDir/attachments`) and insert a `pending` row. Never throws; oversize → 'skipped'. */
export function saveIncoming(db: DB, userDataDir: string, input: { messageId: string; accountId: string } & IncomingAttachment): StoredAttachment
/** Extract text/summary/facts for pending rows, newest first. Documents locally; images via `vision` when given, else OCR. Bounded by `limit` and `timeBudgetMs`. Never throws. */
export async function extractPending(db: DB, opts: {
  limit?: number                 // default 40
  timeBudgetMs?: number          // default 90 000
  vision?: VisionFn | null       // (image: Uint8Array, contentType, hint) => Promise<{ summary: string; text: string }>
  ocr?: boolean                  // default true — tesseract fallback for images and image-only PDFs
  log?: (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void
}): Promise<{ done: number; failed: number; findings: AttachmentFinding[] }>
export function attachmentsFor(db: DB, messageId: string): StoredAttachment[]
export function findingsFor(db: DB, messageIds: string[]): Map<string, AttachmentFinding[]>   // done rows only
export function attachmentText(db: DB, id: string, maxChars?: number): string | null
export function searchAttachments(db: DB, q: string, limit?: number): { attachment: StoredAttachment; snippet: string }[]  // FTS over attachment text, uses repo.toFtsQuery
export function storageStats(db: DB, userDataDir: string): { files: number; bytes: number; oldestAt: string | null }
/** Delete files (not rows/text) older than `days`; returns bytes freed. */
export function cleanupFiles(db: DB, userDataDir: string, days: number): { removed: number; bytes: number }
export type VisionFn = (image: Uint8Array, contentType: string, hint: string) => Promise<{ summary: string; text: string }>
```

DB (Agent 1, additive in `src/main/db/index.ts`): table `attachments` mirroring `StoredAttachment` (facts as JSON), index on
`message_id`, and `attachments_fts(filename, text)` external-content FTS5 with triggers like `messages_fts`.
Repo functions live in `src/main/attachments/store.ts` (not repo.ts) except nothing — Agent 1 owns the whole `attachments/` folder.

Extraction (Agent 1): PDF → `pdf-parse` (text) and, when a page yields < 20 chars/page, rasterise is NOT available — treat as scanned: OCR the PDF only if `pdfjs-dist` can render to a canvas in main (it cannot without a canvas package) → instead mark `via:'none'` with error "scanned PDF (no text layer)" **unless** vision is available: send the first page? Not possible without rendering. Decision: scanned PDFs get summary "Scanned document, N pages — open it to read." and are still listed. Word `.docx` → `mammoth` (raw text). `.xlsx` → `exceljs` (sheet by sheet, first 200 rows each, tab-separated). `.csv/.txt/.md/.json/.html/.eml` → text (html via the existing htmlToText). Images (`image/png|jpeg|webp|gif|heic?` — heic unsupported → 'other') → vision if provided, else OCR via `tesseract.js` with the English data bundled from `@tesseract.js-data/eng` and worker/core paths from node_modules (offline; `cachePath` under userData). Facts: amounts (`$1,234.56`, `USD`, `€`), dates (parseLooseDate from `src/main/reports/exports.ts` plus ISO/US formats), people (From/To/Bill to lines), documentType (invoice|receipt|statement|contract|form|letter|schedule|ticket|prescription|report|photo|screenshot|other) by keyword. Summary without an AI: template "Invoice from Acme — $450.00 due Sep 30" style from facts; with vision the model's sentence.

## Fetchers (Agent 2)

`src/main/mail/types.ts` (new): `export type FetchedMessage = MessageRecord & { attachments?: IncomingAttachment[] }`.
`syncFolder` (imap.ts), `syncGmail`/`fetchMessages` (gmail.ts), `syncGraphFolder` (graph.ts) return `FetchedMessage[]` in place of `MessageRecord[]` (structurally compatible; run.ts keeps working until Agent 3 uses the new field).
- IMAP: `parsed.attachments` from mailparser (content Buffer, filename, contentType, size, contentDisposition/cid → inline).
- Gmail: walk `payload.parts` for parts with `filename` and `body.attachmentId`; fetch `GET /messages/{id}/attachments/{attachmentId}` (base64url `data`), in the batch path too if easy, else per attachment with the 4-worker pool; respect the caps; inline = `Content-Disposition: inline` header or `Content-ID` present.
- Graph: when `hasAttachments`, `GET /me/messages/{id}/attachments?$select=id,name,contentType,size,isInline` then `GET .../attachments/{id}/$value` for `#microsoft.graph.fileAttachment` only; skip reference/item attachments.
- Caps and the inline-image rule are in `src/main/mail/attachmentsPolicy.ts` (Agent 2): `shouldKeep({filename, contentType, size, inline}): boolean`, `SYNC_BUDGET_BYTES`, `MESSAGE_BUDGET_BYTES`, `FILE_MAX_BYTES`, with tests.

## Pipeline, AI, UI, docs (Agent 3)

- Settings (src/shared/types.ts additive): `readAttachments: 'on' | 'off'` (default 'on'), `attachmentsKeepDays: number` (default 90); registry rows (group `watch` or wherever skills live; plain words: what/why/who/caution "Photos and documents are read on your computer. They go to your AI helper only if you connected one that can see images.").
- run.ts: after inserting new messages, `saveIncoming` for each `attachments` entry (when readAttachments is on); then before classification `extractPending(db, { limit: 40, vision, log })` where `vision` is built from the current model **only if the backend supports images** (see how `runner.ts`'s `getModel` decides `vision`; reuse that logic from ipc.ts/provider.ts); collect findings per message; pass `attachmentSummary` into the classifier input (schemas.ts/classify.ts: message input gains optional `attachments: string`; prompt says these are the contents of attached files) and into the built-in heuristics (`builtin.ts`: scan attachment text for amounts/deadlines/sensitive words → bills/deadline/sensitivity). Brief: issues whose facts came from an attachment say so in `whyNow`/`sources` ("from the attached invoice.pdf"). Delivery/helpers unchanged. Health: `attachments` check — storage over 2 GB or files older than keepDays → warn with repair `cleanupFiles(db, userData, keepDays)`.
- Ask: local intent `attachment` ("what was in the pdf/attachment/photo from X", "what did the invoice say") → `searchAttachments` + `attachmentsFor`; AI tool `read_attachment {id}` (redacted, ≤ 1500 chars) and `search_mail` results include an `attachments: [{id, filename, summary}]` field.
- Bridge/phone: read ops `list_attachments {messageId}` → StoredAttachment[] without `path`; `read_attachment {id}` → `{ text, summary, facts }`; `open_attachment {id}` (write; desktop only, uses shell.openPath) — not in PHONE_OPS.
- UI: Inbox review (Review.tsx) shows 📎 filename — summary per message with Open; Today rows that came from an attachment show a small 📎 tag; Settings → Health shows the storage line.
- Docs: `docs/ATTACHMENTS.md` (what is read, how, privacy, limits: scanned PDFs, HEIC, 10 MB), README feature row "📎 Reads attachments and photos", site feature card, ROADMAP v1.5 shipped entry, hermes SKILL.md rows.
- Tests: pipeline test with a fake extract (findings reach the classifier input and the built-in bills path), ask intent, ops allow-list, health check.

## Ownership

| Agent | Owns (edit freely) | May edit additively (Edit only, own block) | Must not touch |
|---|---|---|---|
| 1 extraction | `src/main/attachments/**`, `tests/attachments*.test.ts`, `package.json`/lockfile (deps: pdf-parse, mammoth, exceljs, tesseract.js, @tesseract.js-data/eng), `test/fixtures/attachments/**` | `src/main/db/index.ts` (table + FTS block), `src/main/db/repo.ts` (nothing needed) | everything else |
| 2 fetchers | `src/main/mail/imap.ts`, `gmail.ts`, `graph.ts`, `src/main/mail/types.ts`, `src/main/mail/attachmentsPolicy.ts`, `tests/gmail.test.ts`, `tests/graph.test.ts`, `tests/imap*.test.ts` | — | everything else |
| 3 pipeline/UI | `src/main/pipeline/run.ts`, `src/main/ai/{classify,schemas,builtin,brief}.ts`, `src/main/reports/render.ts`, `src/main/ask/**`, `src/main/api/{ops,phone,phoneApp,local}.ts`, `src/main/ipc.ts`, `src/preload/**`, `src/renderer/**`, `src/shared/{types,settingsRegistry}.ts`, `src/main/health/**`, docs, README, site, `integrations/hermes/SKILL.md`, its tests | — | `src/main/attachments/**`, `src/main/mail/**`, `package.json` |

Rules for all: never `git stash`/`checkout --`/`reset`/commit/push; never use Write on an existing file; typecheck may fail in files you do not own while others are mid-edit — wait 60 s and retry up to 3 times, and report failures that are not yours. Agent 3 may stub `../attachments/index` imports against this contract if Agent 1's module is not on disk yet; re-run typecheck at the end.
