import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import {
  ATTACHMENT_CONTEXT_MAX,
  attachmentContext,
  attachmentNotes,
  attachmentSource,
  buildVision,
  findAttachment,
  ingestAttachments,
  publicAttachment,
  readNewAttachments,
  recentMessageIdsWithAttachments,
  supportsVision,
  type AttachmentStore
} from '../src/main/pipeline/attachments'
import { ATTACHMENTS_PROMPT_LINE, buildClassificationPrompt } from '../src/main/ai/classify'
import { attachmentSignals, buildBasicBrief, classifyMessageHeuristically, deriveIssues, withAttachmentSources } from '../src/main/ai/builtin'
import { buildBriefPrompt, type BriefInputs } from '../src/main/ai/brief'
import { PROFILES } from '../src/main/profiles/profiles'
import type { AttachmentFinding, StoredAttachment } from '../src/main/attachments/types'
import type { Classification, MessageRecord } from '../src/shared/types'
import * as store from '../src/main/attachments/index'

/**
 * Reads attachments and photos (v1.5), the pipeline side: what the store finds reaches the classifier prompt
 * and the built-in engine, and an issue built from it says "from the attached invoice.pdf".
 */

const msg = (o: Partial<MessageRecord> & { id: string }): MessageRecord => ({
  accountId: 'acc-1',
  folder: 'INBOX',
  uid: 1,
  messageId: `<${o.id}@x>`,
  threadKey: o.id,
  fromAddress: 'billing@acme.com',
  fromName: 'Acme Billing',
  toAddresses: 'me@example.com',
  subject: 'Your September invoice',
  date: '2026-09-05T09:00:00.000Z',
  snippet: 'Please see the attached invoice.',
  bodyText: 'Hi,\n\nPlease see the attached invoice.\n\nThanks,\nAcme',
  fromMe: false,
  listUnsubscribe: null,
  hasAttachments: true,
  ...o
})

const finding = (o: Partial<AttachmentFinding> = {}): AttachmentFinding => ({
  attachmentId: 'att-1',
  messageId: 'm-1',
  filename: 'invoice.pdf',
  kind: 'document',
  summary: 'Invoice from Acme — $450.00 due Sep 30',
  facts: { amounts: ['$450.00'], dates: ['Sep 30'], people: ['Acme Corp'], documentType: 'invoice' },
  excerpt: 'INVOICE #1042\nBill to: Ann Example\nAmount due: $450.00\nDue date: Sep 30, 2026\nThank you for your business.',
  ...o
})

const stored = (o: Partial<StoredAttachment> = {}): StoredAttachment => ({
  id: 'att-1',
  messageId: 'm-1',
  accountId: 'acc-1',
  filename: 'invoice.pdf',
  contentType: 'application/pdf',
  size: 1234,
  kind: 'document',
  path: '/data/attachments/m-1/invoice.pdf',
  text: 'INVOICE #1042 Amount due: $450.00',
  summary: 'Invoice from Acme — $450.00 due Sep 30',
  facts: { amounts: ['$450.00'], dates: ['Sep 30'], people: [], documentType: 'invoice' },
  status: 'done',
  via: 'pdf',
  error: null,
  createdAt: '2026-09-05T09:00:00.000Z',
  extractedAt: '2026-09-05T09:00:05.000Z',
  ...o
})

/** A store that never touches disk: records saves, answers extraction with the given findings. */
function fakeStore(findings: AttachmentFinding[], opts: { fail?: boolean } = {}): AttachmentStore & { saved: string[] } {
  const saved: string[] = []
  return {
    saved,
    saveIncoming: (_db, _dir, input) => {
      saved.push(`${input.messageId}:${input.filename}`)
      return stored({ id: `att-${saved.length}`, messageId: input.messageId, filename: input.filename, status: input.size > 10 * 1024 * 1024 ? 'skipped' : 'pending' })
    },
    extractPending: async () => {
      if (opts.fail) throw new Error('reader crashed')
      return { done: findings.length, failed: 0, findings }
    },
    findingsFor: (_db, ids) => {
      const map = new Map<string, AttachmentFinding[]>()
      for (const f of findings) if (ids.includes(f.messageId)) map.set(f.messageId, [...(map.get(f.messageId) ?? []), f])
      return map
    },
    attachmentsFor: () => [stored()]
  }
}

describe('attachment context for the engines', () => {
  it('turns findings into a plain-text block with the file name, facts, and excerpt', () => {
    const text = attachmentContext([finding()])
    expect(text).toContain('invoice.pdf (invoice): Invoice from Acme — $450.00 due Sep 30')
    expect(text).toContain('Amounts: $450.00')
    expect(text).toContain('Dates: Sep 30')
    expect(text).toContain('Text: INVOICE #1042 Bill to: Ann Example Amount due: $450.00')
    expect(attachmentContext([])).toBe('')
  })

  it('caps the block so a folder of spreadsheets cannot flood the prompt', () => {
    const many = Array.from({ length: 12 }, (_, i) => finding({ attachmentId: `a${i}`, filename: `sheet-${i}.xlsx`, excerpt: 'x'.repeat(1200) }))
    expect(attachmentContext(many).length).toBeLessThanOrEqual(ATTACHMENT_CONTEXT_MAX)
  })

  it('names the files for the brief', () => {
    expect(attachmentSource(['invoice.pdf'])).toBe('from the attached invoice.pdf')
    expect(attachmentSource(['a.pdf', 'b.pdf', 'a.pdf'])).toBe('from the attached a.pdf, b.pdf')
    expect(attachmentSource(['1', '2', '3', '4', '5'])).toBe('from the attached 1, 2, 3 and 2 more')
    expect(attachmentSource([])).toBe('')
  })

  it('collects findings per message and survives a broken reader', async () => {
    const db = openDatabase(':memory:')
    const good = await readNewAttachments(db, fakeStore([finding(), finding({ attachmentId: 'att-2', messageId: 'm-2', filename: 'photo.jpg', kind: 'image', summary: 'A photo of a water bill for $88.10' })]), { messageIds: ['m-1', 'm-2', 'm-3'] })
    expect(good.done).toBe(2)
    expect(good.context.get('m-1')).toContain('invoice.pdf')
    expect(good.context.get('m-2')).toContain('water bill')
    expect(good.context.has('m-3')).toBe(false)
    expect(good.files.get('m-1')).toEqual(['invoice.pdf'])
    const logs: string[] = []
    const broken = await readNewAttachments(db, fakeStore([finding()], { fail: true }), { messageIds: ['m-1'], log: (_l, _a, m) => void logs.push(m) })
    expect(broken.done).toBe(0)
    expect(broken.context.get('m-1')).toContain('invoice.pdf') // findings from earlier runs still count
    expect(logs.some((l) => /reading attachments failed/.test(l))).toBe(true)
    expect((await readNewAttachments(db, fakeStore([]), { messageIds: [] })).context.size).toBe(0)
  })

  it('saves every attachment the fetchers brought back, skipping empty ones', () => {
    const db = openDatabase(':memory:')
    const s = fakeStore([])
    const data = new Uint8Array([1, 2, 3])
    const n = ingestAttachments(db, '/data', { id: 'm-1', accountId: 'acc-1' }, [
      { filename: 'invoice.pdf', contentType: 'application/pdf', size: 3, data },
      { filename: 'empty.pdf', contentType: 'application/pdf', size: 0, data: new Uint8Array() },
      { filename: 'huge.zip', contentType: 'application/zip', size: 11 * 1024 * 1024, data }
    ], s)
    expect(s.saved).toEqual(['m-1:invoice.pdf', 'm-1:huge.zip'])
    expect(n).toBe(1) // the skipped one is not counted as saved
    expect(ingestAttachments(db, '/data', { id: 'm-2', accountId: 'acc-1' }, undefined, s)).toBe(0)
  })
})

describe('the classifier sees the attachment', () => {
  it('puts the excerpt and the explaining sentence into the prompt', () => {
    const m = { ...msg({ id: 'm-1' }), attachments: attachmentContext([finding()]) }
    const prompt = buildClassificationPrompt(PROFILES.general, [m, msg({ id: 'm-2', subject: 'Lunch?' })], [])
    expect(prompt).toContain(ATTACHMENTS_PROMPT_LINE)
    expect(prompt).toContain('the contents of files attached to this message — treat amounts, dates, and requests in them as part of the message')
    expect(prompt).toContain('Attachments (contents of the attached files): invoice.pdf (invoice)')
    expect(prompt).toContain('Amount due: $450.00')
    // Without any attachments the prompt is unchanged.
    const plain = buildClassificationPrompt(PROFILES.general, [msg({ id: 'm-2', subject: 'Lunch?' })], [])
    expect(plain).not.toContain(ATTACHMENTS_PROMPT_LINE)
    expect(plain).not.toContain('Attachments (')
  })
})

describe('the built-in engine reads the attachment', () => {
  it('finds the amount, the bill words, the due date, and private-document words', () => {
    const s = attachmentSignals(attachmentContext([finding()]))
    expect(s).toMatchObject({ amount: '$450.00', bill: true, deadline: 'Sep 30' })
    expect(attachmentSignals('W-2 wage and tax statement for Ann').sensitivity).toEqual(['personal_private'])
    expect(attachmentSignals('CONFIDENTIAL — do not distribute').sensitivity).toEqual(['company_confidential'])
    expect(attachmentSignals('Minutes of the garden club meeting')).toEqual({ amount: null, bill: false, deadline: null, sensitivity: [] })
    expect(attachmentSignals(undefined).bill).toBe(false)
  })

  it('a bland email with an invoice PDF becomes an actionable bill with the amount and due date', () => {
    const plain = classifyMessageHeuristically(msg({ id: 'm-0', subject: 'Hello', bodyText: 'See attached.' }), PROFILES.general)
    expect(plain.isActionable).toBe(false)
    const withFile = classifyMessageHeuristically({ ...msg({ id: 'm-1', subject: 'Hello', bodyText: 'See attached.' }), attachments: attachmentContext([finding()]) }, PROFILES.general)
    expect(withFile.importance).toBeGreaterThanOrEqual(2)
    expect(withFile.isActionable).toBe(true)
    expect(withFile.actionSummary).toContain('$450.00')
    expect(withFile.actionSummary).toContain('due Sep 30')
    expect(withFile.deadline).toBe('Sep 30')
    // …and the issue engine turns it into an open item carrying the amount.
    const classification: Classification = { ...withFile, messageId: 'm-1', category: 'work', runId: 'r', model: 'builtin/rules-v1', corrected: false }
    const issues = deriveIssues([], [{ message: msg({ id: 'm-1', subject: 'Hello' }), classification }], '2026-09-06T00:00:00.000Z', () => 'i-1')
    expect(issues).toHaveLength(1)
    expect(issues[0].ownerAction).toContain('$450.00')
    expect(issues[0].deadline).toBe('Sep 30')
  })

  it('a photographed W-2 flags the message as private; marketing PDFs change nothing', () => {
    const w2 = classifyMessageHeuristically(
      { ...msg({ id: 'm-2', fromAddress: 'mom@gmail.com', fromName: 'Mom', subject: 'Here you go', bodyText: 'Photo attached.' }), attachments: 'scan.jpg (photo): A photo of a W-2 wage and tax statement. Text: Social security wages 41,000.00' },
      PROFILES.general
    )
    expect(w2.sensitivity).toContain('personal_private')
    const ad = classifyMessageHeuristically(
      { ...msg({ id: 'm-3', fromAddress: 'promo@deals.com', subject: 'Flash sale', bodyText: 'Unsubscribe here' }), attachments: 'flyer.pdf (other): Invoice-style flyer. Amounts: $9.99. Text: pay only $9.99 today, due date none' },
      PROFILES.general
    )
    expect(ad.category).toBe('promotions_noise')
    expect(ad.isActionable).toBe(false)
    expect(ad.deadline).toBeNull()
  })
})

describe('the brief says where the facts came from', () => {
  const inputs = (notes: BriefInputs['attachmentNotes']): BriefInputs => ({
    profile: PROFILES.general,
    periodType: 'daily',
    projects: [],
    openIssues: [
      { id: 'i-1', title: 'Your September invoice', severity: 'high', state: 'emerging', ownerAction: 'Review — the attached file shows $450.00 due Sep 30', deadline: 'Sep 30', createdAt: 'a', updatedAt: 'a' },
      { id: 'i-2', title: 'Re: Roof repair', severity: 'medium', state: 'active', ownerAction: null, deadline: null, createdAt: 'a', updatedAt: 'a' }
    ],
    personalMessages: [],
    sensitiveMessages: [],
    deadlines: [],
    replies: { waitingOnYou: [], waitingOnThem: [] },
    skillSections: [],
    attachmentNotes: notes
  })

  it('built-in brief: sources and whyNow name the attached file for the matching issue only', () => {
    const files = new Map([['m-1', ['invoice.pdf']]])
    const notes = attachmentNotes([msg({ id: 'm-1' }), msg({ id: 'm-9', subject: 'Nothing attached' })], files)
    expect(notes).toEqual([{ messageId: 'm-1', subject: 'Your September invoice', filenames: ['invoice.pdf'] }])
    const brief = buildBasicBrief(inputs(notes))
    expect(brief.topIssues[0].sources).toEqual(['from the attached invoice.pdf'])
    expect(brief.topIssues[0].whyNow).toBe('Mentions Sep 30. From the attached invoice.pdf.')
    expect(brief.topIssues[1].sources).toEqual([])
    expect(buildBasicBrief(inputs(undefined)).topIssues[0].sources).toEqual([])
  })

  it('AI brief: the prompt lists the files and the safety net adds the source when the model forgot', () => {
    const notes = [{ messageId: 'm-1', subject: 'Re: Your September invoice', filenames: ['invoice.pdf'] }]
    expect(buildBriefPrompt(inputs(notes))).toContain('"Re: Your September invoice": invoice.pdf')
    expect(buildBriefPrompt(inputs(notes))).toContain('add "from the attached <file name>" to its sources')
    const fixed = withAttachmentSources([{ title: 'Your September invoice', whyNow: 'Due soon.', sources: ['1 email from Acme'] }], notes)
    expect(fixed[0].sources).toEqual(['1 email from Acme', 'from the attached invoice.pdf'])
    expect(fixed[0].whyNow).toBe('Due soon. From the attached invoice.pdf.')
    // The model already said so: nothing is doubled.
    const kept = withAttachmentSources([{ title: 'Your September invoice', whyNow: 'Due soon.', sources: ['from the attached invoice.pdf'] }], notes)
    expect(kept[0].sources).toHaveLength(1)
  })
})

describe('vision and what leaves the main process', () => {
  it('only providers that can see images get a vision function', () => {
    for (const p of ['gemini', 'openai', 'anthropic', 'xai', 'openrouter', 'custom']) expect(supportsVision(p)).toBe(true)
    for (const p of ['builtin', 'groq', 'mistral', 'deepseek', 'ollama', 'lmstudio']) expect(supportsVision(p)).toBe(false)
  })

  it('the vision function refuses every later call after one failure, so OCR takes over for the rest of the run', async () => {
    let calls = 0
    const logs: string[] = []
    const vision = buildVision({} as any, (_l, _a, m) => void logs.push(m), async () => {
      calls++
      if (calls === 1) throw new Error('429 Too Many Requests')
      return { summary: 'ok', text: 'ok' }
    })
    await expect(vision(new Uint8Array([1]), 'image/png', 'bill.png')).rejects.toThrow(/429/)
    await expect(vision(new Uint8Array([1]), 'image/png', 'bill.png')).rejects.toThrow(/vision unavailable this run/)
    expect(calls).toBe(1)
    expect(logs).toHaveLength(1)
    const fine = buildVision({} as any, undefined, async () => ({ summary: 'A bill', text: '$12' }))
    expect(await fine(new Uint8Array([1]), 'image/jpeg', '')).toEqual({ summary: 'A bill', text: '$12' })
  })

  it('publicAttachment drops the path and the text, keeps whether a file is still there', () => {
    const pub = publicAttachment(stored())
    expect(pub).not.toHaveProperty('path')
    expect(pub).not.toHaveProperty('text')
    expect(pub).toMatchObject({ id: 'att-1', filename: 'invoice.pdf', hasFile: true, summary: 'Invoice from Acme — $450.00 due Sep 30' })
    expect(publicAttachment(stored({ path: null })).hasFile).toBe(false)
  })
})

describe('with the real attachment store', () => {
  it('a text attachment is saved, read on this computer, found by id, and reaches the classifier', async () => {
    const db = openDatabase(':memory:')
    const dir = mkdtempSync(join(tmpdir(), 'inboxscout-att-'))
    repo.insertMessage(db, msg({ id: 'm-1' }))
    const body = 'INVOICE #1042\nBill to: Ann Example\nAmount due: $450.00\nDue date: Sep 30, 2026\nThank you for your business.\n'
    const data = new TextEncoder().encode(body)
    const saved = ingestAttachments(db, dir, { id: 'm-1', accountId: 'acc-1' }, [{ filename: 'invoice.txt', contentType: 'text/plain', size: data.length, data }], store)
    expect(saved).toBe(1)
    expect(recentMessageIdsWithAttachments(db)).toEqual(['m-1'])
    const read = await readNewAttachments(db, store, { messageIds: ['m-1'], vision: null, limit: 5 })
    expect(read.done).toBe(1)
    const ctx = read.context.get('m-1') ?? ''
    expect(ctx).toContain('invoice.txt')
    expect(ctx).toContain('$450.00')
    const c = classifyMessageHeuristically({ ...msg({ id: 'm-1', subject: 'Hello', bodyText: 'See attached.' }), attachments: ctx }, PROFILES.general)
    expect(c.isActionable).toBe(true)
    expect(c.actionSummary).toContain('$450.00')
    const [a] = store.attachmentsFor(db, 'm-1')
    expect(findAttachment(db, a.id, store)?.filename).toBe('invoice.txt')
    expect(findAttachment(db, 'nope', store)).toBeNull()
    expect(store.attachmentText(db, a.id, 20)).toHaveLength(20)
  })
})
