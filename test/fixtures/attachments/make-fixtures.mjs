// Regenerates the attachment fixtures next to this file. Run from the repo root: node test/fixtures/attachments/make-fixtures.mjs
// The PDF is hand-built (uncompressed content stream, so pdf-parse finds a text layer); the .docx is a minimal
// WordprocessingML package via jszip; the .xlsx comes from exceljs. ocr.png is rendered by headless Chromium when
// one is available (set CHROME to its path); otherwise the existing PNG is kept.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const ExcelJS = require('exceljs')

/** A minimal PDF: one page per entry, Helvetica 14pt lines, no compression. */
export function buildPdf(pages) {
  const objs = []
  const add = (s) => {
    objs.push(s)
    return objs.length
  }
  const catalog = add(null)
  const pagesObj = add(null)
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const kids = []
  for (const lines of pages) {
    const content = 'BT /F1 14 Tf 50 750 Td 18 TL ' + lines.map((l) => `(${l.replace(/([()\\])/g, '\\$1')}) Tj T*`).join(' ') + ' ET'
    const cs = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
    const p = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${cs} 0 R >>`)
    kids.push(`${p} 0 R`)
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

export async function buildDocx(paragraphs) {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  )
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const body = paragraphs.map((t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join('')
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`
  )
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export async function buildXlsx() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Expenses')
  ws.addRow(['Item', 'Date', 'Amount', 'Total'])
  ws.addRow(['Plumber', new Date(Date.UTC(2026, 8, 30)), 450, { formula: 'C2', result: 450 }])
  ws.addRow(['Paint', '2026-09-12', 62.5, 62.5])
  const ws2 = wb.addWorksheet('Notes')
  ws2.addRow(['Rich', { richText: [{ text: 'Hello ' }, { text: 'world' }] }])
  const ws3 = wb.addWorksheet('Big')
  ws3.addRow(['n'])
  for (let i = 1; i <= 250; i++) ws3.addRow([i])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME
  const base = '/opt/pw-browsers'
  if (!existsSync(base)) return null
  for (const d of readdirSync(base)) {
    if (!d.startsWith('chromium_headless_shell')) continue
    const p = join(base, d, 'chrome-linux', 'headless_shell')
    if (existsSync(p)) return p
  }
  return null
}

async function main() {
  writeFileSync(
    join(here, 'invoice.pdf'),
    buildPdf([
      ['INVOICE #1042', 'From: Acme Plumbing LLC', 'Bill to: Chad Cooper', 'Water heater replacement', 'Total due: $450.00', 'Due date: Sep 30, 2026'],
      ['Page 2 - Terms: payment within 30 days.']
    ])
  )
  writeFileSync(join(here, 'scanned.pdf'), buildPdf([[], [], []]))
  writeFileSync(
    join(here, 'agreement.docx'),
    await buildDocx(['Rental Agreement', 'This agreement is between Jane Doe and Chad Cooper.', 'Please sign and return by 10/15/2026.', 'Rent: $1,250.00 per month.'])
  )
  writeFileSync(join(here, 'expenses.xlsx'), await buildXlsx())
  writeFileSync(join(here, 'orders.csv'), 'Order,Date,Amount,Total\n1001,2026-09-01,$20.00,$20.00\n1002,2026-09-03,$35.50,$35.50\nTotal,,,$55.50\n')
  writeFileSync(join(here, 'note.txt'), 'Dentist appointment\nDear Chad,\nYour cleaning is on Tuesday 15 September 2026 at 2pm.\nCo-pay: $40\nSincerely,\nBright Smiles Dental\n')
  writeFileSync(
    join(here, 'schedule.html'),
    '<html><head><style>p{color:red}</style></head><body><h1>Soccer schedule</h1><p>Game 1 &mdash; Sat 9/12/2026 10:00 am</p><p>Game 2 &mdash; Sat 9/19/2026 10:00 am</p><script>alert(1)</script></body></html>'
  )
  const chrome = findChrome()
  if (chrome) {
    const html = join(here, 'ocr.html')
    writeFileSync(
      html,
      '<html><body style="margin:0;background:#fff;width:600px;height:200px"><div style="font:bold 44px Arial, Helvetica, sans-serif;color:#000;padding:30px">Dentist Tuesday 2pm<br>Total $450.00</div></body></html>'
    )
    execFileSync(chrome, ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=600,200', `--screenshot=${join(here, 'ocr.png')}`, `file://${html}`], { stdio: 'ignore' })
    console.log('rendered ocr.png with', chrome)
  } else {
    console.log('no headless Chromium found; kept the existing ocr.png')
  }
  console.log('fixtures written to', here)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
