import { describe, expect, it } from 'vitest'
import { buildBasicBrief, classifyMessageHeuristically, deriveIssues } from '../src/main/ai/builtin'
import { PROFILES } from '../src/main/profiles/profiles'
import type { Classification, IssueRecord, MessageRecord } from '../src/shared/types'

const NOW = '2026-09-05T12:00:00.000Z'
let counter = 0
const newId = (): string => `issue-${++counter}`

function msg(overrides: Partial<MessageRecord>): MessageRecord {
  return {
    id: 'm1',
    accountId: 'a1',
    folder: 'INBOX',
    uid: 1,
    messageId: '<m1@x>',
    threadKey: 't1',
    fromAddress: 'jane@acme.com',
    fromName: 'Jane',
    toAddresses: 'me@x.com',
    subject: 'Hello',
    date: NOW,
    snippet: '',
    bodyText: '',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...overrides
  }
}

describe('classifyMessageHeuristically', () => {
  it('sends newsletters and marketing to promotions_noise with zero importance', () => {
    const c = classifyMessageHeuristically(
      msg({ fromAddress: 'newsletter@shop.com', subject: '48-hour flash sale!', bodyText: 'Click to unsubscribe' }),
      PROFILES.general
    )
    expect(c.category).toBe('promotions_noise')
    expect(c.screening).toBe('newsletter')
    expect(c.importance).toBe(0)
    expect(c.isActionable).toBe(false)
  })

  it('flags urgent work mail with a deadline as actionable importance 3', () => {
    const c = classifyMessageHeuristically(
      msg({
        subject: 'URGENT: contract signature required',
        bodyText: 'The vendor contract expires Monday. Action required — please sign the invoice attached.'
      }),
      PROFILES.owner
    )
    expect(c.category).toBe('work')
    expect(c.importance).toBe(3)
    expect(c.isActionable).toBe(true)
    expect(c.deadline?.toLowerCase()).toBe('monday')
    expect(c.actionSummary).toContain('contract signature')
  })

  it('routes family mail from personal domains to personal', () => {
    const c = classifyMessageHeuristically(
      msg({ fromAddress: 'mom@gmail.com', subject: 'Dinner Sunday?', bodyText: 'Family dinner at 6, can you come?' }),
      PROFILES.general
    )
    expect(c.category).toBe('personal')
    expect(c.screening).toBe('needs_reply')
  })

  it('flags sensitive personal and company content', () => {
    const personal = classifyMessageHeuristically(
      msg({ subject: 'Your W-2 is ready', bodyText: 'Your social security number is on file.' }),
      PROFILES.general
    )
    expect(personal.sensitivity).toContain('personal_private')
    const company = classifyMessageHeuristically(
      msg({ subject: 'Q4 plan', bodyText: 'This document is confidential — internal use only.' }),
      PROFILES.owner
    )
    expect(company.sensitivity).toContain('company_confidential')
  })
})

describe('deriveIssues', () => {
  const classification = (over: Partial<Classification>): Classification => ({
    messageId: 'm1',
    category: 'work',
    importance: 3,
    screening: 'needs_reply',
    isActionable: true,
    actionSummary: 'Reply to Jane',
    deadline: 'Monday',
    topics: [],
    projectHint: null,
    people: [],
    sensitivity: [],
    runId: 'r1',
    model: 'builtin/rules-v1',
    corrected: false,
    ...over
  })

  it('creates issues from high-importance actionable mail', () => {
    const issues = deriveIssues([], [{ message: msg({ subject: 'Contract expiring' }), classification: classification({}) }], NOW, newId)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('urgent')
    expect(issues[0].state).toBe('emerging')
    expect(issues[0].deadline).toBe('Monday')
  })

  it('skips low-importance mail and duplicates of open issues', () => {
    const existing: IssueRecord = {
      id: 'i1',
      title: 'Contract expiring',
      severity: 'high',
      state: 'active',
      ownerAction: null,
      deadline: null,
      createdAt: NOW,
      updatedAt: NOW
    }
    const issues = deriveIssues(
      [existing],
      [
        { message: msg({ subject: 'Re: Contract expiring' }), classification: classification({}) },
        { message: msg({ id: 'm2', subject: 'FYI notes' }), classification: classification({ importance: 1 }) }
      ],
      NOW,
      newId
    )
    expect(issues).toHaveLength(0)
  })
})

describe('buildBasicBrief', () => {
  it('builds a complete brief without any AI', () => {
    const brief = buildBasicBrief({
      profile: PROFILES.utility,
      periodType: 'daily',
      projects: [
        { id: 'p1', name: 'Substation upgrade', statusSummary: 'On track', trend: 'up', state: 'active', lastActivity: NOW, lastChange: 'Crew scheduled' },
        { id: 'p2', name: 'Old job', statusSummary: 'Done', trend: 'steady', state: 'done', lastActivity: NOW, lastChange: '' }
      ],
      openIssues: [
        { id: 'i1', title: 'Safety training overdue', severity: 'urgent', state: 'emerging', ownerAction: 'Complete module', deadline: 'Friday', createdAt: NOW, updatedAt: NOW },
        { id: 'i2', title: 'Timesheet question', severity: 'low', state: 'emerging', ownerAction: null, deadline: null, createdAt: NOW, updatedAt: NOW }
      ],
      personalMessages: [],
      sensitiveMessages: [],
      deadlines: ['Friday — Safety training'],
      replies: { waitingOnYou: [{ subject: 'Shift swap?', counterpart: 'Sam', daysWaiting: 1 }], waitingOnThem: [] }
    })
    expect(brief.headline).toContain('2 open items')
    expect(brief.topIssues[0].title).toBe('Safety training overdue') // urgent sorts first
    expect(brief.pulse).toHaveLength(1) // done project excluded
    expect(brief.waitingOnYou[0]).toContain('Shift swap?')
    expect(brief.deadlines).toContain('Friday — Safety training')
  })

  it('produces a calm headline when nothing is open', () => {
    const brief = buildBasicBrief({
      profile: PROFILES.general,
      periodType: 'weekly',
      projects: [],
      openIssues: [],
      personalMessages: [],
      sensitiveMessages: [],
      deadlines: [],
      replies: { waitingOnYou: [], waitingOnThem: [] }
    })
    expect(brief.headline).toContain('under control')
    expect(brief.topIssues).toHaveLength(0)
  })
})
