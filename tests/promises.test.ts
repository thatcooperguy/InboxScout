import { describe, expect, it } from 'vitest'
import { dueDate, extractPromises } from '../src/main/pipeline/promises'
import type { MessageRecord } from '../src/shared/types'

// Sept 2026: Tue 1, Wed 2, Thu 3, Fri 4, Sat 5, Sun 6, Mon 7 … Fri 11, Sat 12.
const local = (d: number, h = 10, month = 8, year = 2026): Date => new Date(year, month, d, h, 0, 0)
const NOW = local(6, 12) // Sunday 6 Sep 2026, noon
const ME = ['chad@example.com', 'Chad.Work@Company.com']

let seq = 0
function sent(partial: Partial<MessageRecord> & { body: string; on: Date }): MessageRecord {
  seq++
  const { body, on, ...rest } = partial
  return {
    id: rest.id ?? `m${seq}`,
    accountId: 'a1',
    folder: 'Sent',
    uid: seq,
    messageId: `<m${seq}@test>`,
    threadKey: rest.threadKey ?? `t${seq}`,
    fromAddress: 'chad@example.com',
    fromName: 'Chad',
    toAddresses: 'Dana Ruiz <dana@client.com>',
    subject: 'Quote for the deck',
    date: on.toISOString(),
    snippet: body.slice(0, 80),
    bodyText: body,
    fromMe: true,
    listUnsubscribe: null,
    hasAttachments: false,
    ...rest
  }
}

describe('extractPromises', () => {
  it('finds a dated promise in the owner’s sent mail', () => {
    const out = extractPromises({
      messages: [sent({ body: 'Hi Dana,\n\nThanks for the call. I’ll send the revised quote by Friday.\n\nChad', on: local(2) })],
      myAddresses: ME,
      now: NOW
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      text: "I'll send the revised quote by Friday.",
      to: 'Dana Ruiz',
      address: 'dana@client.com',
      due: '2026-09-04',
      subject: 'Quote for the deck',
      overdue: true
    })
    expect(out[0].madeOn).toBe(local(2).toISOString())
  })

  it('ignores mail from other people and old mail', () => {
    const out = extractPromises({
      messages: [
        sent({ body: "I'll send the photos tomorrow.", on: local(3), fromMe: false, fromAddress: 'dana@client.com' }),
        sent({ body: "I'll send the photos tomorrow.", on: local(1, 10, 7) }) // 1 Aug: older than 21 days
      ],
      myAddresses: ME,
      now: NOW
    })
    expect(out).toEqual([])
  })

  it('recognises the owner by address (case-insensitive) even when fromMe is false', () => {
    const out = extractPromises({
      messages: [sent({ body: 'I will get back to you next week with the numbers.', on: local(3), fromMe: false, fromAddress: 'chad.work@company.com' })],
      myAddresses: ME,
      now: NOW
    })
    expect(out).toHaveLength(1)
    expect(out[0].due).toBe('2026-09-11') // Friday of the following week
    expect(out[0].overdue).toBe(false)
  })

  it('skips quoted text and everything after an "On … wrote:" line', () => {
    const body = [
      'Sounds good, thanks!',
      '',
      '> I’ll send the contract by Monday.',
      '',
      'On Tue, Sep 1, 2026 at 9:00 AM Dana Ruiz <dana@client.com> wrote:',
      '> Hi Chad, I will call you tomorrow to confirm.'
    ].join('\n')
    const out = extractPromises({ messages: [sent({ body, on: local(2) })], myAddresses: ME, now: NOW })
    expect(out).toEqual([])
  })

  it('stops at signature separators and forwarded headers', () => {
    const body = 'Got it.\n-- \nChad Cooper\nI’ll send anyone a quote within 24 hours!\n\nFrom: Dana\nI will pay by Friday.'
    const out = extractPromises({ messages: [sent({ body, on: local(2) })], myAddresses: ME, now: NOW })
    expect(out).toEqual([])
  })

  it('does not treat questions, negations or conditions as promises', () => {
    const body = [
      'Can I send this over on Monday?',
      "I won't be able to review the draft this week.",
      "If I can finish the paint by Wednesday I'll let you know.",
      'Once I finish the bathroom we can talk about the kitchen.'
    ].join('\n\n')
    const out = extractPromises({ messages: [sent({ body, on: local(2) })], myAddresses: ME, now: NOW })
    expect(out).toEqual([])
  })

  it('drops a promise when the owner wrote again later in the same thread', () => {
    const out = extractPromises({
      messages: [
        sent({ threadKey: 't-deck', body: "I'll have the estimate to you by end of day.", on: local(2, 9) }),
        sent({ threadKey: 't-deck', body: 'Here is the estimate, attached. Let me know what you think.', on: local(2, 16) })
      ],
      myAddresses: ME,
      now: NOW
    })
    expect(out).toEqual([])
  })

  it('keeps the promise when the later message is itself another promise', () => {
    const out = extractPromises({
      messages: [
        sent({ threadKey: 't-deck', body: "I'll send the estimate by Friday.", on: local(2) }),
        sent({ threadKey: 't-deck', body: "Sorry for the delay - I'll get back to you on Monday with it.", on: local(4) })
      ],
      myAddresses: ME,
      now: NOW
    })
    expect(out.map((p) => p.due)).toEqual(['2026-09-04', '2026-09-07'])
  })

  it('dedupes the same wording in a thread and keeps different threads apart', () => {
    const out = extractPromises({
      messages: [
        sent({ threadKey: 't1', body: "I'll call you tomorrow.", on: local(3) }),
        sent({ threadKey: 't1', body: "I'll call you tomorrow!", on: local(4) }),
        sent({ threadKey: 't2', body: "I'll call you tomorrow.", on: local(4) })
      ],
      myAddresses: ME,
      now: NOW
    })
    expect(out).toHaveLength(2)
    expect(new Set(out.map((p) => p.due))).toEqual(new Set(['2026-09-04', '2026-09-05']))
  })

  it('uses the first recipient that is not the owner, falling back to the bare address', () => {
    const out = extractPromises({
      messages: [
        sent({ body: 'Let me look into it and circle back.', on: local(4), toAddresses: 'chad@example.com, "Mom" <mom@family.net>' }),
        sent({ body: 'I plan to finish the report by the 12th.', on: local(4), toAddresses: 'boss@company.com' })
      ],
      myAddresses: ME,
      now: NOW
    })
    const byText = Object.fromEntries(out.map((p) => [p.text, p]))
    expect(byText['Let me look into it and circle back.']).toMatchObject({ to: 'Mom', address: 'mom@family.net', due: null })
    expect(byText['I plan to finish the report by the 12th.']).toMatchObject({ to: 'boss@company.com', address: 'boss@company.com', due: '2026-09-12' })
  })

  it('sorts overdue first, then by due date, then undated newest first, and caps at 12', () => {
    const messages: MessageRecord[] = [
      sent({ body: "I'll share the album sometime.", on: local(5) }),
      sent({ body: "I'm going to review the lease next week.", on: local(3) }),
      sent({ body: "I'll pay the invoice by Sep 3.", on: local(1) }),
      sent({ body: 'Let me schedule the inspection tomorrow.', on: local(5) }),
      sent({ body: "I'll put together the slides sometime.", on: local(2) })
    ]
    for (let i = 0; i < 10; i++) messages.push(sent({ body: `I'll follow up on item ${i} within 2 days.`, on: local(5, 8 + (i % 8)) }))
    const out = extractPromises({ messages, myAddresses: ME, now: NOW })
    expect(out).toHaveLength(12)
    expect(out[0]).toMatchObject({ due: '2026-09-03', overdue: true })
    expect(out[1]).toMatchObject({ due: '2026-09-06', overdue: false })
    const dated = out.filter((p) => p.due)
    const dues = dated.map((p) => p.due as string)
    expect(dues.slice(1)).toEqual([...dues.slice(1)].sort())
    const undated = out.filter((p) => !p.due)
    for (let i = 1; i < undated.length; i++) expect(undated[i - 1].madeOn >= undated[i].madeOn).toBe(true)
  })

  it('trims long sentences to at most 140 characters', () => {
    const long = "I'll send you the full set of drawings, the materials list, the permit paperwork, the revised schedule and the insurance certificate by Friday afternoon so you have everything."
    const out = extractPromises({ messages: [sent({ body: long, on: local(2) })], myAddresses: ME, now: NOW })
    expect(out[0].text.length).toBeLessThanOrEqual(140)
    expect(out[0].text.endsWith('…')).toBe(true)
    expect(out[0].due).toBe('2026-09-04')
  })

  it('falls back to the snippet when there is no body and never throws on junk', () => {
    const out = extractPromises({
      messages: [
        sent({ body: '', on: local(4), snippet: "Will do - I'll confirm by EOD." }),
        { ...sent({ body: "I'll sign it by Monday.", on: local(4) }), date: 'not a date', toAddresses: '' }
      ],
      myAddresses: ME,
      now: NOW
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ text: "Will do - I'll confirm by EOD.", due: '2026-09-04', overdue: true })
    expect(extractPromises({ messages: [], myAddresses: [], now: NOW })).toEqual([])
  })
})

describe('dueDate', () => {
  const wed = local(2) // Wednesday 2 Sep 2026
  it.each([
    ['by Friday', '2026-09-04'],
    ['by next Friday', '2026-09-11'],
    ['by end of day', '2026-09-02'],
    ['by EOD', '2026-09-02'],
    ['by end of week', '2026-09-04'],
    ['by end of the month', '2026-09-30'],
    ['tomorrow', '2026-09-03'],
    ['next week', '2026-09-11'],
    ['on the 12th', '2026-09-12'],
    ['on the 1st', '2026-10-01'],
    ['by Sep 12', '2026-09-12'],
    ['by September 12th, 2026', '2026-09-12'],
    ['by 9/15', '2026-09-15'],
    ['within 24 hours', '2026-09-03'],
    ['within 2 days', '2026-09-04'],
    ['within a week', '2026-09-09'],
    ['within 3 business days', '2026-09-07'],
    ['whenever I get a chance', null]
  ])('"%s" → %s', (phrase, expected) => {
    expect(dueDate(`I'll send it ${phrase}.`, wed)).toBe(expected)
  })

  it('treats a weekend "end of week" as the coming Friday', () => {
    expect(dueDate("I'll send it by end of week", local(6))).toBe('2026-09-11')
  })
})
