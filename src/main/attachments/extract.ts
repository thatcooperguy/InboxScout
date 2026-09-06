// One reader per file type. Every reader is wrapped so a bad file returns a 'failed' result instead of throwing,
// and every reader stops at MAX_TEXT_CHARS. Images go to the AI helper (vision) when one can see, else to OCR.
import { extname } from 'node:path'
import { htmlToText } from '../mail/graph'
import { ocrImage } from './ocr'
import { MAX_TEXT_CHARS, type AttachmentKind, type ExtractResult, type ExtractShape, type LogFn, type ReaderKind, type VisionFn } from './types'

/** Rows per sheet we keep from a spreadsheet. */
export const XLSX_MAX_ROWS = 200
/** How many characters a PDF page must yield before we believe it has a text layer. */
export const SCANNED_CHARS_PER_PAGE = 20
/** Per-file wall-clock limit (the batch budget in extractPending is the outer bound). */
export const ITEM_TIMEOUT_MS = 60_000

const EXT_READERS: Record<string, ReaderKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.txt': 'text',
  '.text': 'text',
  '.md': 'text',
  '.markdown': 'text',
  '.json': 'text',
  '.eml': 'text',
  '.log': 'text',
  '.html': 'html',
  '.htm': 'html',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.bmp': 'image'
}

const MIME_READERS: Record<string, ReaderKind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'xlsx',
  'text/csv': 'csv',
  'text/tab-separated-values': 'csv',
  'text/plain': 'text',
  'text/markdown': 'text',
  'application/json': 'text',
  'message/rfc822': 'text',
  'text/html': 'html',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/bmp': 'image'
}

/** Which reader handles this file: the extension decides when we know it, else the declared type. HEIC and the rest → null. */
export function readerFor(filename: string, contentType: string): ReaderKind {
  const ext = extname(String(filename ?? '')).toLowerCase()
  if (ext && EXT_READERS[ext] !== undefined) return EXT_READERS[ext]
  const mime = String(contentType ?? '').toLowerCase().split(';')[0].trim()
  return MIME_READERS[mime] ?? null
}

export function kindFor(filename: string, contentType: string): AttachmentKind {
  const r = readerFor(filename, contentType)
  if (r === null) return 'other'
  return r === 'image' ? 'image' : 'document'
}

export function isImageType(contentType: string): boolean {
  return /^image\//i.test(String(contentType ?? ''))
}

// ---- Helpers ----

export function plainError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return String(msg ?? 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 200) || 'unknown error'
}

function cap(text: string): string {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
  return t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) : t
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '')
}

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)} s`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const done = (text: string, via: ExtractResult['via'], shape: ExtractShape = {}, summary: string | null = null): ExtractResult => ({
  status: 'done',
  text: cap(text),
  via,
  summary,
  error: null,
  shape
})

const failed = (error: string, via: ExtractResult['via'] = null): ExtractResult => ({ status: 'failed', text: '', via, summary: null, error, shape: {} })

const TOTALS_RE = /\b(total|totals|sum|amount due|balance|grand total|subtotal)\b/i

// ---- Readers ----

async function readPdf(bytes: Uint8Array): Promise<ExtractResult> {
  const { PDFParse } = await import('pdf-parse')
  // pdf-parse takes ownership of the array it is given; hand it a copy so the caller's bytes stay intact.
  const parser = new PDFParse({ data: new Uint8Array(bytes) })
  try {
    const result = await parser.getText({ pageJoiner: '' })
    const pages = Math.max(1, result.total || result.pages.length || 1)
    const text = result.pages.map((p) => p.text.trim()).filter(Boolean).join('\n\n')
    const chars = result.pages.reduce((n, p) => n + p.text.trim().length, 0)
    if (chars / pages < SCANNED_CHARS_PER_PAGE) {
      return done('', 'none', { pages }, `Scanned document, ${pages} ${pages === 1 ? 'page' : 'pages'} — open it to read.`)
    }
    return done(text, 'pdf', { pages })
  } finally {
    await parser.destroy().catch(() => {})
  }
}

/**
 * mammoth and exceljs are CommonJS; under a native `import()` (what the bundled main process runs) their API can sit
 * on `.default` instead of the namespace, so take whichever holds it.
 */
function cjs<T>(mod: T): T {
  const d = (mod as { default?: T }).default
  return d && typeof d === 'object' ? d : mod
}

async function readDocx(bytes: Uint8Array): Promise<ExtractResult> {
  const mammoth = cjs(await import('mammoth'))
  const result = await mammoth.extractRawText({ buffer: toBuffer(bytes) })
  const text = String(result.value ?? '').replace(/\n{3,}/g, '\n\n').trim()
  return done(text, 'docx')
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('')
    if ('result' in o) return cellText(o.result)
    if ('text' in o) return cellText(o.text)
    if ('hyperlink' in o) return String(o.hyperlink ?? '')
    if ('error' in o) return String(o.error ?? '')
    return ''
  }
  return String(v)
}

async function readXlsx(bytes: Uint8Array): Promise<ExtractResult> {
  const ExcelJS = cjs(await import('exceljs'))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(toBuffer(bytes) as any)
  const parts: string[] = []
  let sheets = 0
  let rows = 0
  let hasTotals = false
  let columns: string[] | undefined
  workbook.eachSheet((ws) => {
    sheets++
    const total = ws.rowCount
    rows += total
    const lines: string[] = [`## Sheet: ${ws.name}`]
    const limit = Math.min(total, XLSX_MAX_ROWS)
    for (let i = 1; i <= limit; i++) {
      const row = ws.getRow(i)
      const values = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : []
      const cells = values.map(cellText)
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      if (cells.length === 0) continue
      if (i === 1) {
        if (!columns) columns = cells.filter(Boolean).slice(0, 8)
        if (cells.some((c) => TOTALS_RE.test(c))) hasTotals = true
      } else if (cells[0] && /^\s*(grand\s+)?total/i.test(cells[0])) {
        hasTotals = true
      }
      lines.push(cells.join('\t'))
    }
    if (total > limit) lines.push(`(showing first ${limit} of ${total} rows)`)
    parts.push(lines.join('\n'))
  })
  return done(parts.join('\n\n'), 'xlsx', { sheets, rows, hasTotals, columns })
}

function readCsv(bytes: Uint8Array, filename: string): ExtractResult {
  const text = decode(bytes)
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const sep = extname(filename).toLowerCase() === '.tsv' || (lines[0]?.includes('\t') && !lines[0]?.includes(',')) ? '\t' : ','
  const header = (lines[0] ?? '').split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
  const hasTotals = header.some((c) => TOTALS_RE.test(c)) || lines.some((l) => /^"?\s*(grand\s+)?total/i.test(l))
  return done(text, 'csv', { rows: Math.max(0, lines.length - 1), columns: header.filter(Boolean).slice(0, 8), hasTotals })
}

function readText(bytes: Uint8Array): ExtractResult {
  return done(decode(bytes), 'text')
}

function readHtml(bytes: Uint8Array): ExtractResult {
  return done(htmlToText(decode(bytes)), 'html')
}

async function readImage(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  opts: { vision?: VisionFn | null; ocr?: boolean; ocrCachePath?: string; log?: LogFn }
): Promise<ExtractResult> {
  const mime = contentType && isImageType(contentType) ? contentType : mimeForImage(filename)
  if (opts.vision) {
    try {
      const hint = `Image attached to an email, file name "${filename}". Say in one plain sentence what it shows and the facts that matter (amounts, dates, names), then give every word of text you can read.`
      const r = await opts.vision(bytes, mime, hint)
      const text = String(r?.text ?? '').trim()
      const summary = String(r?.summary ?? '').trim()
      if (text || summary) return done(text, 'vision', {}, summary || null)
      opts.log?.('warn', 'attachments', `AI helper saw nothing in ${filename}; trying the offline reader`)
    } catch (err) {
      opts.log?.('warn', 'attachments', `AI helper could not read ${filename}: ${plainError(err)}`)
    }
  }
  if (opts.ocr !== false) {
    try {
      const text = await ocrImage(bytes, { cachePath: opts.ocrCachePath, log: opts.log })
      return done(text, 'ocr')
    } catch (err) {
      return failed(plainError(err), 'ocr')
    }
  }
  return failed(opts.vision ? 'AI helper could not read this image and the offline reader is off' : 'No image reader: connect an AI helper that can see images or turn on the offline reader')
}

function mimeForImage(filename: string): string {
  const ext = extname(filename).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  return 'application/octet-stream'
}

export interface ExtractInput {
  filename: string
  contentType: string
  bytes: Uint8Array
}

export interface ExtractOptions {
  vision?: VisionFn | null
  ocr?: boolean
  ocrCachePath?: string
  log?: LogFn
  timeoutMs?: number
}

/** Read one file. Never throws: unreadable files come back as `status: 'failed'` with a plain-words error. */
export async function extractOne(input: ExtractInput, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const reader = readerFor(input.filename, input.contentType)
  if (reader === null) return failed('This kind of file is not read')
  if (input.bytes.byteLength === 0) return failed('The file is empty')
  const timeoutMs = opts.timeoutMs ?? ITEM_TIMEOUT_MS
  const run = async (): Promise<ExtractResult> => {
    switch (reader) {
      case 'pdf':
        return readPdf(input.bytes)
      case 'docx':
        return readDocx(input.bytes)
      case 'xlsx':
        return readXlsx(input.bytes)
      case 'csv':
        return readCsv(input.bytes, input.filename)
      case 'text':
        return readText(input.bytes)
      case 'html':
        return readHtml(input.bytes)
      case 'image':
        return readImage(input.bytes, input.filename, input.contentType, opts)
    }
  }
  try {
    return await withTimeout(run(), timeoutMs, `Reading ${input.filename}`)
  } catch (err) {
    const via = reader === 'image' ? null : reader
    return failed(friendly(plainError(err)), via)
  }
}

/** Library errors in plain words where we recognise them. */
function friendly(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('password')) return 'This PDF is password-protected'
  if (m.includes('invalid pdf') || m.includes('pdf header')) return 'This file is not a readable PDF'
  if (m.includes('zip') && (m.includes('end of central') || m.includes('corrupt') || m.includes('invalid'))) return 'This file is damaged or not the type its name says'
  return msg
}
