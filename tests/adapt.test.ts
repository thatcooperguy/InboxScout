import { describe, expect, it } from 'vitest'
import { nextLevelState, resolveLevel, scoreLevel, type UsageSignals } from '../src/shared/adapt'

const base = (over: Partial<UsageSignals> = {}): UsageSignals => ({
  installedAt: '2026-08-01T00:00:00Z',
  sessions: 10,
  tabVisits: {},
  features: {},
  textSize: 'normal',
  accounts: 1,
  dailyVolume: 30,
  issuesPerDay: 2,
  profileGroup: null,
  profileId: 'general',
  bridgeEnabled: false,
  now: '2026-09-06T00:00:00Z',
  ...over
})

describe('adaptive level scoring', () => {
  it('lands a grandparent with large text and a retiree profile on Simple, with reasons', () => {
    const d = scoreLevel(base({ textSize: 'xlarge', profileGroup: 'life', profileId: 'retiree', dailyVolume: 8, features: { voice: 4 } }))
    expect(d.level).toBe('simple')
    expect(d.reasons.join(' ')).toMatch(/extra-large text/)
    expect(d.reasons.length).toBeLessThanOrEqual(4)
  })

  it('lands a CEO with three inboxes and heavy mail on Pro', () => {
    const d = scoreLevel(base({ accounts: 3, dailyVolume: 120, issuesPerDay: 8, profileGroup: 'business', profileId: 'owner', tabVisits: { dashboard: 4, review: 3 } }))
    expect(d.level).toBe('pro')
    expect(d.reasons[0]).toMatch(/3 inboxes/)
  })

  it('keeps an ordinary person on Standard and explains why', () => {
    const d = scoreLevel(base())
    expect(d.level).toBe('standard')
    expect(d.reasons.length).toBeGreaterThan(0)
  })

  it('never flips within a week or before a few sessions, and announces automatic changes', () => {
    const signals = base({ sessions: 2 })
    const first = nextLevelState(null, { level: 'standard', score: 0, reasons: ['x'] }, signals)
    expect(first.level).toBe('standard')
    expect(first.announce).toBe(false)
    // Too few sessions → hold.
    const held = nextLevelState(first, { level: 'pro', score: 5, reasons: ['y'] }, signals)
    expect(held.level).toBe('standard')
    // Enough sessions but same week → hold.
    const sameWeek = nextLevelState(first, { level: 'pro', score: 5, reasons: ['y'] }, base({ sessions: 9, now: '2026-09-08T00:00:00Z' }))
    expect(sameWeek.level).toBe('standard')
    // A week later → change, announced, with the previous level remembered.
    const later = nextLevelState(first, { level: 'pro', score: 5, reasons: ['y'] }, base({ sessions: 9, now: '2026-09-20T00:00:00Z' }))
    expect(later.level).toBe('pro')
    expect(later.announce).toBe(true)
    expect(later.previous).toBe('standard')
  })

  it('lets an explicit choice win over the automatic pick', () => {
    const state = { level: 'pro' as const, since: '2026-09-01', announce: false, reasons: [] }
    expect(resolveLevel('auto', state)).toBe('pro')
    expect(resolveLevel('simple', state)).toBe('simple')
    expect(resolveLevel('auto', null)).toBe('standard')
  })
})
