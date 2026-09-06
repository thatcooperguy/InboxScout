import { describe, expect, it } from 'vitest'
import { detectDocumentType, extractAmounts, extractDates, extractFacts, extractPeople, extractPeopleDetailed, shortDate, summarize } from '../src/main/attachments/facts'
import { kindFor, plainError, readerFor } from '../src/main/attachments/extract'
import { safeFilename } from '../src/main/attachments/store'

const NOW = new Date('2026-09-06T12:00:00.000Z')

describe('attachment facts: amounts', () => {
  it('finds currency amounts in every common spelling, once each', () => {
    const text = 'Total due: $450.00\nSubtotal $ 400.00, tax $50.00\nTotal due: $450.00 again\nUSD 1,234.56 or 99 EUR or €45 or £12.50\nQuantity 3 at 4/5'
    expect(extractAmounts(text)).toEqual(['$450.00', '$400.00', '$50.00', 'USD 1,234.56', '99 EUR', '€45', '£12.50'])
  })

  it('ignores bare numbers and caps the list', () => {
    expect(extractAmounts('Invoice 1042 dated 2026-09-30, 3 items')).toEqual([])
    const many = Array.from({ length: 30 }, (_, i) => `$${i + 1}.00`).join(' ')
    expect(extractAmounts(many)).toHaveLength(10)
  })
})

describe('attachment facts: dates', () => {
  it('reads ISO, US, month-day, and day-month dates as YYYY-MM-DD in order of appearance', () => {
    const text = 'Issued 2026-09-01. Due 9/30/2026. Appointment Sep 15, 2026 and 30 September 2026. Also Oct 2 and 12th of November.'
    expect(extractDates(text, NOW)).toEqual(['2026-09-01', '2026-09-30', '2026-09-15', '2026-10-02', '2026-11-12'])
  })

  it('takes short US dates only after a cue word and rolls yearless dates forward', () => {
    expect(extractDates('ratio 3/4 is fine; due 9/30 for sure', NOW)).toEqual(['2026-09-30'])
    // Jan 5 is more than 30 days ago from Sep 2026, so it means next year.
    expect(extractDates('Renewal Jan 5', NOW)).toEqual(['2027-01-05'])
    expect(extractDates('Nothing here 13/45/2026 or 2026-13-40', NOW)).toEqual([])
  })
})

describe('attachment facts: people', () => {
  it('reads From/To/Bill to/Dear lines and cleans emails and trailing punctuation', () => {
    const text = 'INVOICE\nFrom: Acme Plumbing LLC <billing@acme.example>\nBill to: Chad Cooper,\n123 Main St\nDear Chad,\nAttn: Jane Doe (Accounts)\n'
    expect(extractPeopleDetailed(text)).toEqual([
      { role: 'from', name: 'Acme Plumbing LLC' },
      { role: 'to', name: 'Chad Cooper' },
      { role: 'to', name: 'Chad' },
      { role: 'to', name: 'Jane Doe' }
    ])
    expect(extractPeople(text)).toEqual(['Acme Plumbing LLC', 'Chad Cooper', 'Chad', 'Jane Doe'])
  })

  it('skips generic salutations and number-only lines', () => {
    expect(extractPeople('Dear Sir or Madam,\nTo whom it may concern\nTo: 555-0100\nFrom: 12345')).toEqual([])
  })
})

describe('attachment facts: document type', () => {
  it('uses the keyword table for documents and the file name for images', () => {
    expect(detectDocumentType('document', 'x.pdf', 'INVOICE #12\nAmount due: $5')).toBe('invoice')
    expect(detectDocumentType('document', 'x.pdf', 'Thank you for your purchase. Receipt #9. Paid.')).toBe('receipt')
    expect(detectDocumentType('document', 'x.pdf', 'Account summary. Statement period. Closing balance.')).toBe('statement')
    expect(detectDocumentType('document', 'x.docx', 'This agreement is between the parties. Signature:')).toBe('contract')
    expect(detectDocumentType('document', 'x.pdf', 'Please fill in this form. Date of birth:')).toBe('form')
    expect(detectDocumentType('document', 'x.pdf', 'Dear Chad, ... Sincerely, Jane')).toBe('letter')
    expect(detectDocumentType('document', 'x.pdf', 'Itinerary: 10:00 am depart, 2:30 pm arrive')).toBe('schedule')
    expect(detectDocumentType('document', 'x.pdf', 'Boarding pass. Seat 12A. Gate B4.')).toBe('ticket')
    expect(detectDocumentType('document', 'x.pdf', 'Prescription: amoxicillin 500 mg. Refills: 2. Pharmacy:')).toBe('prescription')
    expect(detectDocumentType('document', 'x.pdf', 'Lab report. Findings and results.')).toBe('report')
    expect(detectDocumentType('document', 'invoice-march.pdf', 'lorem ipsum')).toBe('invoice')
    expect(detectDocumentType('document', 'x.pdf', 'lorem ipsum')).toBeNull()
    expect(detectDocumentType('image', 'IMG_1234.jpg', '')).toBe('photo')
    expect(detectDocumentType('image', 'Screenshot 2026-09-06.png', '')).toBe('screenshot')
    expect(detectDocumentType('image', 'IMG_1.jpg', 'INVOICE amount due $5')).toBe('invoice')
    expect(detectDocumentType('other', 'x.heic', '')).toBeNull()
  })
})

describe('attachment summaries', () => {
  it('writes the invoice template from facts', () => {
    const text = 'INVOICE #1042\nFrom: Acme\nBill to: Chad Cooper\nTotal due: $450.00\nDue date: Sep 30, 2026'
    const facts = extractFacts('document', 'invoice.pdf', text, NOW)
    expect(facts).toEqual({ amounts: ['$450.00'], dates: ['2026-09-30'], people: ['Acme', 'Chad Cooper'], documentType: 'invoice' })
    expect(summarize('document', 'invoice.pdf', text, facts, { pages: 1 }, NOW)).toBe('Invoice from Acme — $450.00 due Sep 30')
  })

  it('picks the amount next to "total" and the date next to "due", and adds the year when it is not this year', () => {
    const text = 'Statement\nPrevious balance $12.00\nPayment received $12.00\nTotal amount due $89.10\nStatement date 2026-09-01\nPayment due 2027-01-15'
    const facts = extractFacts('document', 's.pdf', text, NOW)
    expect(summarize('document', 's.pdf', text, facts, {}, NOW)).toBe('Statement — $89.10 due Jan 15, 2027')
    expect(shortDate('2026-09-30', NOW)).toBe('Sep 30')
    expect(shortDate('2027-01-15', NOW)).toBe('Jan 15, 2027')
  })

  it('describes photos, screenshots, spreadsheets, tables, and plain documents', () => {
    const photoText = 'Dentist Tue 2pm\nTotal $450.00'
    const pf = extractFacts('image', 'IMG_7.jpg', photoText, NOW)
    expect(pf.documentType).toBe('photo')
    expect(summarize('image', 'IMG_7.jpg', photoText, pf, {}, NOW)).toBe("Photo with text: 'Dentist Tue 2pm Total $450.00' — $450.00")
    expect(summarize('image', 'Screenshot.png', 'Meeting moved to Sep 12', extractFacts('image', 'Screenshot.png', 'Meeting moved to Sep 12', NOW), {}, NOW)).toBe(
      "Screenshot with text: 'Meeting moved to Sep 12' — Sep 12"
    )
    expect(summarize('image', 'IMG_8.jpg', '', extractFacts('image', 'IMG_8.jpg', '', NOW), {}, NOW)).toBe('Photo — no readable text.')
    const long = 'word '.repeat(50)
    const clipped = summarize('image', 'a.png', long, extractFacts('image', 'a.png', long, NOW), {}, NOW)
    expect(clipped).toMatch(/^Photo with text: 'word( word)+…'$/)
    expect(clipped.length).toBeLessThan(100)

    const sheetFacts = extractFacts('document', 'x.xlsx', 'Item\tTotal', NOW)
    expect(summarize('document', 'x.xlsx', 'Item\tTotal', sheetFacts, { sheets: 3, rows: 120, hasTotals: true }, NOW)).toBe('Spreadsheet: 3 sheets, 120 rows — totals column present')
    expect(summarize('document', 'x.xlsx', 'a', sheetFacts, { sheets: 1, rows: 1, hasTotals: false }, NOW)).toBe('Spreadsheet: 1 sheet, 1 row — no totals column')
    expect(summarize('document', 'x.csv', 'a,b', sheetFacts, { rows: 40, columns: ['Order', 'Date', 'Amount', 'Total', 'Note', 'Extra'] }, NOW)).toBe(
      'Table: 40 rows — columns: Order, Date, Amount, Total, Note'
    )

    const plain = 'Meeting notes from Tuesday\nWe agreed to paint the fence.'
    expect(summarize('document', 'notes.txt', plain, extractFacts('document', 'notes.txt', plain, NOW), {}, NOW)).toBe("Document: 'Meeting notes from Tuesday'")
    expect(summarize('document', 'empty.txt', '   ', extractFacts('document', 'empty.txt', '   ', NOW), {}, NOW)).toBe('Document "empty.txt" — no readable text.')
    const letter = 'Dear Chad,\nYour appointment is on 15 September 2026.\nSincerely,\nBright Smiles'
    expect(summarize('document', 'l.txt', letter, extractFacts('document', 'l.txt', letter, NOW), {}, NOW)).toBe('Letter for Chad — on Sep 15')
  })
})

describe('attachment readers and file names', () => {
  it('maps extensions first, then content types; HEIC and unknown types are "other"', () => {
    expect(readerFor('a.PDF', 'application/octet-stream')).toBe('pdf')
    expect(readerFor('report', 'application/pdf')).toBe('pdf')
    expect(readerFor('a.docx', '')).toBe('docx')
    expect(readerFor('a.xlsm', '')).toBe('xlsx')
    expect(readerFor('a.tsv', '')).toBe('csv')
    expect(readerFor('a.eml', '')).toBe('text')
    expect(readerFor('a.htm', '')).toBe('html')
    expect(readerFor('IMG.JPG', '')).toBe('image')
    expect(readerFor('photo', 'image/webp; charset=binary')).toBe('image')
    expect(readerFor('a.heic', 'image/heic')).toBeNull()
    expect(readerFor('a.zip', 'application/zip')).toBeNull()
    expect(readerFor('a.doc', 'application/msword')).toBeNull()
    expect(kindFor('a.pdf', '')).toBe('document')
    expect(kindFor('a.png', '')).toBe('image')
    expect(kindFor('a.heic', '')).toBe('other')
  })

  it('makes file names safe without losing the extension', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd')
    expect(safeFilename('C:\\Users\\x\\bill.pdf')).toBe('bill.pdf')
    expect(safeFilename('  my <invoice>: "sept"?.pdf ')).toBe('my invoice sept.pdf')
    expect(safeFilename('...hidden')).toBe('hidden')
    expect(safeFilename('')).toBe('attachment')
    expect(safeFilename('con.txt')).toBe('_con.txt')
    expect(safeFilename('x'.repeat(200) + '.docx')).toHaveLength(120)
    expect(safeFilename('x'.repeat(200) + '.docx').endsWith('.docx')).toBe(true)
  })

  it('turns errors into one plain line', () => {
    expect(plainError(new Error('bad\nthing   here'))).toBe('bad thing here')
    expect(plainError('text')).toBe('text')
    expect(plainError(undefined)).toBe('unknown error')
    expect(plainError(new Error('x'.repeat(500)))).toHaveLength(200)
  })
})
