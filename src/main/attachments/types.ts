// v1.5 "Reads attachments and photos" — shared types. The exported shapes below are the build contract
// (docs/design/ATTACHMENTS-CONTRACT.md); the fetchers and the pipeline code against them.

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

export type VisionFn = (image: Uint8Array, contentType: string, hint: string) => Promise<{ summary: string; text: string }>

// ---- Internal shapes (not part of the contract) ----

export type AttachmentFacts = StoredAttachment['facts']
export type AttachmentVia = StoredAttachment['via']
export type LogFn = (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void

/** Which reader handles a file; 'image' goes to vision/OCR, null means "we do not read this type". */
export type ReaderKind = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text' | 'html' | 'image' | null

/** What one reader produced for one file. */
export interface ExtractResult {
  status: 'done' | 'failed'
  text: string
  via: AttachmentVia
  /** A ready sentence when the reader knows better than the template (vision summary, scanned PDF). */
  summary: string | null
  error: string | null
  /** Shape hints for the template summary. */
  shape: ExtractShape
}

export interface ExtractShape {
  pages?: number
  sheets?: number
  rows?: number
  columns?: string[]
  hasTotals?: boolean
}

export const EMPTY_FACTS: AttachmentFacts = { amounts: [], dates: [], people: [], documentType: null }

/** Extracted text is capped here (documents and images alike). */
export const MAX_TEXT_CHARS = 60_000
/** Findings carry at most this much text into the classifier prompt. */
export const EXCERPT_CHARS = 1_200
/** Files above this are never read (and their bytes are not kept). */
export const FILE_MAX_BYTES = 10 * 1024 * 1024
