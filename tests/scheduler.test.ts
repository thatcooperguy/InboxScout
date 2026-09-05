import { describe, expect, it } from 'vitest'
import { cronExpression, previousSlot, shouldCatchUp } from '../src/main/scheduler'
import type { ScheduleSettings } from '../src/shared/types'

const daily: ScheduleSettings = { frequency: 'daily', hour: 7, minute: 30, weekday: 1 }
const weekly: ScheduleSettings = { frequency: 'weekly', hour: 9, minute: 0, weekday: 1 } // Mondays 9:00
const manual: ScheduleSettings = { frequency: 'manual', hour: 0, minute: 0, weekday: 0 }

describe('cronExpression', () => {
  it('builds daily and weekly expressions and none for manual', () => {
    expect(cronExpression(daily)).toBe('30 7 * * *')
    expect(cronExpression(weekly)).toBe('0 9 * * 1')
    expect(cronExpression(manual)).toBeNull()
  })
})

describe('previousSlot', () => {
  it('finds today\'s slot when already past it', () => {
    const now = new Date(2026, 8, 5, 12, 0) // Sep 5 2026, noon
    const slot = previousSlot(daily, now)!
    expect(slot.getDate()).toBe(5)
    expect(slot.getHours()).toBe(7)
  })
  it('falls back to yesterday before the slot time', () => {
    const now = new Date(2026, 8, 5, 6, 0)
    const slot = previousSlot(daily, now)!
    expect(slot.getDate()).toBe(4)
  })
  it('finds the most recent Monday for weekly schedules', () => {
    const now = new Date(2026, 8, 5, 12, 0) // Sep 5 2026 is a Saturday
    const slot = previousSlot(weekly, now)!
    expect(slot.getDay()).toBe(1)
    expect(slot.getDate()).toBe(31) // Monday Aug 31 2026
  })
})

describe('shouldCatchUp', () => {
  it('never catches up for manual schedules', () => {
    expect(shouldCatchUp(null, manual, new Date())).toBe(false)
  })
  it('catches up when there has never been a run', () => {
    expect(shouldCatchUp(null, daily, new Date(2026, 8, 5, 12, 0))).toBe(true)
  })
  it('catches up when the last run predates the most recent slot (laptop was asleep)', () => {
    const lastRun = new Date(2026, 8, 4, 7, 35).toISOString()
    expect(shouldCatchUp(lastRun, daily, new Date(2026, 8, 5, 12, 0))).toBe(true)
  })
  it('does not catch up when the last run already covered the slot', () => {
    const lastRun = new Date(2026, 8, 5, 7, 31).toISOString()
    expect(shouldCatchUp(lastRun, daily, new Date(2026, 8, 5, 12, 0))).toBe(false)
  })
  it('does not catch up before today\'s slot has arrived', () => {
    const lastRun = new Date(2026, 8, 4, 7, 31).toISOString()
    expect(shouldCatchUp(lastRun, daily, new Date(2026, 8, 5, 6, 0))).toBe(false)
  })
})
