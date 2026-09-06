import { describe, expect, it } from 'vitest'
import { eventsFromBrief, parseLooseDate, toCsv, toIcs, trackerRows } from '../src/main/reports/exports'
import { pickOutbox, smsAddress, smsText } from '../src/main/delivery/email'
import { extractCredentials } from '../src/main/setup/capture'
import { replyMailto } from '../src/shared/mailto'
import type { AccountConfig, Brief } from '../src/shared/types'

const NOW = new Date(2026, 8, 6, 12, 0) // Sunday Sep 6 2026

describe('exports', () => {
  it('quotes CSV cells that need it', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"'], ['1', '', 'x']])).toBe('a,"b,c","say ""hi"""\r\n1,,x\r\n')
  })

  it('parses loose dates the way people write them', () => {
    expect(parseLooseDate('Sep 12', NOW)?.getDate()).toBe(12)
    expect(parseLooseDate('Sep 12', NOW)?.getFullYear()).toBe(2026)
    expect(parseLooseDate('Jan 5', NOW)?.getFullYear()).toBe(2027) // rolls forward when clearly past
    expect(parseLooseDate('9/15/2026', NOW)?.getMonth()).toBe(8)
    expect(parseLooseDate('tomorrow', NOW)?.getDate()).toBe(7)
    expect(parseLooseDate('friday', NOW)?.getDate()).toBe(11)
    expect(parseLooseDate('next sunday', NOW)?.getDate()).toBe(13)
    expect(parseLooseDate('end of week', NOW)).toBeNull()
  })

  it('turns brief deadlines into calendar events and valid ICS', () => {
    const brief = {
      headline: '',
      topIssues: [],
      pulse: [],
      waitingOnYou: [],
      waitingOnThem: [],
      deadlines: ['Sep 12 — Electric bill due', 'someday — vague'],
      personal: [],
      sensitiveNotices: [],
      skillSections: []
    } as Brief
    const events = eventsFromBrief(brief, NOW)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Electric bill due')
    const ics = toIcs(events, NOW)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260912')
    expect(ics).toContain('SUMMARY:Electric bill due')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('builds tracker rows from issues and brief sections', () => {
    const rows = trackerRows(
      [{ id: 'i', title: 'Sign contract', severity: 'urgent', state: 'emerging', ownerAction: 'Sign it', deadline: 'Monday', createdAt: '', updatedAt: '' }],
      { headline: '', topIssues: [], pulse: [], waitingOnYou: ['Quote — Jane'], waitingOnThem: [], deadlines: [], personal: [], sensitiveNotices: [], skillSections: [{ skillId: 'bills', title: 'Bills', icon: '', lines: ['Water $40'] }] }
    )
    expect(rows[0][0]).toBe('Type')
    expect(rows.some((r) => r[0] === 'Issue' && r[1] === 'Sign contract')).toBe(true)
    expect(rows.some((r) => r[0] === 'Bills' && r[1] === 'Water $40')).toBe(true)
    expect(rows.some((r) => r[0] === 'Waiting on you')).toBe(true)
  })
})

describe('delivery helpers', () => {
  it('maps phone + carrier to an SMS gateway address', () => {
    expect(smsAddress('(555) 123-4567', 'verizon')).toBe('5551234567@vtext.com')
    expect(smsAddress('1-555-123-4567', 'att')).toBe('5551234567@txt.att.net')
    expect(smsAddress('12345', 'att')).toBeNull()
    expect(smsAddress('5551234567', 'nope')).toBeNull()
  })

  it('keeps texts short and prioritised', () => {
    const text = smsText('3 open items, 2 high priority — start at the top.', ['Sign the Acme contract', 'Call Northwind back', 'Pay water bill', 'Fourth thing'])
    expect(text.startsWith('InboxScout: 3 open items')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(155)
    expect(text).not.toContain('Fourth thing')
  })

  it('picks an app-password account as the outbox and skips OAuth-only accounts', () => {
    const mk = (id: string, provider: AccountConfig['provider']): AccountConfig => ({
      id, label: id, email: `${id}@x.com`, provider, host: '', port: 993, folders: [], createdAt: ''
    })
    expect(pickOutbox([mk('o', 'outlook'), mk('g', 'gmailapi'), mk('y', 'yahoo')], null)?.id).toBe('y')
    expect(pickOutbox([mk('a', 'gmail'), mk('y', 'yahoo')], 'y')?.id).toBe('y')
    expect(pickOutbox([mk('o', 'outlook')], null)).toBeNull()
  })
})

describe('setup assistant capture', () => {
  it('finds a Google client id and secret in page text', () => {
    const text = 'OAuth client created\nClient ID 123456789012-abcdefghijklmnop.apps.googleusercontent.com\nClient secret GOCSPX-abcDEF123_ghiJKL456-mnoPQR\nOK'
    expect(extractCredentials('google', text)).toEqual({
      googleClientId: '123456789012-abcdefghijklmnop.apps.googleusercontent.com',
      googleClientSecret: 'GOCSPX-abcDEF123_ghiJKL456-mnoPQR'
    })
  })
  it('prefers the labelled Application (client) ID on Microsoft pages', () => {
    const text = 'Directory (tenant) ID : 11111111-2222-3333-4444-555555555555\nApplication (client) ID : AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
    expect(extractCredentials('microsoft', text).microsoftClientId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })
  it('returns nothing when no credentials are on the page', () => {
    expect(extractCredentials('google', 'Welcome to the console')).toEqual({})
  })
})

describe('replyMailto', () => {
  it('opens the mail app with a Re: subject and a friendly starter', () => {
    const link = replyMailto('jane@lender.com', 'Rate lock question', 'Jane Lender')
    expect(link.startsWith('mailto:jane%40lender.com?')).toBe(true)
    expect(decodeURIComponent(link)).toContain('subject=Re: Rate lock question')
    expect(decodeURIComponent(link)).toContain('Hi Jane,')
  })
})
