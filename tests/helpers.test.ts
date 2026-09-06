import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { loadSettings, saveSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS, type Brief, type Classification, type Helper, type MessageRecord } from '../src/shared/types'
import {
  ASK_DELAY_MS,
  cancelAsk,
  composeAsk,
  composeDigest,
  composeHeadsups,
  composeHello,
  pendingAsks,
  quietDigestText,
  scheduleAsk,
  sendToHelper,
  smsBody,
  smsClip,
  type HelperDeps,
  type SendFn
} from '../src/main/helpers/deliver'
import { PRESSURE, cadenceWords, detectHeadsups, helperSentKey, type HeadsupInput } from '../src/main/helpers/headsups'
import { findHelperNotes, replyText } from '../src/main/helpers/notes'
import { addHelper, afterRun, maskHelper, pauseAll, removeHelper, updateHelper, weeklyDue } from '../src/main/helpers/index'
import type { StoredPerson } from '../src/main/db/repo'

const NOW = new Date('2026-09-06T12:00:00.000Z')
const PERSON = 'Mom'
const BODY = 'Please sign the attached contract before Monday. My SSN is 123-45-6789. Thanks, Jane.'

const helper = (over: Partial<Helper> = {}): Helper => ({
  id: 'h1',
  name: 'Sarah',
  relationship: 'daughter',
  email: 'sarah@example.com',
  phone: '',
  carrier: '',
  level: 'needs',
  cadence: 'each_brief',
  weekday: 1,
  paused: false,
  addedBy: 'person',
  createdAt: NOW.toISOString(),
  ...over
})

const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  id: 'm1',
  accountId: 'acc-1',
  folder: 'INBOX',
  uid: 1,
  messageId: '<m1@x>',
  threadKey: 't1',
  fromAddress: 'stranger@scam.example',
  fromName: 'Account Team',
  toAddresses: 'mom@example.com',
  subject: 'Verify your account today',
  date: NOW.toISOString(),
  snippet: 'Your account is locked. Pay now with a gift card.',
  bodyText: BODY,
  fromMe: false,
  listUnsubscribe: null,
  hasAttachments: false,
  ...over
})

const classification = (over: Partial<Classification> = {}): Classification => ({
  messageId: 'm1',
  category: 'personal',
  importance: 2,
  screening: 'needs_reply',
  isActionable: true,
  actionSummary: null,
  deadline: null,
  topics: [],
  projectHint: null,
  people: [],
  sensitivity: [],
  runId: 'run-1',
  model: 'builtin',
  corrected: false,
  ...over
})

const person = (over: Partial<StoredPerson> = {}): StoredPerson => ({
  key: 'jane',
  name: 'Jane',
  addresses: ['jane@family.example'],
  domain: 'family.example',
  received: 20,
  sent: 15,
  repliedByMe: 10,
  repliedToMe: 9,
  firstSeen: '2025-01-01T00:00:00.000Z',
  lastSeen: '2026-08-01T00:00:00.000Z',
  cadenceDays: 7,
  accounts: ['acc-1'],
  role: 'family',
  tier: 'inner',
  score: 9,
  goingQuiet: false,
  quietDays: 0,
  isNew: false,
  ...over
})

const brief = (over: Partial<Brief> = {}): Brief => ({
  headline: 'One thing needs you.',
  topIssues: [{ issueId: 'i1', title: 'Sign the lease renewal', severity: 'urgent', whyNow: 'Due Friday', nextStep: 'Open the PDF and sign it', sources: ['m1'] }],
  pulse: [],
  waitingOnYou: ['Dinner plans - Jane'],
  waitingOnThem: [],
  deadlines: ['Friday — Sign the lease renewal'],
  personal: [],
  sensitiveNotices: [],
  skillSections: [],
  schedule: { days: [{ date: '2026-09-08', label: 'Mon Sep 8', events: [{ title: 'Dentist', iso: '2026-09-08T14:00:00', time: '2:00 pm', source: 'appointment', sourceLabel: 'Appointments' }] }], recurring: [], conflicts: [], overdue: ['Eye test on Sep 1'] },
  promises: [{ text: 'I will send the photos by Tuesday', to: 'Jane', address: 'jane@family.example', due: '2026-09-01', subject: 'Photos', messageId: 'p1', madeOn: '2026-08-28', overdue: true }],
  ...over
})

const THIRD_PARTY_ADDRESSES = ['stranger@scam.example', 'jane@family.example', 'mom@example.com']
const noLeaks = (text: string): void => {
  expect(text).not.toContain(BODY)
  expect(text).not.toContain('123-45-6789')
  for (const a of THIRD_PARTY_ADDRESSES) expect(text).not.toContain(a)
}

class FakeSecrets {
  map = new Map<string, string>()
  get(n: string): string | null {
    return this.map.get(n) ?? null
  }
  set(n: string, v: string): void {
    this.map.set(n, v)
  }
  delete(n: string): void {
    this.map.delete(n)
  }
}

interface Sent {
  to: string
  subject: string
  html: string | undefined
  text: string
}

function makeDeps(over: Partial<HelperDeps> = {}, withOutbox = true): { deps: HelperDeps; sent: Sent[] } {
  const db = openDatabase(':memory:')
  const secrets = new FakeSecrets()
  const sent: Sent[] = []
  if (withOutbox) {
    repo.upsertAccount(db, { id: 'acc-1', label: 'Mom', email: 'mom@example.com', provider: 'gmail', host: 'imap.gmail.com', port: 993, folders: ['INBOX'], createdAt: NOW.toISOString() })
    secrets.set('account:acc-1', 'app-password')
  }
  const send: SendFn = async (_outbox, _password, to, subject, html, text) => {
    sent.push({ to, subject, html, text })
  }
  return { deps: { db, secrets, send, now: () => NOW, personName: PERSON, askDelayMs: 20, ...over }, sent }
}

describe('compose (pure)', () => {
  it('composeAsk carries the title, next step, why now, and the note — never a body or a third-party address', () => {
    const c = composeAsk({ person: PERSON, helper: helper(), title: 'Sign the lease renewal', nextStep: 'Open the PDF and sign it', whyNow: 'Due Friday', note: 'Can you come by Thursday?' })
    expect(c.subject).toBe('Mom needs a hand: Sign the lease renewal')
    expect(c.text).toContain('Mom asked InboxScout to send you this.')
    expect(c.text).toContain('What: Sign the lease renewal')
    expect(c.text).toContain('Next step: Open the PDF and sign it')
    expect(c.text).toContain('Why now: Due Friday')
    expect(c.text).toContain("Mom's note: Can you come by Thursday?")
    expect(c.text).toContain('Reply to this email to send Mom a note back')
    expect(c.text).toContain('Mom can stop it any time.')
    expect(c.html).toContain('<p>')
    noLeaks(c.text)
    noLeaks(c.html)
    // Optional lines are dropped, not left blank.
    const bare = composeAsk({ person: PERSON, helper: helper(), title: 'X' })
    expect(bare.text).not.toContain('Next step:')
    expect(bare.text).not.toContain('note:')
  })

  it('composeDigest per level: needs = titles + next steps, schedule = dates only, all = the brief; ask = nothing', () => {
    const b = brief()
    const needs = composeDigest({ person: PERSON, helper: helper({ level: 'needs' }), brief: b })!
    expect(needs.subject).toBe("How Mom's week looks")
    expect(needs.text).toContain('Sign the lease renewal — next step: Open the PDF and sign it')
    expect(needs.text).not.toContain('Dentist')
    expect(needs.text).not.toContain('Dinner plans')
    expect(needs.text).toContain("If this stops arriving, Mom's computer is probably off.")
    noLeaks(needs.text)

    const sched = composeDigest({ person: PERSON, helper: helper({ level: 'schedule' }), brief: b })!
    expect(sched.text).toContain('Here is what Mom has coming up this week.')
    expect(sched.text).toContain('Mon Sep 8 2:00 pm — Dentist (Appointments)')
    expect(sched.text).toContain('Already passed: Eye test on Sep 1')
    expect(sched.text).not.toContain('Sign the lease renewal')
    expect(sched.text).not.toContain('photos')
    expect(sched.text).toContain("Mom's computer is probably off")
    noLeaks(sched.text)

    const all = composeDigest({ person: PERSON, helper: helper({ level: 'all' }), brief: b, markdown: '# Brief\n\n- rendered' })!
    expect(all.text).toContain('# Brief')
    expect(all.text).toContain('rendered')
    expect(all.text).toContain("Mom's computer is probably off")
    const allPlain = composeDigest({ person: PERSON, helper: helper({ level: 'all' }), brief: b })!
    expect(allPlain.text).toContain('One thing needs you.')
    expect(allPlain.text).toContain('Dentist')
    noLeaks(allPlain.text)

    expect(composeDigest({ person: PERSON, helper: helper({ level: 'ask' }), brief: b })).toBeNull()
  })

  it('quiet digests say the right thing per level', () => {
    const quiet = brief({ headline: "You're all caught up.", topIssues: [], waitingOnYou: [], deadlines: [], schedule: { days: [], recurring: [], conflicts: [], overdue: [] }, promises: [] })
    expect(composeDigest({ person: PERSON, helper: helper({ level: 'needs' }), brief: quiet })!.text).toContain('All fine. Nothing needed Mom this week.')
    expect(composeDigest({ person: PERSON, helper: helper({ level: 'schedule' }), brief: quiet })!.text).toContain('No appointments coming up for Mom this week.')
    expect(composeDigest({ person: PERSON, helper: helper({ level: 'all' }), brief: quiet })!.text).toContain("You're all caught up.")
    expect(quietDigestText('needs', 'Dad')).toBe('All fine. Nothing needed Dad this week.')
    expect(quietDigestText('schedule', 'Dad')).toBe('No appointments coming up for Dad this week.')
  })

  it('composeHeadsups and composeHello carry the footer and never a body', () => {
    const [h] = composeHeadsups(PERSON, [{ triggerKey: 'pressure:m1', kind: 'pressure', text: 'An email from "Account Team" is pushing Mom to pay or act fast.' }])
    expect(h.subject).toBe('Heads-up about Mom')
    expect(h.triggerKey).toBe('pressure:m1')
    expect(h.text).toContain('pushing Mom to pay or act fast')
    expect(h.text).toContain('Mom can stop it any time.')
    noLeaks(h.text)
    const hello = composeHello(PERSON, helper({ level: 'needs', cadence: 'weekly', weekday: 1 }))
    expect(hello.subject).toBe('InboxScout: Mom added you as a trusted helper')
    expect(hello.text).toContain('Hi Sarah,')
    expect(hello.text).toContain('what needs Mom, plus a heads-up about scams')
    expect(hello.text).toContain('once a week, on Monday')
    expect(hello.text).toContain('never Mom\'s emails themselves, passwords, sign-ins, or attachments')
    expect(hello.text).toContain('can change or stop this at any time')
  })

  it('smsClip keeps a text at or under 155 characters and the SMS body says to reply by email', () => {
    const long = 'word '.repeat(80)
    expect(smsClip(long).length).toBeLessThanOrEqual(155)
    expect(smsClip(long).length).toBeLessThanOrEqual(150)
    expect(smsClip(long).endsWith('…')).toBe(true)
    expect(smsClip('short\n\nline')).toBe('short line')
    expect(smsClip('x'.repeat(150))).toHaveLength(150)
    const body = smsBody(composeAsk({ person: PERSON, helper: helper(), title: 'Sign the lease renewal' }).text)
    expect(body.length).toBeLessThanOrEqual(155)
    expect(body).toMatch(/Reply by email, not text\.$/)
  })
})

describe('detectHeadsups', () => {
  const base = (over: Partial<HeadsupInput> = {}): HeadsupInput => ({
    person: PERSON,
    newClassifications: [],
    messages: [],
    people: [person()],
    brief: null,
    failingAccounts: [],
    now: NOW,
    ...over
  })

  it('#1 sensitive request from a stranger fires once, names sender and subject only', () => {
    const out = detectHeadsups(base({ messages: [message()], newClassifications: [classification({ sensitivity: ['personal_private'] })] }))
    const h = out.find((x) => x.kind === 'sensitive')!
    expect(h.triggerKey).toBe('sensitive:m1')
    expect(h.text).toBe('Someone Mom doesn\'t usually hear from ("Account Team", subject "Verify your account today") asked for private details. Worth a phone call.')
    noLeaks(h.text)
    expect(out.filter((x) => x.kind === 'sensitive')).toHaveLength(1)
  })

  it('#2 pressure from a stranger fires once (PRESSURE or URGENT), ignores known senders for #1/#2', () => {
    const out = detectHeadsups(base({ messages: [message()], newClassifications: [classification({ sensitivity: ['personal_private'] })] }))
    const h = out.find((x) => x.kind === 'pressure')!
    expect(h.triggerKey).toBe('pressure:m1')
    expect(h.text).toBe('An email from "Account Team" is pushing Mom to pay or act fast. It looks like a scam. Please check with Mom.')
    expect(out.filter((x) => x.kind === 'pressure')).toHaveLength(1)
    expect(PRESSURE.test('please buy a gift card')).toBe(true)
    expect(PRESSURE.test('your account suspended until you verify your identity')).toBe(true)
    expect(PRESSURE.test('lunch tomorrow?')).toBe(false)
    // URGENT alone is enough.
    const urgentOnly = detectHeadsups(base({ messages: [message({ subject: 'URGENT: final notice', snippet: 'Call us.' })], newClassifications: [classification()] }))
    expect(urgentOnly.map((x) => x.kind)).toEqual(['pressure'])
    // Known, regular sender: neither #1 nor #2.
    const known = detectHeadsups(base({ messages: [message({ fromAddress: 'jane@family.example' })], newClassifications: [classification({ sensitivity: ['personal_private'] })] }))
    expect(known).toEqual([])
    // A new or occasional sender still counts as a stranger.
    const occasional = detectHeadsups(base({ people: [person({ addresses: ['stranger@scam.example'], tier: 'occasional' })], messages: [message()], newClassifications: [classification({ sensitivity: ['personal_private'] })] }))
    expect(occasional.map((x) => x.kind).sort()).toEqual(['pressure', 'sensitive'])
  })

  it('#3 an account keeps failing fires once per account, even with no brief', () => {
    const out = detectHeadsups(base({ failingAccounts: [{ account: { id: 'acc-1', label: 'Gmail', email: 'mom@example.com' }, count: 3, error: 'Invalid credentials' }] }))
    expect(out).toHaveLength(1)
    expect(out[0].triggerKey).toBe('account:acc-1')
    expect(out[0].text).toBe("InboxScout can't read Mom's Gmail email any more (it has failed 3 times). Mom may need a new app password; the app says how under Settings → Health.")
  })

  it('#4 inner circle gone quiet fires once, with the cadence in words', () => {
    const out = detectHeadsups(base({ people: [person({ goingQuiet: true, quietDays: 23, cadenceDays: 7 })] }))
    expect(out).toHaveLength(1)
    expect(out[0].triggerKey).toBe('quiet:jane')
    expect(out[0].text).toBe('Mom usually hears from Jane every week; it has been 23 days.')
    expect(detectHeadsups(base({ people: [person({ goingQuiet: true, quietDays: 23, tier: 'regular' })] }))).toEqual([])
    expect(cadenceWords(3)).toBe('3 days')
    expect(cadenceWords(14)).toBe('2 weeks')
    expect(cadenceWords(30)).toBe('month')
  })

  it('#5 an overdue promise fires once with who and what', () => {
    const out = detectHeadsups(base({ brief: brief({ topIssues: [] }) }))
    expect(out).toHaveLength(1)
    expect(out[0].triggerKey).toBe('promise:p1')
    expect(out[0].text).toBe('Mom told Jane "I will send the photos by Tuesday" and the date has passed.')
  })

  it('#6 something urgent fires once, only for issues created in this run, title + next step only', () => {
    const b = brief({ promises: [] })
    expect(detectHeadsups(base({ brief: b }))).toEqual([])
    const out = detectHeadsups(base({ brief: b, newIssueIds: new Set(['i1']) }))
    expect(out).toHaveLength(1)
    expect(out[0].triggerKey).toBe('urgent:i1')
    expect(out[0].text).toBe('Sign the lease renewal — Open the PDF and sign it.')
    noLeaks(out[0].text)
  })

  it('respects the 7-day key: a trigger sent 6 days ago stays quiet, 8 days ago fires again', () => {
    const input = base({ people: [person({ goingQuiet: true, quietDays: 23 })] })
    const sixDaysAgo = new Date(NOW.getTime() - 6 * 86400000).toISOString()
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 86400000).toISOString()
    expect(detectHeadsups({ ...input, lastSent: (k) => (k === 'quiet:jane' ? sixDaysAgo : null) })).toEqual([])
    expect(detectHeadsups({ ...input, lastSent: (k) => (k === 'quiet:jane' ? eightDaysAgo : null) })).toHaveLength(1)
    expect(helperSentKey('quiet:jane')).toBe('helper:sent:quiet:jane')
  })
})

describe('findHelperNotes', () => {
  const helpers = [helper({ email: 'Sarah@Example.com' })]
  const reply = (over: Partial<MessageRecord> = {}): MessageRecord =>
    message({ id: 'r1', fromAddress: 'sarah@example.com', fromName: 'Sarah', subject: 'Re: Mom needs a hand: Sign the lease renewal', bodyText: 'I can come by Thursday.\n\nOn Sat, Sep 6, 2026 Mom wrote:\n> Mom asked InboxScout to send you this.', snippet: 'I can come by Thursday.', ...over })

  it('matches Re: + one of our subject prefixes only, from a helper only, and keeps just the reply', () => {
    const notes = findHelperNotes([reply()], helpers, { now: NOW })
    expect(notes).toEqual([{ from: 'Sarah', text: 'I can come by Thursday.', receivedAt: NOW.toISOString(), messageId: 'r1' }])
    expect(findHelperNotes([reply({ subject: 'Re: dinner Sunday?' })], helpers, { now: NOW })).toEqual([])
    expect(findHelperNotes([reply({ subject: 'Mom needs a hand: Sign the lease renewal' })], helpers, { now: NOW })).toEqual([])
    expect(findHelperNotes([reply({ fromAddress: 'someone@else.example' })], helpers, { now: NOW })).toEqual([])
    expect(findHelperNotes([reply({ fromMe: true })], helpers, { now: NOW })).toEqual([])
    expect(findHelperNotes([reply({ subject: "RE: How Mom's week looks" }), reply({ id: 'r2', subject: 'Re: Heads-up about Mom' })], helpers, { now: NOW })).toHaveLength(2)
    expect(findHelperNotes([reply()], [], { now: NOW })).toEqual([])
    expect(replyText('Yes.\n> quoted')).toBe('Yes.')
    expect(replyText('', 'from the snippet')).toBe('from the snippet')
  })

  it('ignores replies older than the window', () => {
    const old = new Date(NOW.getTime() - 20 * 86400000).toISOString()
    expect(findHelperNotes([reply({ date: old })], helpers, { now: NOW })).toEqual([])
  })
})

describe('sending and the log', () => {
  it('sendToHelper logs exactly what went out and never throws', async () => {
    const { deps, sent } = makeDeps()
    const row = await sendToHelper(deps, helper(), 'ask', 'Subject', 'Hello there', undefined, null, 'send-1')
    expect(row).toMatchObject({ id: 'send-1', helperId: 'h1', kind: 'ask', channel: 'email', status: 'sent', error: null, text: 'Hello there', triggerKey: null })
    expect(sent).toEqual([{ to: 'sarah@example.com', subject: 'Subject', html: '<p>Hello there</p>', text: 'Hello there' }])
    expect(repo.listHelperSends(deps.db)).toHaveLength(1)
    expect(repo.lastHelperSend(deps.db, 'h1')?.status).toBe('sent')
  })

  it('falls back to SMS after a failed email, with the clipped text and the reply-by-email footer', async () => {
    const { deps, sent } = makeDeps({
      send: async (_o, _p, to, subject, html, text) => {
        if (!to.endsWith('vtext.com')) throw new Error('SMTP 535 auth failed')
        sent.push({ to, subject, html, text })
      }
    })
    const h = helper({ phone: '(555) 123-4567', carrier: 'verizon' })
    const row = await sendToHelper(deps, h, 'headsup', 'Heads-up about Mom', 'x'.repeat(300), undefined, 'quiet:jane')
    expect(row.channel).toBe('sms')
    expect(row.status).toBe('sent')
    expect(row.text.length).toBeLessThanOrEqual(155)
    expect(row.text).toMatch(/Reply by email, not text\.$/)
    expect(sent).toEqual([{ to: '5551234567@vtext.com', subject: '', html: undefined, text: row.text }])
    const log = repo.listHelperSends(deps.db, { helperId: 'h1' })
    expect(log.map((r) => `${r.channel}:${r.status}`).sort()).toEqual(['email:failed', 'sms:sent'])
    expect(log.find((r) => r.channel === 'email')?.error).toContain('535')
  })

  it('with no outbox the send is logged as failed with a plain reason', async () => {
    const { deps, sent } = makeDeps({}, false)
    const row = await sendToHelper(deps, helper(), 'digest', 'S', 'T')
    expect(row.status).toBe('failed')
    expect(row.error).toContain('No account can send mail')
    expect(sent).toEqual([])
  })

  it('updateHelperSend changes status and error in place', () => {
    const { deps } = makeDeps()
    repo.insertHelperSend(deps.db, { id: 's1', helperId: 'h1', kind: 'ask', channel: 'email', sentAt: NOW.toISOString(), subject: 'S', text: 'T', triggerKey: null, status: 'sent', error: null })
    repo.updateHelperSend(deps.db, 's1', { status: 'failed', error: 'bounced' })
    expect(repo.listHelperSends(deps.db)[0]).toMatchObject({ status: 'failed', error: 'bounced' })
    repo.updateHelperSend(deps.db, 'missing', { status: 'sent' })
  })
})

describe('Ask for help: the pending queue', () => {
  const withHelper = (deps: HelperDeps, h: Helper = helper()): void => saveSettings(deps.db, { ...loadSettings(deps.db), helpers: [h] })

  it('waits, then sends; cancel in time stops it and logs a cancelled row', async () => {
    vi.useFakeTimers()
    try {
      const { deps, sent } = makeDeps({ askDelayMs: ASK_DELAY_MS })
      withHelper(deps)
      const r = scheduleAsk(deps, { helperId: 'h1', title: 'Sign the lease renewal', nextStep: 'Open the PDF', note: 'Thursday?' })
      expect(r.helperName).toBe('Sarah')
      expect(new Date(r.sendsAt).getTime() - NOW.getTime()).toBe(ASK_DELAY_MS)
      expect(r.outboxMissing).toBe(false)
      expect(r.mailto).toContain('mailto:sarah%40example.com')
      expect(pendingAsks()).toContain(r.sendId)
      expect(cancelAsk(deps, r.sendId)).toEqual({ cancelled: true })
      expect(cancelAsk(deps, r.sendId)).toEqual({ cancelled: false })
      await vi.advanceTimersByTimeAsync(ASK_DELAY_MS + 10)
      expect(sent).toEqual([])
      const log = repo.listHelperSends(deps.db)
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({ id: r.sendId, kind: 'ask', status: 'cancelled' })
      expect(log[0].text).toContain("Mom's note: Thursday?")

      const r2 = scheduleAsk(deps, { helperId: 'h1', title: 'Call the dentist' })
      await vi.advanceTimersByTimeAsync(ASK_DELAY_MS + 10)
      expect(sent).toHaveLength(1)
      expect(sent[0].subject).toBe('Mom needs a hand: Call the dentist')
      expect(repo.listHelperSends(deps.db).find((x) => x.id === r2.sendId)).toMatchObject({ status: 'sent', kind: 'ask' })
      expect(pendingAsks()).not.toContain(r2.sendId)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses when there is no such helper, the helper is paused, or all helpers are paused', () => {
    const { deps } = makeDeps()
    expect(() => scheduleAsk(deps, { helperId: 'nope', title: 'x' })).toThrow(/No helper yet/)
    withHelper(deps, helper({ paused: true }))
    expect(() => scheduleAsk(deps, { helperId: 'h1', title: 'x' })).toThrow(/paused/)
    withHelper(deps)
    expect(() => scheduleAsk(deps, { helperId: 'h1', title: '   ' })).toThrow(/no title/)
    pauseAll(deps, true)
    expect(() => scheduleAsk(deps, { helperId: 'h1', title: 'x' })).toThrow(/paused/)
  })
})

describe('helper records', () => {
  it('addHelper validates, sends the hello, sets the 7-day notice for non-person adds, and masks for the bridge', async () => {
    const { deps, sent } = makeDeps()
    await expect(addHelper(deps, { name: '' }, 'person')).rejects.toThrow(/name/)
    await expect(addHelper(deps, { name: 'Sarah' }, 'person')).rejects.toThrow(/email address or a phone number/)
    await expect(addHelper(deps, { name: 'Sarah', email: 'nope' }, 'person')).rejects.toThrow(/does not look right/)
    await expect(addHelper(deps, { name: 'Sarah', phone: '5551234567' }, 'person')).rejects.toThrow(/carrier/)
    const h = await addHelper(deps, { name: 'Sarah', relationship: 'daughter', email: 'Sarah@Example.com', level: 'needs' }, 'person')
    expect(h).toMatchObject({ name: 'Sarah', email: 'sarah@example.com', level: 'needs', cadence: 'each_brief', weekday: 1, paused: false, addedBy: 'person' })
    expect(loadSettings(deps.db).helpers).toHaveLength(1)
    expect(loadSettings(deps.db).helperNoticeUntil).toBeNull()
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe('InboxScout: Mom added you as a trusted helper')
    expect(repo.listHelperSends(deps.db)[0]).toMatchObject({ kind: 'hello', status: 'sent', helperId: h.id })

    const b = await addHelper(deps, { name: 'Bob', phone: '(555) 123-4567', carrier: 'att', level: 'schedule' }, 'bridge')
    expect(b.phone).toBe('5551234567')
    expect(loadSettings(deps.db).helperNoticeUntil).toBe(new Date(NOW.getTime() + 7 * 86400000).toISOString())
    expect(maskHelper(h).email).toBe('s***@example.com')
    expect(maskHelper(b).phone).toBe('***-***-4567')
    expect(JSON.stringify(maskHelper(h))).not.toContain('sarah@example.com')

    expect(updateHelper(deps, h.id, { level: 'all', cadence: 'weekly', weekday: 3, paused: true })).toMatchObject({ level: 'all', cadence: 'weekly', weekday: 3, paused: true })
    expect(updateHelper(deps, h.id, { level: 'bogus' as any, weekday: 99 })).toMatchObject({ level: 'all', weekday: 3 })
    expect(() => updateHelper(deps, 'nope', { paused: true })).toThrow(/no longer/)
    expect(removeHelper(deps, b.id)).toEqual({ ok: true })
    expect(removeHelper(deps, b.id)).toEqual({ ok: false })
    expect(loadSettings(deps.db).helpers.map((x) => x.id)).toEqual([h.id])
  })

  it('weeklyDue: due once after the weekday passes, until a digest goes out', () => {
    const sat = new Date('2026-09-05T09:00:00') // Saturday, local
    expect(weeklyDue(sat, 1, null)).toBe(true)
    expect(weeklyDue(sat, 1, '2026-08-31T08:00:00')).toBe(false) // sent on Monday already
    expect(weeklyDue(sat, 1, '2026-08-30T08:00:00')).toBe(true) // last one was before this Monday
    const mon = new Date('2026-09-07T07:30:00')
    expect(weeklyDue(mon, 1, '2026-09-05T08:00:00')).toBe(true)
  })
})

describe('afterRun (the pipeline hook)', () => {
  const setup = (helpers: Helper[], over: Partial<HelperDeps> = {}): ReturnType<typeof makeDeps> => {
    const made = makeDeps(over)
    saveSettings(made.deps.db, { ...DEFAULT_SETTINGS, helpers })
    repo.insertRun(made.deps.db, { id: 'run-1', startedAt: new Date(NOW.getTime() - 60000).toISOString(), finishedAt: NOW.toISOString(), status: 'succeeded', trigger: 'scheduled', messagesScanned: 1, error: null })
    repo.upsertIssue(made.deps.db, { id: 'i1', title: 'Sign the lease renewal', severity: 'urgent', state: 'emerging', ownerAction: 'Open the PDF and sign it', deadline: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() })
    return made
  }
  const input = (trigger: 'manual' | 'scheduled' | 'catchup' = 'scheduled') => ({
    brief: brief(),
    trigger,
    newClassifications: [classification({ sensitivity: ['personal_private'] })],
    messages: [message()],
    people: [person({ goingQuiet: true, quietDays: 23 })],
    failingAccounts: [],
    now: NOW
  })

  it('sends a digest and the heads-ups to a needs helper after a scheduled run, once per trigger key', async () => {
    const { deps, sent } = setup([helper()])
    expect(await afterRun(deps, input())).toEqual([])
    const kinds = repo.listHelperSends(deps.db).map((r) => `${r.kind}:${r.triggerKey ?? ''}`).sort()
    expect(kinds).toEqual(['digest:', 'headsup:pressure:m1', 'headsup:promise:p1', 'headsup:quiet:jane', 'headsup:sensitive:m1', 'headsup:urgent:i1'])
    expect(sent.every((s) => s.to === 'sarah@example.com')).toBe(true)
    for (const s of sent) noLeaks(s.text)
    expect(repo.getMeta(deps.db, helperSentKey('quiet:jane'))).toBe(NOW.toISOString())
    // The same run again: nothing repeats (digest is each_brief so it goes again; heads-ups do not).
    await afterRun(deps, input())
    expect(repo.listHelperSends(deps.db).filter((r) => r.kind === 'headsup')).toHaveLength(5)
    expect(repo.listHelperSends(deps.db).filter((r) => r.kind === 'digest')).toHaveLength(2)
  })

  it('manual runs, paused helpers, and Pause all send nothing; schedule helpers get dates only and no heads-ups', async () => {
    const { deps, sent } = setup([helper()])
    await afterRun(deps, input('manual'))
    expect(sent).toEqual([])
    pauseAll(deps, true)
    await afterRun(deps, input())
    expect(sent).toEqual([])
    pauseAll(deps, false)
    saveSettings(deps.db, { ...loadSettings(deps.db), helpers: [helper({ paused: true })] })
    await afterRun(deps, input())
    expect(sent).toEqual([])

    saveSettings(deps.db, { ...loadSettings(deps.db), helpers: [helper({ level: 'schedule' })] })
    await afterRun(deps, input('catchup'))
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('Dentist')
    expect(sent[0].text).not.toContain('lease')
    expect(repo.listHelperSends(deps.db).map((r) => r.kind)).toEqual(['digest'])
  })

  it('ask-only helpers get nothing from a run; weekly digests wait for the weekday; failures become notices', async () => {
    const { deps, sent } = setup([helper({ level: 'ask' })])
    await afterRun(deps, input())
    expect(sent).toEqual([])
    saveSettings(deps.db, { ...loadSettings(deps.db), helpers: [helper({ level: 'all', cadence: 'weekly', weekday: NOW.getDay() })] })
    await afterRun(deps, { ...input(), people: [], newClassifications: [], messages: [], brief: brief({ promises: [], topIssues: [] }) })
    expect(sent.filter((s) => s.subject.includes('week looks'))).toHaveLength(1)
    await afterRun(deps, { ...input(), people: [], newClassifications: [], messages: [], brief: brief({ promises: [], topIssues: [] }) })
    expect(sent.filter((s) => s.subject.includes('week looks'))).toHaveLength(1)

    const broken = setup([helper()], { send: async () => { throw new Error('SMTP down') } })
    const notices = await afterRun(broken.deps, { ...input(), people: [], newClassifications: [], messages: [], brief: brief({ promises: [], topIssues: [] }) })
    expect(notices).toEqual(['Could not reach your helper Sarah: SMTP down'])
  })
})
