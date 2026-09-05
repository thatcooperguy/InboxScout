import { describe, expect, it } from 'vitest'
import { renderHtml, renderMarkdown } from '../src/main/reports/render'
import { PROFILES } from '../src/main/profiles/profiles'
import type { Brief } from '../src/shared/types'

const brief: Brief = {
  headline: 'One urgent contract needs your signature today.',
  topIssues: [
    {
      title: 'Vendor contract expires Monday',
      severity: 'urgent',
      whyNow: 'No countersignature yet and the deadline is Monday.',
      nextStep: 'Sign and return the PDF from Jane before end of day.',
      sources: ['3 emails from Acme Corp']
    }
  ],
  pulse: [
    { projectName: 'Website relaunch', status: 'Staging review this week', trend: 'up', whatChanged: 'Design signoff received' },
    { projectName: 'Q4 | budget', status: 'Waiting', trend: 'steady', whatChanged: '2 of 5 in' }
  ],
  waitingOnYou: ['Quote request — Jane Lender'],
  waitingOnThem: ['Lease question — Landlord (9d)'],
  deadlines: ['Sep 12 — Electric bill due'],
  personal: ['Dentist appointment Tuesday 10am'],
  sensitiveNotices: ['"W-2 attached" from payroll@company.com contains personal financial data'],
  skillSections: [{ skillId: 'bills', title: 'Bills & invoices', icon: '💵', lines: ['Electric bill — $128.40 due Sep 12 (City Power)'] }]
}

describe('renderMarkdown', () => {
  const md = renderMarkdown(brief, PROFILES.realestate, 'daily', new Date('2026-09-05T12:00:00Z'))

  it('includes every section with profile vocabulary', () => {
    expect(md).toContain('# Daily Brief')
    expect(md).toContain('Top Emerging Issues')
    expect(md).toContain('Deal Pipeline') // realestate pulse name
    expect(md).toContain('| Deal |') // profile entity noun in table header
    expect(md).toContain('Vendor contract expires Monday')
    expect(md).toContain('Reply tracker')
    expect(md).toContain('You owe 1 reply')
    expect(md).toContain('Dates & deadlines')
    expect(md).toContain('Sensitive items noticed')
    expect(md).toContain('## 💵 Bills & invoices')
    expect(md).toContain('$128.40 due Sep 12')
    expect(md).toContain('nothing has been hidden or redacted')
  })

  it('escapes pipe characters so tables stay intact', () => {
    expect(md).toContain('Q4 \\| budget')
  })

  it('renders to standalone HTML', () => {
    const html = renderHtml(md)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<table>')
    expect(html).toContain('Website relaunch')
  })
})

describe('renderMarkdown sync errors', () => {
  it('surfaces account problems at the top of the brief', () => {
    const md = renderMarkdown(brief, PROFILES.owner, 'daily', new Date(), [
      'mom@yahoo.com: Authentication failed'
    ])
    expect(md).toContain('Account problems')
    expect(md).toContain('mom@yahoo.com: Authentication failed')
  })

  it('omits the section when every account synced', () => {
    const md = renderMarkdown(brief, PROFILES.owner, 'daily', new Date())
    expect(md).not.toContain('Account problems')
  })
})

describe('renderMarkdown edge cases', () => {
  it('handles a completely empty brief', () => {
    const empty: Brief = {
      headline: 'Quiet day.',
      topIssues: [],
      pulse: [],
      waitingOnYou: [],
      waitingOnThem: [],
      deadlines: [],
      personal: [],
      sensitiveNotices: [],
      skillSections: []
    }
    const md = renderMarkdown(empty, PROFILES.general, 'weekly', new Date())
    expect(md).toContain('# Weekly Brief')
    expect(md).toContain('Nothing urgent right now.')
    expect(md).not.toContain('Sensitive items')
    expect(md).not.toContain('Reply tracker')
  })
})
