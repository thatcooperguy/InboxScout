import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { answerLocally, detectIntent, invalidateAskCache, resolvePerson, sayDate, type LocalDeps } from '../src/main/ask/local'
import { extractPending, saveIncoming } from '../src/main/attachments/index'
import type { Brief, HealthReport, MessageRecord } from '../src/shared/types'

/**
 * The twelve example questions from the spec (B4) against a fixture inbox built with the real repo
 * functions. Every local answer must land in under 2 seconds (B6) — the fixture is tiny, so the budget is
 * really a guard against accidental O(n²) loops or a stray network call.
 */

const NOW = new Date(2026, 8, 6, 12, 0, 0) // Sunday Sep 6, 2026, noon local

function msg(o: Partial<MessageRecord> & { id: string; fromAddress: string; subject: string; date: string }): MessageRecord {
  return {
    accountId: 'acc-1',
    folder: o.fromMe ? 'Sent' : 'INBOX',
    uid: Math.abs(hash(o.id)),
    messageId: `<${o.id}@example>`,
    threadKey: o.subject.toLowerCase().replace(/^re: /, ''),
    fromName: '',
    toAddresses: o.fromMe ? '' : 'me@example.com',
    snippet: '',
    bodyText: '',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...o
  }
}
function hash(s: string): number {
  let h = 7
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return h
}

function fixture(): LocalDeps {
  const db = openDatabase(':memory:')
  const rows: MessageRecord[] = [
    msg({ id: 'm-dentist-me', fromAddress: 'me@example.com', fromName: 'Me', fromMe: true, toAddresses: 'dr.patel@smiles.com', subject: 'Re: Your appointment', date: '2026-08-30T15:00:00.000Z', snippet: 'Can we do Tuesday?', bodyText: 'Can we do Tuesday?' }),
    msg({ id: 'm-dentist-1', fromAddress: 'dr.patel@smiles.com', fromName: 'Dr. Patel', subject: 'Your appointment', date: '2026-09-01T14:00:00.000Z', snippet: 'Confirming your dentist cleaning Tuesday at 2:00 pm. See you at 2:00.', bodyText: 'Confirming your dentist cleaning Tuesday at 2:00 pm. See you at 2:00.' }),
    msg({ id: 'm-jane-park', fromAddress: 'jane.park@example.com', fromName: 'Jane Park', subject: 'Lease renewal', date: '2026-09-03T10:00:00.000Z', snippet: 'Can you sign the lease renewal this week?', bodyText: 'Can you sign the lease renewal this week?' }),
    msg({ id: 'm-jane-ruiz', fromAddress: 'jane@ruizlaw.com', fromName: 'Jane Ruiz', subject: 'Contract to sign', date: '2026-09-02T10:00:00.000Z', snippet: 'The contract is ready for your signature.', bodyText: 'The contract is ready for your signature.' }),
    msg({ id: 'm-sam', fromAddress: 'me@example.com', fromName: 'Me', fromMe: true, toAddresses: 'sam@acme.com', subject: 'Contract', date: '2026-09-02T10:00:00.000Z', snippet: "I'll send the contract by Friday", bodyText: "Hi Sam, I'll send the contract by Friday." }),
    msg({ id: 'm-bank-1', fromAddress: 'alerts@bigbank.com', fromName: 'Big Bank', subject: 'Your statement is ready', date: '2026-09-04T08:00:00.000Z', snippet: 'Your September statement is ready. Account number 1234567890123456.', bodyText: 'Your September statement is ready. Account number 1234567890123456.' }),
    msg({ id: 'm-bank-2', fromAddress: 'alerts@bigbank.com', fromName: 'Big Bank', subject: 'New sign-in to your account', date: '2026-09-05T08:00:00.000Z', snippet: 'We noticed a new sign-in.', bodyText: 'We noticed a new sign-in from a new device.' }),
    msg({ id: 'm-acme-1', fromAddress: 'billing@acme.com', fromName: 'Acme Billing', subject: 'Invoice #1042 — 30 days past due', date: '2026-08-28T09:00:00.000Z', snippet: 'Invoice #1042 for $2,400 is 30 days past due.', bodyText: 'Invoice #1042 for $2,400 is 30 days past due. Please pay.' }),
    msg({ id: 'm-acme-2', fromAddress: 'billing@acme.com', fromName: 'Acme Billing', subject: 'Second notice: Invoice #1042', date: '2026-09-04T09:00:00.000Z', snippet: 'Second notice. Service pauses Monday.', bodyText: 'Second notice for invoice #1042. Service pauses Monday unless paid.' }),
    msg({ id: 'm-roof-1', fromAddress: 'ron@roofers.com', fromName: 'Ron Roofer', subject: 'Roof repair quote', date: '2026-08-10T09:00:00.000Z', snippet: 'Quote for the roof repair: $3,200.', bodyText: 'Quote for the roof repair: $3,200.' }),
    msg({ id: 'm-roof-2', fromAddress: 'ron@roofers.com', fromName: 'Ron Roofer', subject: 'Roof repair scheduled', date: '2026-08-20T09:00:00.000Z', snippet: 'We start the roof repair on Aug 25.', bodyText: 'We start the roof repair on Aug 25.' }),
    msg({ id: 'm-roof-3', fromAddress: 'ron@roofers.com', fromName: 'Ron Roofer', subject: 'Roof repair done', date: '2026-09-01T09:00:00.000Z', snippet: 'The roof repair is done; invoice attached.', bodyText: 'The roof repair is done; invoice attached.' }),
    msg({ id: 'm-school', fromAddress: 'office@lincoln.school.org', fromName: 'Lincoln Elementary', subject: 'Parent conference', date: '2026-09-03T09:00:00.000Z', snippet: 'Your parent conference at the school is Sep 10 at 2:30 pm.', bodyText: 'Your parent conference at the school is Sep 10 at 2:30 pm. Please confirm.' })
  ]
  for (const r of rows) repo.insertMessage(db, r)
  repo.upsertClassification(db, {
    messageId: 'm-bank-1',
    category: 'personal',
    importance: 2,
    screening: 'transactional',
    isActionable: false,
    actionSummary: null,
    deadline: null,
    topics: [],
    projectHint: null,
    people: ['Big Bank'],
    sensitivity: ['personal_private'],
    runId: 'run-1',
    model: 'rules-v1',
    corrected: false
  })
  const person = (name: string, address: string, role: string, score: number): repo.StoredPerson => ({
    key: address,
    name,
    addresses: [address],
    domain: address.split('@')[1],
    received: 3,
    sent: 1,
    repliedByMe: 1,
    repliedToMe: 1,
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-09-01T00:00:00.000Z',
    cadenceDays: null,
    accounts: ['acc-1'],
    role,
    tier: 'regular',
    score,
    goingQuiet: false,
    quietDays: 0,
    isNew: false
  })
  repo.replacePeople(db, [
    person('Jane Park', 'jane.park@example.com', 'client', 9),
    person('Jane Ruiz', 'jane@ruizlaw.com', 'vendor', 8),
    person('Sam Lee', 'sam@acme.com', 'client', 7),
    person('Dr. Patel', 'dr.patel@smiles.com', 'service', 6),
    person('Big Bank', 'alerts@bigbank.com', 'service', 2)
  ])
  repo.upsertIssue(db, { id: 'i-acme', title: 'Invoice #1042 — 30 days past due', severity: 'urgent', state: 'active', ownerAction: 'Pay Acme $2,400 or call them', deadline: 'Monday', createdAt: '2026-09-04T09:00:00.000Z', updatedAt: '2026-09-04T09:00:00.000Z' })
  const brief: Brief = {
    headline: '1 open item, 1 high priority — start at the top.',
    topIssues: [{ issueId: 'i-acme', title: 'Invoice #1042 — 30 days past due', severity: 'urgent', whyNow: 'Second notice; service pauses Monday.', nextStep: 'Pay Acme $2,400 or call them', sources: [] }],
    pulse: [],
    waitingOnYou: ['Lease renewal - Jane Park', 'Contract to sign - Jane Ruiz'],
    waitingOnYouDetails: [
      { subject: 'Lease renewal', counterpart: 'Jane Park', address: 'jane.park@example.com' },
      { subject: 'Contract to sign', counterpart: 'Jane Ruiz', address: 'jane@ruizlaw.com' }
    ],
    waitingOnThem: ['Contract - Sam Lee (4d)'],
    deadlines: ['Sep 12 — Electric bill due'],
    personal: [],
    sensitiveNotices: ['"Your statement is ready" from Big Bank [personal_private]'],
    skillSections: [{ skillId: 'bills', title: 'Bills', icon: '💸', lines: ['Electric — $120.50 due Sep 12', 'Internet — $60 due Sep 15'] }],
    promises: [{ text: "I'll send the contract by Friday", to: 'Sam', address: 'sam@acme.com', due: '2026-09-04T09:00:00.000Z', subject: 'Contract', messageId: 'm-sam', madeOn: '2026-09-02T10:00:00.000Z', overdue: true }],
    schedule: {
      days: [
        { date: '2026-09-08', label: 'Tue Sep 8', events: [{ title: 'Dentist', iso: '2026-09-08T14:00:00', time: '2:00 pm', source: 'appointment', person: 'Dr. Patel', messageId: 'm-dentist-1' }] },
        { date: '2026-09-10', label: 'Thu Sep 10', events: [{ title: 'Parent conference', iso: '2026-09-10T14:30:00', time: '2:30 pm', source: 'appointment', person: 'Lincoln Elementary', messageId: 'm-school' }] },
        {
          date: '2026-09-11',
          label: 'Fri Sep 11',
          events: [
            { title: 'Soccer practice', iso: '2026-09-11T17:00:00', time: '5:00 pm', source: 'skill', conflict: true },
            { title: 'Dinner with Mom', iso: '2026-09-11T17:30:00', time: '5:30 pm', source: 'ai', conflict: true }
          ]
        }
      ],
      recurring: [],
      conflicts: ['Fri Sep 11: Soccer practice overlaps Dinner with Mom'],
      overdue: []
    }
  }
  repo.insertRun(db, { id: 'run-1', startedAt: '2026-09-06T07:30:00.000Z', finishedAt: '2026-09-06T07:31:00.000Z', status: 'succeeded', trigger: 'scheduled', messagesScanned: 13, error: null })
  repo.insertReport(db, { id: 'rep-1', runId: 'run-1', periodType: 'daily', createdAt: '2026-09-06T07:31:00.000Z', markdown: '# Brief', html: '<h1>Brief</h1>', filePath: null }, JSON.stringify(brief))
  const health: HealthReport = {
    checkedAt: NOW.toISOString(),
    ok: false,
    items: [
      { id: 'db', title: 'Database', status: 'ok', detail: 'Fine.', canRepair: false },
      { id: 'account', title: 'Mailbox sign-in', status: 'fail', detail: 'Gmail stopped accepting the saved app password.', canRepair: true }
    ],
    recentFixes: []
  }
  let last: string | null = null
  const deps: LocalDeps = { db, now: () => NOW, ownerName: 'Ann', healthStatus: () => health, lastAnswer: () => last }
  ;(deps as any).setLast = (s: string) => void (last = s)
  return deps
}

async function timed(deps: LocalDeps, q: string) {
  const t0 = performance.now()
  const a = await answerLocally(deps, q)
  expect(performance.now() - t0, `"${q}" took too long`).toBeLessThan(2000)
  expect(a.engine).toBe('local')
  return a
}

describe('local answerer — the twelve questions', () => {
  let deps: LocalDeps
  beforeEach(() => {
    invalidateAskCache()
    deps = fixture()
  })

  it('1. Did the dentist write back?', async () => {
    const a = await timed(deps, 'Did the dentist write back?')
    expect(a.text).toMatch(/^Yes — Dr\. Patel wrote Tuesday: "Confirming your dentist cleaning/)
    expect(a.sources[0]).toMatchObject({ messageId: 'm-dentist-1' })
    expect(a.sources[0].label).toContain('Your appointment')
    expect(a.unsure).toBe(false)
    // Nothing inbound after the person's own mail: "Not yet".
    const b = await timed(deps, 'Did Sam reply?')
    expect(b.text).toMatch(/^Not yet\. You wrote to Sam Lee 4 days ago/)
  })

  it('2. What do I owe this month?', async () => {
    const a = await timed(deps, 'What do I owe this month?')
    expect(a.text).toContain('Electric — $120.50 due Sep 12')
    expect(a.text).toContain('Internet — $60 due Sep 15')
    expect(a.text).toContain('Pay Acme $2,400')
    expect(a.text).toMatch(/Total: \$2,?580\.50?/)
  })

  it('3. Tell Jane I’ll sign it Friday — two Janes, then a draft', async () => {
    const a = await timed(deps, "Tell Jane I'll sign it Friday")
    expect(a.text).toBe('Which Jane — Jane Park or Jane Ruiz?')
    expect(a.actions.map((x) => x.kind)).toEqual(['ask', 'ask'])
    expect(a.actions[0].question).toBe("Tell Jane Park I'll sign it Friday")
    const b = await timed(deps, a.actions[0].question!)
    expect(b.text).toBe('I opened a draft to Jane. Read it, then press Send in your mail app.')
    const draft = b.actions.find((x) => x.kind === 'open_draft')!
    expect(draft.auto).toBe(true)
    expect(draft.mailto!.startsWith('mailto:jane.park%40example.com?')).toBe(true)
    const params = new URLSearchParams(draft.mailto!.split('?')[1])
    expect(params.get('subject')).toBe('Re: Lease renewal')
    expect(params.get('body')).toBe("Hi Jane,\n\nI'll sign it Friday.\n\nBest,\nAnn")
    // "that …" drops the "that" and speaks in the first person.
    const c = await timed(deps, 'Tell Sam that the roof is fixed')
    expect(new URLSearchParams(c.actions[0].mailto!.split('?')[1]).get('body')).toBe('Hi Sam,\n\nThe roof is fixed.\n\nBest,\nAnn')
    expect(b.actions.some((x) => (x.kind as string) === 'send')).toBe(false)
  })

  it('4. When is the school thing?', async () => {
    const a = await timed(deps, 'When is the school thing?')
    expect(a.text).toMatch(/^Parent conference: Thursday, Sep 10 at 2:30 pm \(from Lincoln Elementary, Thursday\)\./)
    expect(a.sources[0].messageId).toBe('m-school')
    // Straight from the schedule when the title matches.
    const b = await timed(deps, 'When is the dentist?')
    expect(b.text).toBe("Dentist: Tuesday at 2:00 pm (from Dr. Patel's email of Tuesday).")
    expect(b.unsure).toBe(false)
  })

  it('5. Who is waiting on me?', async () => {
    const a = await timed(deps, 'Who is waiting on me?')
    expect(a.text).toBe('2 people are waiting on you:\n• Jane Park — Lease renewal\n• Jane Ruiz — Contract to sign')
    expect(a.actions).toHaveLength(2)
    expect(a.actions[0]).toMatchObject({ kind: 'open_draft', label: 'Draft reply to Jane' })
    expect(a.actions[0].mailto).toMatch(/^mailto:jane\.park%40example\.com\?subject=Re%3A%20Lease%20renewal/)
    expect(a.actions.every((x) => !x.auto)).toBe(true)
  })

  it('6. Anything from the bank? — with the sensitive rule', async () => {
    const a = await timed(deps, 'Anything from the bank?')
    expect(a.text).toMatch(/^The latest 2 from Big Bank:/)
    expect(a.text).toContain('New sign-in to your account')
    expect(a.text).toContain('Your statement is ready')
    expect(a.text).toContain('One of these contains private details — open it to read.')
    expect(a.text).not.toContain('1234567890123456')
    expect(a.sources.map((s) => s.messageId)).toEqual(['m-bank-2', 'm-bank-1'])
  })

  it('7. What did I promise Sam?', async () => {
    const a = await timed(deps, 'What did I promise Sam?')
    expect(a.text).toBe('You told Sam "I\'ll send the contract by Friday" Wednesday — due Friday — overdue.')
    expect(a.actions[0]).toMatchObject({ kind: 'open_draft', label: 'Follow up with Sam' })
    expect(a.sources[0].messageId).toBe('m-sam')
    expect((await timed(deps, 'What did I promise Jane?')).text).toBe("I can't see anything you promised Jane.")
  })

  it("8. What's on Friday?", async () => {
    const a = await timed(deps, "What's on Friday?")
    expect(a.text).toContain('Friday:')
    expect(a.text).toContain('‼ Soccer practice: 5:00 pm — overlaps another event')
    expect(a.text).toContain('Dinner with Mom: 5:30 pm')
    expect(a.text).toContain('Soccer practice overlaps Dinner with Mom')
    const b = await timed(deps, "What's on today?")
    expect(b.text).toBe('Nothing on today that I can see.')
    const c = await timed(deps, 'What is happening this week?')
    expect(c.text).toContain('Dentist: Tue Sep 8 at 2:00 pm (Dr. Patel)')
  })

  it('9. Is anything wrong?', async () => {
    const a = await timed(deps, 'Is anything wrong?')
    expect(a.text).toBe('• Mailbox sign-in: Gmail stopped accepting the saved app password.')
    expect(a.text).not.toContain('Database')
    expect((await timed({ ...deps, healthStatus: () => ({ checkedAt: '', ok: true, items: [{ id: 'db', title: 'Database', status: 'ok', detail: '', canRepair: false }], recentFixes: [] }) }, 'Is anything wrong?')).text).toBe('Everything is working.')
    expect((await timed({ ...deps, healthStatus: undefined }, 'Why didn’t my brief arrive?')).unsure).toBe(true)
  })

  it('10. Read it to me', async () => {
    const a = await timed(deps, 'Read it to me')
    expect(a.actions[0]).toMatchObject({ kind: 'speak', auto: true })
    expect(a.text).toContain('1 open item')
    ;(deps as any).setLast('Yes — Dr. Patel wrote Tuesday.')
    const b = await timed(deps, 'read that to me')
    expect(b.text).toBe('Yes — Dr. Patel wrote Tuesday.')
    expect(b.actions[0].text).toBe('Yes — Dr. Patel wrote Tuesday.')
  })

  it('11. Why is the invoice from Acme urgent? — local fallback is FTS hits marked unsure', async () => {
    const a = await timed(deps, 'Why is the invoice from Acme urgent?')
    expect(a.unsure).toBe(true)
    expect(a.text).toMatch(/^Here is what I found about "Why is the invoice from Acme urgent\?":/)
    expect(a.text).toContain('Invoice #1042')
    expect(a.sources.length).toBeGreaterThan(0)
  })

  it('12. Summarise what happened with the roof repair — oldest first', async () => {
    const a = await timed(deps, 'Summarise what happened with the roof repair')
    expect(a.unsure).toBe(true)
    const ids = a.sources.map((s) => s.messageId)
    expect(ids.slice(0, 3)).toEqual(['m-roof-1', 'm-roof-2', 'm-roof-3'])
    expect(a.text.indexOf('Roof repair quote')).toBeLessThan(a.text.indexOf('Roof repair done'))
  })

  it("what's new reads like the short spoken brief", async () => {
    const a = await timed(deps, "What's new?")
    expect(a.text).toMatch(/^1 open item, 1 high priority — start at the top\. 1 thing needs you\./)
    expect(a.actions[0]).toMatchObject({ kind: 'go_to', tab: 'today' })
  })

  it('never crashes on punctuation, apostrophes, quotes, or emoji', async () => {
    for (const q of ["Jane's", 'write back?', '"quoted" AND (weird) OR NOT', '🙂🙂', '???', 'did the ??? write', 'anything from ???']) {
      const a = await timed(deps, q)
      expect(typeof a.text).toBe('string')
    }
    expect((await timed(deps, '')).text).toContain('Ask me something')
  })
})

describe('local answerer — pieces', () => {
  it('routes every example to the intended intent', () => {
    expect(detectIntent('Did the dentist write back?')).toBe('wrote_back')
    expect(detectIntent('What do I owe this month?')).toBe('owe')
    expect(detectIntent("Tell Jane I'll sign it Friday")).toBe('tell')
    expect(detectIntent('When is the school thing?')).toBe('when_is')
    expect(detectIntent('Who is waiting on me?')).toBe('waiting')
    expect(detectIntent('Anything from the bank?')).toBe('from_x')
    expect(detectIntent('What did I promise Sam?')).toBe('promises')
    expect(detectIntent("What's on Friday?")).toBe('schedule_day')
    expect(detectIntent('Is anything wrong?')).toBe('health')
    expect(detectIntent('Read it to me')).toBe('read')
    expect(detectIntent('Why is the invoice from Acme urgent?')).toBe('fallback')
    expect(detectIntent('Summarise what happened with the roof repair')).toBe('fallback')
    expect(detectIntent("What's new?")).toBe('whats_new')
  })

  it('resolves names by prefix, address, and full name; asks when two match', () => {
    const { db } = fixture()
    expect(resolvePerson(db, 'sam')).toMatchObject({ kind: 'one', person: { address: 'sam@acme.com' } })
    expect(resolvePerson(db, 'Jane')).toMatchObject({ kind: 'many' })
    expect(resolvePerson(db, 'jane park')).toMatchObject({ kind: 'one', person: { name: 'Jane Park' } })
    expect(resolvePerson(db, 'Dr. Patel')).toMatchObject({ kind: 'one', person: { address: 'dr.patel@smiles.com' } })
    expect(resolvePerson(db, 'ron')).toMatchObject({ kind: 'one', person: { address: 'ron@roofers.com' } }) // not in People yet: from the mail itself
    expect(resolvePerson(db, 'zzz')).toEqual({ kind: 'none' })
  })

  it('says dates the way a person would', () => {
    expect(sayDate('2026-09-06T08:00:00', NOW)).toBe('today')
    expect(sayDate('2026-09-05T08:00:00', NOW)).toBe('yesterday')
    expect(sayDate('2026-09-07T08:00:00', NOW)).toBe('tomorrow')
    expect(sayDate('2026-09-01T08:00:00', NOW)).toBe('Tuesday')
    expect(sayDate('2026-08-10T08:00:00', NOW)).toBe('Aug 10')
  })

  // ---- Reads attachments and photos (v1.5): "what was in the pdf from Ron?" ----
  it('routes questions about attached files to the attachment intent, and nothing else', () => {
    for (const q of [
      'What was in the pdf from Ron?',
      'What did the invoice say?',
      "What's in the attachment from Jane Park?",
      'Show me the photo from Mom',
      'What is in the file?',
      'What was in the contract from Jane Ruiz'
    ]) {
      expect(detectIntent(q), q).toBe('attachment')
    }
    // The twelve original questions keep their intents.
    expect(detectIntent('Why is the invoice from Acme urgent?')).toBe('fallback')
    expect(detectIntent('Anything from the bank?')).toBe('from_x')
    expect(detectIntent('What do I owe this month?')).toBe('owe')
    expect(detectIntent('Read it to me')).toBe('read')
  })

  it('answers from a file that was read: summary, facts, the sender, and an Open button', async () => {
    const deps = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'inboxscout-ask-'))
    const body = 'INVOICE #7\nRoof repair — final\nAmount due: $3,200.00\nDue date: Sep 20, 2026\n'
    const data = new TextEncoder().encode(body)
    saveIncoming(deps.db, dir, { messageId: 'm-roof-3', accountId: 'acc-1', filename: 'roof-invoice.txt', contentType: 'text/plain', size: data.length, data })
    deps.db.prepare('UPDATE messages SET has_attachments = 1 WHERE id = ?').run('m-roof-3')
    await extractPending(deps.db, { limit: 5, ocr: false })
    // By sender.
    const a = await timed(deps, 'What was in the invoice from Ron?')
    expect(a.unsure).toBe(false)
    expect(a.text).toMatch(/^The invoice from Ron Roofer \(Tuesday, "Roof repair done"\):/)
    expect(a.text).toContain('roof-invoice.txt')
    expect(a.text).toContain('$3,200.00')
    expect(a.sources[0].messageId).toBe('m-roof-3')
    expect(a.actions[0]).toMatchObject({ kind: 'open_message', messageId: 'm-roof-3' })
    // No sender: the newest message with attachments.
    const b = await timed(deps, 'What was in the attachment?')
    expect(b.text).toContain('roof-invoice.txt')
    // The wrong kind of file, or a person with none: an honest "can't see".
    expect((await timed(deps, 'Show me the photo from Ron')).unsure).toBe(true)
    expect((await timed(deps, 'What was in the pdf from Sam?')).text).toBe("I can't see a pdf from Sam Lee that I have read.")
    expect((await timed(deps, 'What was in the file from zzz?')).unsure).toBe(true)
    // Two Janes: the same "which one?" chips as every other intent.
    expect((await timed(deps, 'What was in the contract from Jane?')).text).toBe('Which Jane — Jane Park or Jane Ruiz?')
  })

  it('caches the brief per run and drops it when a new report lands', async () => {
    const deps = fixture()
    const a = await answerLocally(deps, 'Who is waiting on me?')
    expect(a.text).toContain('Jane Park')
    const quiet: Brief = { headline: 'Quiet', topIssues: [], pulse: [], waitingOnYou: [], waitingOnThem: [], deadlines: [], personal: [], sensitiveNotices: [], skillSections: [] }
    repo.insertReport(deps.db, { id: 'rep-2', runId: 'run-1', periodType: 'daily', createdAt: '2026-09-06T09:00:00.000Z', markdown: '', html: '', filePath: null }, JSON.stringify(quiet))
    invalidateAskCache()
    expect((await answerLocally(deps, 'Who is waiting on me?')).text).toBe('Nobody is waiting on you right now.')
  })
})
