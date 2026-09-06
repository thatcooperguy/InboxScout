import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { openDatabase, type DB } from '../src/main/db/index'
import {
  attachmentText,
  attachmentsFor,
  cleanupFiles,
  extractPending,
  findingsFor,
  saveIncoming,
  searchAttachments,
  storageStats
} from '../src/main/attachments/index'
import { ocrAvailable, ocrImage, resolveOcrPaths, shutdownOcr } from '../src/main/attachments/ocr'
import { extractOne } from '../src/main/attachments/extract'
import type { StoredAttachment } from '../src/main/attachments/types'

const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'attachments')
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)))

let userData: string
beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), 'inboxscout-attachments-'))
})
afterAll(async () => {
  await shutdownOcr()
  rmSync(userData, { recursive: true, force: true })
})

type Saved = ReturnType<typeof saveIncoming>
function save(db: DB, messageId: string, filename: string, contentType: string, data: Uint8Array, extra: Partial<Parameters<typeof saveIncoming>[2]> = {}): Saved {
  return saveIncoming(db, userData, { messageId, accountId: 'acc-1', filename, contentType, size: data.byteLength, data, ...extra })
}

const OCR_START_RE = /could not start|not installed/i

describe('saveIncoming', () => {
  it('writes the file under userData/attachments/<messageId>/<safe name> and inserts a pending row', () => {
    const db = openDatabase(':memory:')
    const row = save(db, 'msg-1', 'invoice.pdf', 'application/pdf', fixture('invoice.pdf'))
    expect(row.status).toBe('pending')
    expect(row.kind).toBe('document')
    expect(row.path).toBe(join(userData, 'attachments', 'msg-1', 'invoice.pdf'))
    expect(existsSync(row.path!)).toBe(true)
    expect(row.size).toBe(fixture('invoice.pdf').byteLength)
    expect(row.text).toBeNull()
    expect(row.facts).toEqual({ amounts: [], dates: [], people: [], documentType: null })
    const [stored] = attachmentsFor(db, 'msg-1')
    expect(stored).toEqual(row)
  })

  it('keeps names inside the folder and dedupes with -2, -3 suffixes', () => {
    const db = openDatabase(':memory:')
    const evil = save(db, 'msg-2', '../../../evil.pdf', 'application/pdf', fixture('invoice.pdf'))
    expect(evil.path!.startsWith(join(userData, 'attachments', 'msg-2') + sep)).toBe(true)
    expect(evil.path!.endsWith(`${sep}evil.pdf`)).toBe(true)
    const again = save(db, 'msg-2', 'evil.pdf', 'application/pdf', fixture('invoice.pdf'))
    expect(again.path!.endsWith(`${sep}evil-2.pdf`)).toBe(true)
    const third = save(db, 'msg-2', 'evil.pdf', 'application/pdf', fixture('invoice.pdf'))
    expect(third.path!.endsWith(`${sep}evil-3.pdf`)).toBe(true)
    // The display name stays what the mail said.
    expect(attachmentsFor(db, 'msg-2').map((a) => a.filename)).toEqual(['../../../evil.pdf', 'evil.pdf', 'evil.pdf'])
    expect(readdirSync(join(userData, 'attachments', 'msg-2')).sort()).toEqual(['evil-2.pdf', 'evil-3.pdf', 'evil.pdf'])
  })

  it('skips oversize files without keeping bytes, and unreadable kinds while keeping them', () => {
    const db = openDatabase(':memory:')
    const big = save(db, 'msg-3', 'huge.pdf', 'application/pdf', fixture('invoice.pdf'), { size: 11 * 1024 * 1024 })
    expect(big.status).toBe('skipped')
    expect(big.error).toMatch(/over 10 MB/)
    expect(big.path).toBeNull()
    const empty = save(db, 'msg-3', 'empty.txt', 'text/plain', new Uint8Array(0))
    expect(empty.status).toBe('skipped')
    expect(empty.path).toBeNull()
    const heic = save(db, 'msg-3', 'IMG_1.heic', 'image/heic', new Uint8Array([1, 2, 3]))
    expect(heic.kind).toBe('other')
    expect(heic.status).toBe('skipped')
    expect(heic.error).toBe('This kind of file is not read')
    expect(existsSync(heic.path!)).toBe(true)
    const logo = save(db, 'msg-3', 'logo.png', 'image/png', new Uint8Array(500), { inline: true })
    expect(logo.status).toBe('skipped')
    expect(logo.error).toMatch(/inline image/)
    const photo = save(db, 'msg-3', 'photo.png', 'image/png', fixture('ocr.png'), { inline: true })
    expect(photo.status).toBe('skipped') // 12 KB inline image: still under the 20 KB logo rule
    const real = save(db, 'msg-3', 'photo.png', 'image/png', fixture('ocr.png'))
    expect(real.status).toBe('pending')
    expect(real.kind).toBe('image')
    expect(attachmentsFor(db, 'msg-3')).toHaveLength(6)
  })

  it('never throws, even with a closed database', () => {
    const db = openDatabase(':memory:')
    db.close()
    const row = save(db, 'msg-4', 'a.txt', 'text/plain', new Uint8Array([65]))
    expect(row.status).toBe('failed')
    expect(row.error).toMatch(/Could not record/)
  })
})

describe('extractPending', () => {
  async function extractAll(db: DB, opts: Parameters<typeof extractPending>[1] = {}): Promise<Map<string, StoredAttachment>> {
    await extractPending(db, { ocr: false, ...opts })
    const out = new Map<string, StoredAttachment>()
    for (const r of db.prepare('SELECT id FROM attachments').all() as { id: string }[]) {
      const a = attachmentsFor(db, (db.prepare('SELECT message_id FROM attachments WHERE id = ?').get(r.id) as any).message_id).find((x) => x.id === r.id)!
      out.set(a.filename, a)
    }
    return out
  }

  it('reads a PDF with a text layer: text, facts, invoice summary', async () => {
    const db = openDatabase(':memory:')
    save(db, 'msg-1', 'invoice.pdf', 'application/pdf', fixture('invoice.pdf'))
    const result = await extractPending(db, { ocr: false })
    expect(result.done).toBe(1)
    expect(result.failed).toBe(0)
    const [a] = attachmentsFor(db, 'msg-1')
    expect(a.status).toBe('done')
    expect(a.via).toBe('pdf')
    expect(a.text).toContain('Acme Plumbing LLC')
    expect(a.text).toContain('Page 2')
    expect(a.text).not.toContain('-- 1 of 2 --')
    expect(a.facts.amounts).toEqual(['$450.00'])
    expect(a.facts.dates).toEqual(['2026-09-30'])
    expect(a.facts.people).toEqual(['Acme Plumbing LLC', 'Chad Cooper'])
    expect(a.facts.documentType).toBe('invoice')
    expect(a.summary!.startsWith('Invoice from Acme Plumbing LLC — $450.00 due Sep 30')).toBe(true)
    expect(a.extractedAt).not.toBeNull()
    expect(a.error).toBeNull()
    const [f] = result.findings
    expect(f.attachmentId).toBe(a.id)
    expect(f.messageId).toBe('msg-1')
    expect(f.kind).toBe('document')
    expect(f.summary).toBe(a.summary)
    expect(f.excerpt).toContain('INVOICE #1042')
  })

  it('treats a PDF without a text layer as scanned (via none, still done and listed)', async () => {
    const db = openDatabase(':memory:')
    save(db, 'msg-1', 'scan.pdf', 'application/pdf', fixture('scanned.pdf'))
    const result = await extractPending(db, { ocr: false })
    expect(result.done).toBe(1)
    const [a] = attachmentsFor(db, 'msg-1')
    expect(a.status).toBe('done')
    expect(a.via).toBe('none')
    expect(a.text).toBe('')
    expect(a.summary).toBe('Scanned document, 3 pages — open it to read.')
    expect(result.findings[0].summary).toBe(a.summary)
    expect(result.findings[0].excerpt).toBe('')
  })

  it('reads docx, xlsx, csv, txt, and html with the right reader each', async () => {
    const db = openDatabase(':memory:')
    save(db, 'msg-1', 'agreement.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fixture('agreement.docx'))
    save(db, 'msg-1', 'expenses.xlsx', 'application/octet-stream', fixture('expenses.xlsx'))
    save(db, 'msg-1', 'orders.csv', 'text/csv', fixture('orders.csv'))
    save(db, 'msg-2', 'note.txt', 'text/plain', fixture('note.txt'))
    save(db, 'msg-2', 'schedule.html', 'text/html', fixture('schedule.html'))
    const rows = await extractAll(db)
    expect([...rows.values()].every((r) => r.status === 'done')).toBe(true)

    const docx = rows.get('agreement.docx')!
    expect(docx.via).toBe('docx')
    expect(docx.text).toContain('Rental Agreement')
    expect(docx.facts.documentType).toBe('contract')
    expect(docx.facts.amounts).toEqual(['$1,250.00'])
    expect(docx.facts.dates).toEqual(['2026-10-15'])
    expect(docx.summary!.startsWith('Contract — $1,250.00 by Oct 15')).toBe(true)

    const xlsx = rows.get('expenses.xlsx')!
    expect(xlsx.via).toBe('xlsx')
    expect(xlsx.text).toContain('## Sheet: Expenses\nItem\tDate\tAmount\tTotal\nPlumber\t2026-09-30\t450\t450\nPaint\t2026-09-12\t62.5\t62.5')
    expect(xlsx.text).toContain('## Sheet: Notes\nRich\tHello world')
    expect(xlsx.text).toContain('(showing first 200 of 251 rows)')
    expect(xlsx.text).not.toContain('\n201\n')
    expect(xlsx.summary).toBe('Spreadsheet: 3 sheets, 255 rows — totals column present')

    const csv = rows.get('orders.csv')!
    expect(csv.via).toBe('csv')
    expect(csv.text).toContain('1001,2026-09-01,$20.00,$20.00')
    expect(csv.summary).toBe('Table: 3 rows — columns: Order, Date, Amount, Total')
    expect(csv.facts.amounts).toEqual(['$20.00', '$35.50', '$55.50'])

    const txt = rows.get('note.txt')!
    expect(txt.via).toBe('text')
    expect(txt.facts.documentType).toBe('letter')
    expect(txt.facts.dates).toEqual(['2026-09-15'])
    expect(txt.facts.amounts).toEqual(['$40'])
    expect(txt.facts.people).toEqual(['Chad'])
    expect(txt.summary!.startsWith('Letter for Chad — $40 on Sep 15')).toBe(true)

    const html = rows.get('schedule.html')!
    expect(html.via).toBe('html')
    expect(html.text).toContain('Soccer schedule')
    expect(html.text).not.toContain('alert')
    expect(html.text).not.toContain('color:red')
    expect(html.facts.dates).toEqual(['2026-09-12', '2026-09-19'])
    expect(html.facts.documentType).toBe('schedule')

    // Findings group by message and only include done rows.
    const findings = findingsFor(db, ['msg-1', 'msg-2', 'msg-none'])
    expect([...findings.keys()].sort()).toEqual(['msg-1', 'msg-2'])
    expect(findings.get('msg-1')!.map((f) => f.filename)).toEqual(['agreement.docx', 'expenses.xlsx', 'orders.csv'])
    expect(findings.get('msg-2')!.map((f) => f.filename)).toEqual(['note.txt', 'schedule.html'])
  })

  it('caps text at 60 000 chars and excerpts at 1 200, and marks damaged files failed without stopping the batch', async () => {
    const db = openDatabase(':memory:')
    const long = new TextEncoder().encode('word '.repeat(15_000)) // 75 000 chars
    save(db, 'msg-1', 'long.txt', 'text/plain', long)
    save(db, 'msg-1', 'broken.pdf', 'application/pdf', new TextEncoder().encode('this is not a pdf at all'))
    save(db, 'msg-1', 'broken.docx', 'application/octet-stream', new Uint8Array([1, 2, 3, 4]))
    save(db, 'msg-1', 'fine.txt', 'text/plain', new TextEncoder().encode('Fine.'))
    const result = await extractPending(db, { ocr: false })
    expect(result.done).toBe(2)
    expect(result.failed).toBe(2)
    const rows = attachmentsFor(db, 'msg-1')
    const byName = Object.fromEntries(rows.map((r) => [r.filename, r]))
    expect(byName['long.txt'].text).toHaveLength(60_000)
    expect(attachmentText(db, byName['long.txt'].id)).toHaveLength(60_000)
    expect(attachmentText(db, byName['long.txt'].id, 10)).toBe('word word ')
    expect(attachmentText(db, 'nope')).toBeNull()
    const finding = result.findings.find((f) => f.filename === 'long.txt')!
    expect(finding.excerpt.length).toBeLessThanOrEqual(1_200)
    expect(finding.excerpt.endsWith('…')).toBe(true)
    expect(byName['broken.pdf'].status).toBe('failed')
    expect(byName['broken.pdf'].error).toBeTruthy()
    expect(byName['broken.pdf'].error).not.toMatch(/\n/)
    expect(byName['broken.docx'].status).toBe('failed')
    expect(byName['fine.txt'].status).toBe('done')
    expect(attachmentText(db, byName['broken.pdf'].id)).toBeNull()
    // Failed rows never become findings.
    expect(findingsFor(db, ['msg-1']).get('msg-1')!.map((f) => f.filename).sort()).toEqual(['fine.txt', 'long.txt'])
  })

  it('processes newest first and honours the limit and the time budget', async () => {
    const db = openDatabase(':memory:')
    const a = save(db, 'msg-1', 'a.txt', 'text/plain', new TextEncoder().encode('A'))
    db.prepare('UPDATE attachments SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', a.id)
    const b = save(db, 'msg-2', 'b.txt', 'text/plain', new TextEncoder().encode('B'))
    db.prepare('UPDATE attachments SET created_at = ? WHERE id = ?').run('2026-02-01T00:00:00.000Z', b.id)
    const none = await extractPending(db, { ocr: false, timeBudgetMs: 0 })
    expect(none).toEqual({ done: 0, failed: 0, findings: [] })
    const one = await extractPending(db, { ocr: false, limit: 1 })
    expect(one.done).toBe(1)
    expect(one.findings[0].messageId).toBe('msg-2')
    expect(attachmentsFor(db, 'msg-1')[0].status).toBe('pending')
    const rest = await extractPending(db, { ocr: false })
    expect(rest.done).toBe(1)
    expect(rest.findings[0].messageId).toBe('msg-1')
    expect(await extractPending(db, { ocr: false })).toEqual({ done: 0, failed: 0, findings: [] })
  })

  it('fails a row whose file was not kept, and reports plainly when there is no image reader', async () => {
    const db = openDatabase(':memory:')
    const row = save(db, 'msg-1', 'gone.txt', 'text/plain', new TextEncoder().encode('gone'))
    rmSync(row.path!)
    save(db, 'msg-1', 'photo.png', 'image/png', fixture('ocr.png'))
    const log: string[] = []
    const result = await extractPending(db, { ocr: false, log: (level, area, message) => log.push(`${level} ${area} ${message}`) })
    expect(result.failed).toBe(2)
    const [gone, photo] = attachmentsFor(db, 'msg-1')
    expect(gone.status).toBe('failed')
    expect(gone.error).toMatch(/no such file|not kept/i)
    expect(photo.status).toBe('failed')
    expect(photo.error).toBe('No image reader: connect an AI helper that can see images or turn on the offline reader')
    expect(log.some((l) => l.startsWith('warn attachments Could not read photo.png'))).toBe(true)
  })

  it('sends images to the AI helper when one can see, with the offline reader as the fallback', async () => {
    const db = openDatabase(':memory:')
    save(db, 'msg-1', 'card.png', 'image/png', fixture('ocr.png'))
    const calls: { contentType: string; hint: string; bytes: number }[] = []
    const vision = async (image: Uint8Array, contentType: string, hint: string): Promise<{ summary: string; text: string }> => {
      calls.push({ contentType, hint, bytes: image.byteLength })
      return { summary: 'A dentist reminder card for Tuesday at 2pm, total $450.00.', text: 'Dentist Tuesday 2pm\nTotal $450.00' }
    }
    const result = await extractPending(db, { vision, ocr: false })
    expect(result.done).toBe(1)
    expect(calls).toEqual([{ contentType: 'image/png', hint: expect.stringContaining('card.png'), bytes: fixture('ocr.png').byteLength }])
    const [a] = attachmentsFor(db, 'msg-1')
    expect(a.via).toBe('vision')
    expect(a.summary).toBe('A dentist reminder card for Tuesday at 2pm, total $450.00.')
    expect(a.text).toBe('Dentist Tuesday 2pm\nTotal $450.00')
    expect(a.facts.amounts).toEqual(['$450.00'])
    expect(a.facts.documentType).toBe('photo')

    // A helper that fails falls back; with OCR off that is a plain failure.
    save(db, 'msg-2', 'card2.png', 'image/png', fixture('ocr.png'))
    const broken = async (): Promise<{ summary: string; text: string }> => {
      throw new Error('model refused')
    }
    const r2 = await extractPending(db, { vision: broken, ocr: false })
    expect(r2.failed).toBe(1)
    expect(attachmentsFor(db, 'msg-2')[0].error).toBe('AI helper could not read this image and the offline reader is off')
  })

  it('reads the text in a photo with the offline reader (tesseract.js, no network)', async (ctx) => {
    if (!ocrAvailable()) {
      console.warn('OCR test skipped: tesseract.js, tesseract.js-core, or @tesseract.js-data/eng not found in node_modules')
      return ctx.skip()
    }
    const paths = resolveOcrPaths(join(userData, 'ocr-cache'))!
    expect(existsSync(paths.workerPath)).toBe(true)
    expect(existsSync(join(paths.langPath, 'eng.traineddata.gz'))).toBe(true)
    let text: string
    try {
      text = await ocrImage(fixture('ocr.png'), { cachePath: paths.cachePath })
    } catch (err) {
      if (OCR_START_RE.test(String(err))) {
        console.warn(`OCR test skipped: ${String(err)}`)
        return ctx.skip()
      }
      throw err
    }
    expect(text.toLowerCase()).toContain('dentist')
    expect(text).toContain('$450.00')
    expect(existsSync(join(paths.cachePath, 'eng.traineddata'))).toBe(true)

    // The whole path through extractPending: OCR via, photo summary, facts from the recognised text.
    const db = openDatabase(':memory:')
    save(db, 'msg-1', 'IMG_2201.png', 'image/png', fixture('ocr.png'))
    const result = await extractPending(db, { ocr: true })
    expect(result.done).toBe(1)
    const [a] = attachmentsFor(db, 'msg-1')
    expect(a.via).toBe('ocr')
    expect(a.text!.toLowerCase()).toContain('dentist')
    expect(a.summary!.startsWith("Photo with text: 'Dentist")).toBe(true)
    expect(a.facts.amounts).toEqual(['$450.00'])
    expect(a.facts.documentType).toBe('photo')

    // Oversize images are refused up front.
    await expect(ocrImage(new Uint8Array(10 * 1024 * 1024 + 1), { cachePath: paths.cachePath })).rejects.toThrow(/over 10 MB/)
  }, 120_000)

  it('extractOne never throws for garbage and unknown types', async () => {
    expect(await extractOne({ filename: 'x.heic', contentType: 'image/heic', bytes: new Uint8Array([1]) }, { ocr: false })).toMatchObject({ status: 'failed', error: 'This kind of file is not read' })
    expect(await extractOne({ filename: 'x.xlsx', contentType: '', bytes: new Uint8Array([1, 2]) }, { ocr: false })).toMatchObject({ status: 'failed', via: 'xlsx' })
    expect(await extractOne({ filename: 'x.txt', contentType: '', bytes: new Uint8Array(0) }, { ocr: false })).toMatchObject({ status: 'failed', error: 'The file is empty' })
    const slow = new Promise<{ summary: string; text: string }>(() => {})
    const timed = await extractOne({ filename: 'x.png', contentType: 'image/png', bytes: fixture('ocr.png') }, { vision: () => slow, ocr: false, timeoutMs: 50 })
    expect(timed.status).toBe('failed')
    expect(timed.error).toMatch(/took longer than/)
  })
})

describe('search, storage, cleanup', () => {
  /** Three done rows; `p` keeps each test's message folders apart on disk. */
  async function seeded(p: string): Promise<DB> {
    const db = openDatabase(':memory:')
    save(db, `${p}-1`, 'invoice.pdf', 'application/pdf', fixture('invoice.pdf'))
    save(db, `${p}-2`, 'agreement.docx', 'application/octet-stream', fixture('agreement.docx'))
    save(db, `${p}-3`, 'note.txt', 'text/plain', fixture('note.txt'))
    await extractPending(db, { ocr: false })
    return db
  }

  it('finds attachments by words in their text or name, safely, with a snippet', async () => {
    const db = await seeded('search')
    const hits = searchAttachments(db, 'plumbing')
    expect(hits).toHaveLength(1)
    expect(hits[0].attachment.filename).toBe('invoice.pdf')
    expect(hits[0].snippet).toContain('Plumbing')
    expect(searchAttachments(db, "Jane's agreement?").map((h) => h.attachment.filename)).toEqual(['agreement.docx'])
    expect(searchAttachments(db, '"note" AND (txt)').map((h) => h.attachment.filename)).toEqual(['note.txt'])
    // "plumbing dentist": nothing has both, so the OR retry finds both.
    expect(searchAttachments(db, 'plumbing dentist').map((h) => h.attachment.filename).sort()).toEqual(['invoice.pdf', 'note.txt'])
    expect(searchAttachments(db, '🙂')).toEqual([])
    expect(searchAttachments(db, '')).toEqual([])
    expect(searchAttachments(db, 'zeppelin')).toEqual([])
    expect(searchAttachments(db, 'chad', 1)).toHaveLength(1)
    // Pending rows (no text yet) are still found by file name.
    save(db, 'msg-4', 'tax-return-2025.pdf', 'application/pdf', fixture('invoice.pdf'))
    expect(searchAttachments(db, 'tax return').map((h) => h.attachment.messageId)).toEqual(['msg-4'])
  })

  it('reports storage and deletes old files while keeping rows and text', async () => {
    const db = await seeded('clean')
    const before = storageStats(db, userData)
    const rows = ['clean-1', 'clean-2', 'clean-3'].map((m) => attachmentsFor(db, m)[0])
    expect(before.files).toBeGreaterThanOrEqual(3)
    expect(before.bytes).toBeGreaterThanOrEqual(rows.reduce((n, r) => n + r.size, 0))
    expect(before.oldestAt).toBe(rows.map((r) => r.createdAt).sort()[0])

    // Age the invoice by 100 days; a 90-day cleanup removes only it.
    db.prepare('UPDATE attachments SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 100 * 86400000).toISOString(), rows[0].id)
    const invoiceBytes = statSync(rows[0].path!).size
    expect(cleanupFiles(db, userData, 90)).toEqual({ removed: 1, bytes: invoiceBytes })
    expect(existsSync(rows[0].path!)).toBe(false)
    expect(existsSync(join(userData, 'attachments', 'clean-1'))).toBe(false)
    const after = attachmentsFor(db, 'clean-1')[0]
    expect(after.path).toBeNull()
    expect(after.text).toContain('Acme Plumbing')
    expect(after.summary).toBe(rows[0].summary)
    expect(after.status).toBe('done')
    expect(existsSync(rows[1].path!)).toBe(true)
    const stats = storageStats(db, userData)
    expect(stats.files).toBe(before.files - 1)
    expect(stats.bytes).toBe(before.bytes - invoiceBytes)
    // Running again frees nothing; a zero-day cleanup removes the rest.
    expect(cleanupFiles(db, userData, 90)).toEqual({ removed: 0, bytes: 0 })
    const rest = cleanupFiles(db, userData, 0)
    expect(rest.removed).toBe(2)
    expect(attachmentsFor(db, 'clean-2')[0].path).toBeNull()
    expect(searchAttachments(db, 'plumbing')).toHaveLength(1)
  })

  it('leaves files outside userData/attachments alone', async () => {
    const db = openDatabase(':memory:')
    const row = save(db, 'msg-1', 'a.txt', 'text/plain', new TextEncoder().encode('A'))
    const outside = join(userData, 'elsewhere.txt')
    db.prepare('UPDATE attachments SET path = ?, created_at = ? WHERE id = ?').run(outside, '2020-01-01T00:00:00.000Z', row.id)
    expect(storageStats(db, userData)).toEqual({ files: 0, bytes: 0, oldestAt: null })
    expect(cleanupFiles(db, userData, 1)).toEqual({ removed: 0, bytes: 0 })
    expect(attachmentsFor(db, 'msg-1')[0].path).toBeNull()
  })
})
