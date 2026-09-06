import { simpleParser } from 'mailparser'
import { describe, expect, it } from 'vitest'
import { attachmentsFromParsed } from '../src/main/mail/imap'
import { SyncBudget } from '../src/main/mail/attachmentsPolicy'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A fake PNG of exactly `size` bytes: the real magic number followed by filler. */
function fakePng(size: number): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.alloc(size - PNG_MAGIC.length, 0x42)])
}

function base64Lines(buf: Buffer): string {
  return buf.toString('base64').replace(/(.{76})/g, '$1\r\n')
}

const smallLogo = fakePng(1_500) // < 20 KB inline → dropped
const bigPhoto = fakePng(30 * 1024) // 30 KB attached → kept
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'utf8')

const mime = [
  'From: Acme Billing <billing@acme.com>',
  'To: me@example.com',
  'Subject: Your invoice',
  'Message-ID: <inv-1@acme.com>',
  'Date: Sat, 06 Sep 2026 10:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="outer"',
  '',
  '--outer',
  'Content-Type: multipart/related; boundary="inner"',
  '',
  '--inner',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Invoice attached. <img src="cid:logo@acme"></p>',
  '--inner',
  'Content-Type: image/png; name="logo.png"',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <logo@acme>',
  'Content-Disposition: inline; filename="logo.png"',
  '',
  base64Lines(smallLogo),
  '--inner--',
  '--outer',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Disposition: attachment; filename="notes.txt"',
  '',
  'Just a note.',
  '--outer',
  'Content-Type: image/png; name="scan.png"',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="scan.png"',
  '',
  base64Lines(bigPhoto),
  '--outer',
  'Content-Type: application/pdf; name="invoice.pdf"',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="invoice.pdf"',
  '',
  base64Lines(pdf),
  '--outer--',
  ''
].join('\r\n')

describe('attachmentsFromParsed (IMAP)', () => {
  it('keeps the attached PNG, the PDF, and the text part; drops the small inline logo', async () => {
    const parsed = await simpleParser(mime)
    expect(parsed.attachments.map((a) => a.filename)).toEqual(['logo.png', 'notes.txt', 'scan.png', 'invoice.pdf'])
    const out = attachmentsFromParsed(parsed)
    expect(out.map((a) => a.filename)).toEqual(['notes.txt', 'scan.png', 'invoice.pdf'])

    const scan = out.find((a) => a.filename === 'scan.png')!
    expect(scan.contentType).toBe('image/png')
    expect(scan.size).toBe(30 * 1024)
    expect(scan.data).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(scan.data).equals(bigPhoto)).toBe(true)
    expect(scan.inline).toBeUndefined()

    const inv = out.find((a) => a.filename === 'invoice.pdf')!
    expect(inv.contentType).toBe('application/pdf')
    expect(Buffer.from(inv.data).toString('utf8')).toContain('%PDF-1.4')

    const note = out.find((a) => a.filename === 'notes.txt')!
    expect(note.contentType).toBe('text/plain')
    expect(Buffer.from(note.data).toString('utf8')).toBe('Just a note.')
  })

  it('marks Content-Disposition: inline / cid-related parts as inline and keeps them when large enough', async () => {
    const big = fakePng(25 * 1024)
    const related = [
      'From: a@b.c',
      'Subject: photo inline',
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="r"',
      '',
      '--r',
      'Content-Type: text/html',
      '',
      '<img src="cid:pic@b.c">',
      '--r',
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <pic@b.c>',
      'Content-Disposition: inline; filename="pic.png"',
      '',
      base64Lines(big),
      '--r--',
      ''
    ].join('\r\n')
    const parsed = await simpleParser(related)
    const out = attachmentsFromParsed(parsed)
    expect(out).toHaveLength(1)
    expect(out[0].inline).toBe(true)
    expect(out[0].filename).toBe('pic.png')
    expect(out[0].size).toBe(25 * 1024)
  })

  it('respects the per-message and per-sync budgets', async () => {
    const parsed = await simpleParser(mime)
    // Room for notes.txt (12 B) + scan.png (30 KB) and 20 spare bytes: invoice.pdf (~50 B) no longer fits.
    const limit = 30 * 1024 + 12 + 20
    const sync = new SyncBudget(2 * limit, limit)
    const first = attachmentsFromParsed(parsed, sync)
    expect(first.map((a) => a.filename)).toEqual(['notes.txt', 'scan.png'])
    expect(sync.usedBytes).toBe(30 * 1024 + 12)
    // A second message gets a fresh per-message cap and the same result...
    const second = attachmentsFromParsed(parsed, sync)
    expect(second.map((a) => a.filename)).toEqual(['notes.txt', 'scan.png'])
    // ...but by the third the sync total has only 16 bytes left: the note fits, the scan and the PDF do not.
    const third = attachmentsFromParsed(parsed, sync)
    expect(third.map((a) => a.filename)).toEqual(['notes.txt'])
  })

  it('returns [] for a message without attachments and never throws on odd parts', async () => {
    const parsed = await simpleParser('From: a@b.c\r\nSubject: hi\r\n\r\nplain body\r\n')
    expect(attachmentsFromParsed(parsed)).toEqual([])
    expect(attachmentsFromParsed({ attachments: [{ content: 'not a buffer' } as any] })).toEqual([])
    expect(attachmentsFromParsed({ attachments: undefined as any })).toEqual([])
  })

  it('names unnamed parts from their media type', () => {
    const out = attachmentsFromParsed({
      attachments: [{ content: Buffer.alloc(50, 1), contentType: 'image/jpeg', contentDisposition: 'attachment', related: false } as any]
    })
    expect(out).toHaveLength(1)
    expect(out[0].filename).toBe('attachment-1.jpg')
  })
})
