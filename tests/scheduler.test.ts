import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cronCalls: string[] = []
vi.mock('node-cron', () => ({
  default: {
    schedule: (expr: string) => {
      cronCalls.push(expr)
      return { stop: () => {} }
    }
  }
}))

import { CATCHUP_BACKOFF_MS, Scheduler, attemptStateFrom, catchUpBackoffMs, cronExpression, previousSlot, shouldCatchUp } from '../src/main/scheduler'
import type { RunRecord, ScheduleSettings } from '../src/shared/types'

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

// v1.4 item 1: a failing account used to trigger a catch-up (and a "scan failed" notification) every five minutes.
describe('catch-up back-off after failed runs', () => {
  const now = new Date(2026, 8, 5, 12, 0)
  const minutesAgo = (m: number): string => new Date(now.getTime() - m * 60000).toISOString()

  it('backs off 15 min, 1 h, then 6 h between attempts', () => {
    expect(catchUpBackoffMs(0)).toBe(0)
    expect(catchUpBackoffMs(1)).toBe(15 * 60 * 1000)
    expect(catchUpBackoffMs(2)).toBe(60 * 60 * 1000)
    expect(catchUpBackoffMs(3)).toBe(6 * 60 * 60 * 1000)
    expect(catchUpBackoffMs(9)).toBe(CATCHUP_BACKOFF_MS[2])
  })

  it('holds the catch-up while the back-off runs and releases it afterwards', () => {
    // Slot at 7:30 was missed (no successful run), the last attempt failed 5 minutes ago.
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(5), failures: 1 })).toBe(false)
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(16), failures: 1 })).toBe(true)
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(16), failures: 2 })).toBe(false)
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(61), failures: 2 })).toBe(true)
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(61), failures: 3 })).toBe(false)
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(6 * 60 + 1), failures: 5 })).toBe(true)
  })

  it('ignores the back-off when the last attempt succeeded or nothing was attempted', () => {
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: minutesAgo(1), failures: 0 })).toBe(true)
    expect(shouldCatchUp(null, daily, now, { lastAttemptAt: null, failures: 3 })).toBe(true)
    // A successful run after the slot needs no catch-up at all, whatever the attempt state says.
    expect(shouldCatchUp(new Date(2026, 8, 5, 7, 31).toISOString(), daily, now, { lastAttemptAt: minutesAgo(1), failures: 0 })).toBe(false)
  })

  it('derives failures-in-a-row and the last attempt from the run history', () => {
    const run = (status: RunRecord['status'], startedAt: string): RunRecord => ({ id: startedAt, startedAt, finishedAt: null, status, trigger: 'catchup', messagesScanned: 0, error: null })
    const runs = [run('running', 't5'), run('failed', 't4'), run('failed', 't3'), run('succeeded', 't2'), run('failed', 't1')]
    expect(attemptStateFrom(runs, 'meta')).toEqual({ lastAttemptAt: 'meta', failures: 2 })
    expect(attemptStateFrom(runs, null)).toEqual({ lastAttemptAt: 't4', failures: 2 })
    expect(attemptStateFrom([run('succeeded', 't1')], null)).toEqual({ lastAttemptAt: 't1', failures: 0 })
    expect(attemptStateFrom([], null)).toEqual({ lastAttemptAt: null, failures: 0 })
  })
})

describe('Scheduler.apply', () => {
  beforeEach(() => {
    cronCalls.length = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('re-arms cron only when the schedule changes, and never queues two catch-ups', () => {
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0))
    const runs: string[] = []
    const s = new Scheduler((t) => runs.push(t))
    s.apply(daily, null)
    s.apply(daily, null)
    s.apply(daily, null)
    expect(cronCalls).toEqual(['30 7 * * *'])
    vi.advanceTimersByTime(20000)
    expect(runs).toEqual(['catchup'])
    s.apply({ ...daily, hour: 8 }, null)
    expect(cronCalls).toEqual(['30 7 * * *', '30 8 * * *'])
    s.stop()
  })

  it('does not run a catch-up while a failed attempt is backing off', () => {
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0))
    const runs: string[] = []
    const s = new Scheduler((t) => runs.push(t))
    s.apply(daily, null, { lastAttemptAt: new Date(2026, 8, 5, 11, 58).toISOString(), failures: 1 })
    vi.advanceTimersByTime(20000)
    expect(runs).toEqual([])
    s.stop()
  })
})
