import { describe, expect, it } from 'vitest'
import {
  applySkillEffects,
  buildSkillSections,
  defaultSkillIds,
  matchSkills,
  resolveSkills,
  skillPromptHints,
  validateSkill
} from '../src/main/skills/engine'
import { BUILTIN_SKILLS } from '../src/main/skills/library'
import type { Classification, MessageRecord } from '../src/shared/types'

const NOW = '2026-09-05T12:00:00.000Z'
const ctx = { vipSenders: ['Mom', 'boss@acme.com'], mutedSenders: ['deals@store.com'] }

function msg(overrides: Partial<MessageRecord>): MessageRecord {
  return {
    id: 'm1',
    accountId: 'a1',
    folder: 'INBOX',
    uid: 1,
    messageId: '<m1@x>',
    threadKey: 't1',
    fromAddress: 'someone@example.com',
    fromName: 'Someone',
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

function classification(over: Partial<Classification> = {}): Classification {
  return {
    messageId: 'm1',
    category: 'work',
    importance: 1,
    screening: 'fyi',
    isActionable: false,
    actionSummary: null,
    deadline: null,
    topics: [],
    projectHint: null,
    people: [],
    sensitivity: [],
    runId: 'r1',
    model: 'builtin/rules-v1',
    corrected: false,
    ...over
  }
}

describe('skill library & resolution', () => {
  it('gives each profile a sensible default bundle', () => {
    expect(defaultSkillIds('realestate')).toContain('deals')
    expect(defaultSkillIds('utility')).toContain('fieldops')
    expect(defaultSkillIds('general')).not.toContain('deals')
    expect(defaultSkillIds('owner')).toContain('customers')
  })

  it('honours an explicit enabled list and includes custom skills', () => {
    const custom = validateSkill({
      id: 'permits',
      name: 'Permits',
      match: ['permit'],
      lineTemplate: '{subject}',
      sectionTitle: 'Permits'
    })!
    const { all, enabled } = resolveSkills('general', ['bills', 'permits'], [custom])
    expect(all.length).toBe(BUILTIN_SKILLS.length + 1)
    expect(enabled.map((s) => s.id).sort()).toEqual(['bills', 'permits'])
  })

  it('rejects malformed custom skills', () => {
    expect(validateSkill({ id: 'x' })).toBeNull()
    expect(validateSkill(null)).toBeNull()
  })
})

describe('matchSkills', () => {
  const skills = resolveSkills('general', null, []).enabled

  it('extracts amount and due date from a bill', () => {
    const m = msg({ subject: 'Your electric bill is ready', bodyText: 'Amount due: $128.40. Payment due by Sep 12, 2026.' })
    const matches = matchSkills(m, skills, ctx)
    const bill = matches.find((x) => x.skillId === 'bills')!
    expect(bill).toBeTruthy()
    expect(bill.extracted.amount).toBe('$128.40')
    expect(bill.extracted.dueDate).toBe('Sep 12, 2026')
    expect(bill.urgent).toBe(false)
  })

  it('marks past-due bills urgent', () => {
    const m = msg({ subject: 'FINAL NOTICE: past due invoice', bodyText: 'Your invoice of $50.00 is past due.' })
    const bill = matchSkills(m, skills, ctx).find((x) => x.skillId === 'bills')!
    expect(bill.urgent).toBe(true)
  })

  it('pulls tracking numbers from shipping mail', () => {
    const m = msg({ subject: 'Your order has shipped', bodyText: 'Tracking number 1Z999AA10123456784. Arriving Friday.' })
    const ship = matchSkills(m, skills, ctx).find((x) => x.skillId === 'shipping')!
    expect(ship.extracted.tracking).toBe('1Z999AA10123456784')
    expect(ship.extracted.eta?.toLowerCase()).toBe('friday')
  })

  it('recognises VIP senders by name or address', () => {
    expect(matchSkills(msg({ fromName: 'Mom', fromAddress: 'x@y.com' }), skills, ctx).some((x) => x.skillId === 'vip')).toBe(true)
    expect(matchSkills(msg({ fromAddress: 'boss@acme.com' }), skills, ctx).some((x) => x.skillId === 'vip')).toBe(true)
    expect(matchSkills(msg({ fromAddress: 'stranger@acme.com' }), skills, ctx).some((x) => x.skillId === 'vip')).toBe(false)
  })

  it('matches real-estate deal mail only when the deals skill is enabled', () => {
    const m = msg({ subject: 'Counter offer on 42 Maple St', bodyText: 'Inspection contingency expires Sep 10.' })
    expect(matchSkills(m, skills, ctx).some((x) => x.skillId === 'deals')).toBe(false)
    const realtor = resolveSkills('realestate', null, []).enabled
    const deal = matchSkills(m, realtor, ctx).find((x) => x.skillId === 'deals')!
    expect(deal).toBeTruthy()
    expect(deal.extracted.address).toBe('42 Maple St')
    expect(deal.urgent).toBe(true)
  })
})

describe('applySkillEffects', () => {
  const skills = resolveSkills('general', null, []).enabled

  it('boosts importance, sets deadline, and marks actionable', () => {
    const m = msg({ subject: 'Invoice #77', bodyText: 'Invoice total $200.00 due by Oct 1.' })
    const matches = matchSkills(m, skills, ctx)
    const c = applySkillEffects(m, classification({ category: 'promotions_noise', importance: 0 }), matches, skills, ctx)
    expect(c.importance).toBeGreaterThanOrEqual(2)
    expect(c.isActionable).toBe(true)
    expect(c.deadline).toBe('Oct 1')
    expect(c.topics).toContain('Bills & invoices')
    expect(c.category).not.toBe('promotions_noise')
  })

  it('VIP mail becomes importance 3 without changing category', () => {
    const m = msg({ fromName: 'Mom', subject: 'Call me' })
    const c = applySkillEffects(m, classification({ category: 'personal', importance: 0 }), matchSkills(m, skills, ctx), skills, ctx)
    expect(c.importance).toBe(3)
    expect(c.category).toBe('personal')
  })

  it('muted senders are always filed as noise', () => {
    const m = msg({ fromAddress: 'deals@store.com', subject: 'URGENT invoice due' })
    const c = applySkillEffects(m, classification({ importance: 3 }), matchSkills(m, skills, ctx), skills, ctx)
    expect(c.category).toBe('promotions_noise')
    expect(c.importance).toBe(0)
  })
})

describe('buildSkillSections & prompt hints', () => {
  it('renders one section per skill with filled templates', () => {
    const skills = resolveSkills('general', null, []).enabled
    const m = msg({ subject: 'Water bill', fromName: 'City Utilities', bodyText: 'Amount due $42.10 due by Sep 20.' })
    const matches = matchSkills(m, skills, ctx)
    const sections = buildSkillSections(matches, new Map([[m.id, m]]), skills)
    const bills = sections.find((s) => s.skillId === 'bills')!
    expect(bills.title).toBe('Bills & invoices')
    expect(bills.lines[0]).toContain('$42.10')
    expect(bills.lines[0]).toContain('Sep 20')
    expect(bills.lines[0]).toContain('City Utilities')
  })

  it('collects prompt hints only from skills that have them', () => {
    const hints = skillPromptHints(resolveSkills('realestate', null, []).enabled)
    expect(hints).toContain('Real-estate deals')
    expect(hints).toContain('Bills and invoices are always actionable')
  })
})
