// Facts from extracted text (amounts, dates, people, what kind of document) and the plain-words summary used
// when no AI helper wrote one: "Invoice from Acme — $450.00 due Sep 30".
import { parseLooseDate } from '../reports/exports'
import { EMPTY_FACTS, type AttachmentFacts, type AttachmentKind, type ExtractShape } from './types'

const MAX_ITEMS = 10
/** Only the head of a long text is scanned for facts; that is where invoices and forms put them. */
const SCAN_CHARS = 20_000

// ---- Amounts ----

const CODES = 'USD|EUR|GBP|CAD|AUD|NZD|CHF|JPY|INR|MXN'
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`
const AMOUNT_RE = new RegExp(
  [
    // $1,234.56  € 45  £12  (optional minus)
    String.raw`(?:-\s?)?[$€£¥]\s?(?:${NUM})(?!\d)`,
    // USD 1,234.56 / USD1234
    String.raw`\b(?:${CODES})\s?(?:${NUM})(?!\d)`,
    // 1,234.56 USD / 45 dollars / 45 euros
    String.raw`\b(?:${NUM})\s?(?:${CODES}|dollars|euros|pounds)\b`
  ].join('|'),
  'gi'
)

export function extractAmounts(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of String(text ?? '').slice(0, SCAN_CHARS).matchAll(AMOUNT_RE)) {
    const raw = m[0].replace(/\s+/g, ' ').replace(/([$€£¥]) /, '$1').trim()
    const key = raw.toLowerCase().replace(/ /g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(raw)
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

// ---- Dates ----

const MONTH = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`
const ISO_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g
const US_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g
const US_SHORT_RE = /\b(?:due|on|by|date|dated|deadline|before|until)\s*:?\s*(\d{1,2})\/(\d{1,2})\b(?!\/)/gi
const MONTH_DAY_RE = new RegExp(String.raw`\b${MONTH}\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b(?!\s*(?:am|pm))`, 'gi')
const DAY_MONTH_RE = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}(?:,?\s+(\d{4}))?\b`, 'gi')

function isoOf(d: Date | null): string | null {
  if (!d || isNaN(d.getTime())) return null
  const y = d.getFullYear()
  if (y < 1990 || y > 2100) return null
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Dates in the text as YYYY-MM-DD, in order of appearance, without repeats. */
export function extractDates(text: string, now = new Date()): string[] {
  const t = String(text ?? '').slice(0, SCAN_CHARS)
  const found: { at: number; iso: string }[] = []
  const add = (at: number, iso: string | null): void => {
    if (iso) found.push({ at, iso })
  }
  for (const m of t.matchAll(ISO_RE)) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])) add(m.index ?? 0, isoOf(d))
  }
  for (const m of t.matchAll(US_RE)) {
    if (Number(m[1]) > 12 || Number(m[2]) > 31) continue
    add(m.index ?? 0, isoOf(parseLooseDate(m[0], now)))
  }
  for (const m of t.matchAll(US_SHORT_RE)) {
    if (Number(m[1]) > 12 || Number(m[2]) > 31) continue
    add(m.index ?? 0, isoOf(parseLooseDate(`${m[1]}/${m[2]}`, now)))
  }
  for (const m of t.matchAll(MONTH_DAY_RE)) {
    if (Number(m[2]) > 31) continue
    add(m.index ?? 0, isoOf(parseLooseDate(`${m[1].slice(0, 3)} ${m[2]}${m[3] ? `, ${m[3]}` : ''}`, now)))
  }
  for (const m of t.matchAll(DAY_MONTH_RE)) {
    if (Number(m[1]) > 31) continue
    add(m.index ?? 0, isoOf(parseLooseDate(`${m[2].slice(0, 3)} ${m[1]}${m[3] ? `, ${m[3]}` : ''}`, now)))
  }
  found.sort((a, b) => a.at - b.at)
  const out: string[] = []
  for (const f of found) {
    if (out.includes(f.iso)) continue
    out.push(f.iso)
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

// ---- People ----

export type PersonRole = 'from' | 'to'

const FROM_LABELS = ['from', 'sender', 'vendor', 'issued by', 'billed by', 'provider', 'landlord', 'seller', 'merchant', 'payee']
const TO_LABELS = [
  'to',
  'bill to',
  'billed to',
  'sold to',
  'ship to',
  'invoice to',
  'attn',
  'attention',
  'dear',
  'patient',
  'customer',
  'customer name',
  'prepared for',
  'tenant',
  'applicant',
  'employee',
  'recipient',
  'name'
]
const PEOPLE_RE = new RegExp(
  String.raw`^\s*(${[...FROM_LABELS, ...TO_LABELS].map((l) => l.replace(/ /g, String.raw`\s+`)).join('|')})\s*[:\-]?\s+(.{2,120})$`,
  'i'
)

function cleanName(raw: string): string | null {
  let s = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\S+@\S+/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .split(/\s{2,}|\t|\s\|\s|;/)[0]
    .split(',')[0]
    .replace(/[\s.:\-–—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^(the )?(undersigned|whom it may concern|sir|madam|sir or madam|customer|valued customer|all|team)$/i.test(s)) return null
  if (!/\p{L}{2,}/u.test(s)) return null
  if (/\d{3,}/.test(s) && !/\b(llc|inc|ltd|co|corp)\b/i.test(s)) return null
  if (s.length > 60) s = s.slice(0, 60).trim()
  return s
}

/** "From: Acme Plumbing" → { role: 'from', name: 'Acme Plumbing' }; "Dear Chad," → { role: 'to', name: 'Chad' }. */
export function extractPeopleDetailed(text: string): { role: PersonRole; name: string }[] {
  const out: { role: PersonRole; name: string }[] = []
  const seen = new Set<string>()
  for (const line of String(text ?? '').slice(0, SCAN_CHARS).split('\n')) {
    const m = line.match(PEOPLE_RE)
    if (!m) continue
    const label = m[1].toLowerCase().replace(/\s+/g, ' ')
    const name = cleanName(m[2])
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ role: FROM_LABELS.includes(label) ? 'from' : 'to', name })
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

export function extractPeople(text: string): string[] {
  return extractPeopleDetailed(text).map((p) => p.name)
}

// ---- Document type ----

export const DOCUMENT_TYPES = ['invoice', 'receipt', 'statement', 'contract', 'form', 'letter', 'schedule', 'ticket', 'prescription', 'report', 'photo', 'screenshot', 'other'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** Keywords per type; earlier rows win ties. Weight 2 for words that almost never appear elsewhere. */
const TYPE_KEYWORDS: { type: DocumentType; words: [RegExp, number][] }[] = [
  { type: 'invoice', words: [[/\binvoice\b/g, 2], [/\bamount due\b/g, 2], [/\bbill to\b/g, 1], [/\bdue date\b/g, 1], [/\bpay(?:ment)? (?:by|due)\b/g, 1], [/\bbalance due\b/g, 1]] },
  { type: 'receipt', words: [[/\breceipt\b/g, 2], [/\bthank you for your (?:purchase|order|payment)\b/g, 2], [/\border (?:confirmation|number|#)\b/g, 1], [/\bpaid\b/g, 1], [/\bchange due\b/g, 1]] },
  { type: 'statement', words: [[/\bstatement\b/g, 2], [/\baccount summary\b/g, 2], [/\bclosing balance\b/g, 2], [/\bopening balance\b/g, 1], [/\bminimum payment\b/g, 1], [/\bstatement period\b/g, 1]] },
  { type: 'contract', words: [[/\bagreement\b/g, 2], [/\bcontract\b/g, 2], [/\bterms and conditions\b/g, 1], [/\bhereby\b/g, 1], [/\bparties\b/g, 1], [/\blease\b/g, 1], [/\bsignature\b/g, 1]] },
  { type: 'prescription', words: [[/\bprescription\b/g, 2], [/\bpharmacy\b/g, 2], [/\brefills?\b/g, 2], [/\bdosage\b/g, 1], [/\b\d+\s?mg\b/g, 1], [/\brx\b/g, 1]] },
  { type: 'ticket', words: [[/\bboarding pass\b/g, 2], [/\bticket\b/g, 2], [/\badmission\b/g, 1], [/\bconfirmation (?:number|code|#)\b/g, 1], [/\breservation\b/g, 1], [/\bseat\b/g, 1], [/\bgate\b/g, 1]] },
  { type: 'schedule', words: [[/\bschedule\b/g, 2], [/\bitinerary\b/g, 2], [/\bagenda\b/g, 2], [/\btimetable\b/g, 2], [/\bcalendar\b/g, 1], [/\b\d{1,2}:\d{2}\s?(?:am|pm)\b/g, 1]] },
  { type: 'form', words: [[/\bform\b/g, 2], [/\bplease (?:fill|complete)\b/g, 2], [/\bapplicant\b/g, 1], [/\bcheck (?:one|all that apply)\b/g, 1], [/\bdate of birth\b/g, 1], [/\bsign here\b/g, 1]] },
  { type: 'report', words: [[/\breport\b/g, 2], [/\bfindings\b/g, 1], [/\bresults\b/g, 1], [/\bsummary\b/g, 1], [/\banalysis\b/g, 1]] },
  { type: 'letter', words: [[/\bdear\b/g, 2], [/\bsincerely\b/g, 2], [/\b(?:kind|best|warm) regards\b/g, 1], [/\byours (?:truly|faithfully)\b/g, 1], [/\bto whom it may concern\b/g, 1]] }
]

const SCREENSHOT_NAME_RE = /screen ?shot|screen_shot|capture|snip/i

/** What this file is, from the text (documents) or the file name (images). Null when nothing gives it away. */
export function detectDocumentType(kind: AttachmentKind, filename: string, text: string): DocumentType | null {
  const head = String(text ?? '').slice(0, 6000).toLowerCase()
  if (kind === 'image') {
    if (SCREENSHOT_NAME_RE.test(filename)) return 'screenshot'
    const typed = scoreTypes(head)
    return typed ?? 'photo'
  }
  if (kind !== 'document') return null
  const byName = nameHint(filename)
  const typed = scoreTypes(head)
  if (typed) return typed
  return byName
}

function nameHint(filename: string): DocumentType | null {
  const f = filename.toLowerCase()
  for (const t of TYPE_KEYWORDS) if (f.includes(t.type)) return t.type
  return null
}

function scoreTypes(head: string): DocumentType | null {
  let best: { type: DocumentType; score: number } | null = null
  for (const t of TYPE_KEYWORDS) {
    let score = 0
    for (const [re, weight] of t.words) {
      const hits = head.match(re)?.length ?? 0
      score += Math.min(hits, 3) * weight
    }
    if (score > 0 && (!best || score > best.score)) best = { type: t.type, score }
  }
  return best?.type ?? null
}

// ---- All together ----

export function extractFacts(kind: AttachmentKind, filename: string, text: string, now = new Date()): AttachmentFacts {
  const t = String(text ?? '')
  if (!t.trim()) return { ...EMPTY_FACTS, documentType: kind === 'image' ? detectDocumentType(kind, filename, '') : null }
  return {
    amounts: extractAmounts(t),
    dates: extractDates(t, now),
    people: extractPeople(t),
    documentType: detectDocumentType(kind, filename, t)
  }
}

// ---- Summary ----

const LABELS: Record<string, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  statement: 'Statement',
  contract: 'Contract',
  form: 'Form',
  letter: 'Letter',
  schedule: 'Schedule',
  ticket: 'Ticket',
  prescription: 'Prescription',
  report: 'Report'
}
const DATE_WORD: Record<string, string> = { invoice: 'due', statement: 'due', contract: 'by', form: 'by' }

/** "Sep 30" (or "Sep 30, 2027" when it is not this year). */
export function shortDate(iso: string, now = new Date()): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const label = `${names[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`
  return Number(m[1]) === now.getFullYear() ? label : `${label}, ${m[1]}`
}

export function clip(text: string, max: number): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trim()}…`
}

function firstLine(text: string): string {
  for (const line of String(text ?? '').split('\n')) {
    const l = line.trim()
    if (l.length >= 3 && /\p{L}/u.test(l)) return l
  }
  return ''
}

/** The amount to headline: one that sits next to "total"/"due" wins, else the first. */
function keyAmount(text: string, amounts: string[]): string | null {
  if (amounts.length === 0) return null
  const head = String(text ?? '').slice(0, SCAN_CHARS)
  for (const line of head.split('\n')) {
    if (!/\b(total|amount due|balance due|grand total|you owe|pay)\b/i.test(line)) continue
    const hit = amounts.find((a) => line.includes(a))
    if (hit) return hit
  }
  return amounts[0]
}

const STRONG_DATE_CUE = /\b(due|deadline|pay(?:able)? by|return by|expir\w*|appointment|by)\b/i
const WEAK_DATE_CUE = /\bdate\b/i
/** "Statement date", "invoice date", "date issued": when the document was made, not when something is wanted. */
const MADE_ON_CUE = /\b(statement|invoice|issue[d]?|order|print(?:ed)?|receipt)\s+date\b|\bdate\s+(issued|of issue|printed)\b/i

/** The date to headline: one next to "due"/"by"/"expires" wins, then one next to "date" (not "statement date"), else the first. */
function keyDate(text: string, dates: string[], now: Date): string | null {
  if (dates.length === 0) return null
  const lines = String(text ?? '').slice(0, SCAN_CHARS).split('\n')
  const pick = (cue: RegExp, skip?: RegExp): string | null => {
    for (const line of lines) {
      if (!cue.test(line) || (skip && skip.test(line))) continue
      const inLine = extractDates(line, now)
      if (inLine.length > 0 && dates.includes(inLine[0])) return inLine[0]
    }
    return null
  }
  return pick(STRONG_DATE_CUE) ?? pick(WEAK_DATE_CUE, MADE_ON_CUE) ?? dates[0]
}

/** The plain-words sentence when no AI helper wrote one. */
export function summarize(kind: AttachmentKind, filename: string, text: string, facts: AttachmentFacts, shape: ExtractShape = {}, now = new Date()): string {
  const t = String(text ?? '')
  const amount = keyAmount(t, facts.amounts)
  const date = keyDate(t, facts.dates, now)
  const type = facts.documentType

  if (kind === 'image') {
    const noun = type === 'screenshot' ? 'Screenshot' : 'Photo'
    if (!t.trim()) return `${noun} — no readable text.`
    const tail = [amount, date ? shortDate(date, now) : null].filter(Boolean).join(', ')
    return `${noun} with text: '${clip(t, 80)}'${tail ? ` — ${tail}` : ''}`
  }

  if (shape.sheets !== undefined) {
    const s = shape.sheets
    const r = shape.rows ?? 0
    return `Spreadsheet: ${s} ${s === 1 ? 'sheet' : 'sheets'}, ${r} ${r === 1 ? 'row' : 'rows'} — ${shape.hasTotals ? 'totals column present' : 'no totals column'}`
  }
  if (shape.columns !== undefined && shape.sheets === undefined && shape.pages === undefined) {
    const r = shape.rows ?? 0
    const cols = shape.columns.slice(0, 5).join(', ')
    return `Table: ${r} ${r === 1 ? 'row' : 'rows'}${cols ? ` — columns: ${cols}` : ''}`
  }

  const people = extractPeopleDetailed(t)
  const from = people.find((p) => p.role === 'from')?.name ?? null
  const to = people.find((p) => p.role === 'to')?.name ?? null
  const who = from ? ` from ${from}` : to ? ` for ${to}` : ''
  const label = type ? LABELS[type] : null
  if (label) {
    const when = date ? `${DATE_WORD[type!] ?? 'on'} ${shortDate(date, now)}` : ''
    const tail = [amount, when].filter(Boolean).join(' ')
    return `${label}${who}${tail ? ` — ${tail}` : ''}`
  }
  const head = firstLine(t)
  const tail = [amount, date ? shortDate(date, now) : null].filter(Boolean).join(', ')
  if (!head) return `Document "${filename}"${who} — no readable text.`
  return `Document${who}: '${clip(head, 80)}'${tail ? ` — ${tail}` : ''}`
}
