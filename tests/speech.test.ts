import { describe, expect, it } from 'vitest'
import { briefToSpeech } from '../src/shared/speech'
import type { Brief } from '../src/shared/types'

const brief: Brief = {
  headline: '2 open items, 1 high priority — start at the top.',
  topIssues: [
    { title: 'Vendor contract expires Monday', severity: 'urgent', whyNow: '', nextStep: 'Sign and return the PDF.', sources: [] },
    { title: 'Timesheet question', severity: 'low', whyNow: '', nextStep: 'Reply to Sam.', sources: [] }
  ],
  pulse: [],
  waitingOnYou: ['Quote request - Jane Lender'],
  waitingOnThem: [],
  deadlines: ['Sep 12 — Electric bill due'],
  personal: [],
  sensitiveNotices: [],
  skillSections: [{ skillId: 'bills', title: 'Bills & invoices', icon: '💵', lines: ['‼ Water bill — $42.10 due Sep 20 (City)'] }]
}

describe('briefToSpeech', () => {
  it('reads like a person talking, in order of importance', () => {
    const s = briefToSpeech(brief)
    expect(s.startsWith('2 open items, 1 high priority — start at the top.')).toBe(true)
    expect(s).toContain('2 things need you.')
    expect(s).toContain('Vendor contract expires Monday. Sign and return the PDF.')
    expect(s).toContain('You owe 1 reply.')
    expect(s).toContain('Quote request, from Jane Lender')
    expect(s).toContain('Coming up: Sep 12, Electric bill due.')
    expect(s).toContain('Urgent: Water bill, $42.10 due Sep 20 (City).')
  })
  it('says all caught up when nothing is pending', () => {
    const s = briefToSpeech({ ...brief, topIssues: [], waitingOnYou: [], deadlines: [], skillSections: [] })
    expect(s).toContain("You're all caught up.")
  })
  it('short mode keeps it brief', () => {
    expect(briefToSpeech(brief, { short: true }).length).toBeLessThan(briefToSpeech(brief).length + 1)
  })
})
