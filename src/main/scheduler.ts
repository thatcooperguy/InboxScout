import cron, { type ScheduledTask } from 'node-cron'
import type { RunRecord, ScheduleSettings } from '../shared/types'

export function cronExpression(s: ScheduleSettings): string | null {
  if (s.frequency === 'manual') return null
  if (s.frequency === 'daily') return `${s.minute} ${s.hour} * * *`
  return `${s.minute} ${s.hour} * * ${s.weekday}`
}

/** Meta key: when the last run *started*, whatever its outcome (`lastRunAt` only moves on success). */
export const META_LAST_ATTEMPT_AT = 'last-attempt-at'

/**
 * Catch-up back-off after failed attempts: 15 min, then 1 h, then 6 h between tries.
 * A locked account gets a handful of retries a day instead of one every five minutes
 * (each of which used to inflate the sync-failure counter and fire a notification).
 */
export const CATCHUP_BACKOFF_MS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000]

export interface AttemptState {
  /** ISO time of the last run start (any trigger), or null when never attempted. */
  lastAttemptAt: string | null
  /** Failed runs in a row since the last success. */
  failures: number
}

/** Pure: the attempt state from the run history (newest first) and the stored last-attempt time. */
export function attemptStateFrom(runs: RunRecord[], lastAttemptAt: string | null): AttemptState {
  let failures = 0
  for (const r of runs) {
    if (r.status === 'running') continue
    if (r.status !== 'failed') break
    failures++
  }
  return { lastAttemptAt: lastAttemptAt ?? runs.find((r) => r.status !== 'running')?.startedAt ?? null, failures }
}

export function catchUpBackoffMs(failures: number): number {
  if (failures <= 0) return 0
  return CATCHUP_BACKOFF_MS[Math.min(failures, CATCHUP_BACKOFF_MS.length) - 1]
}

/**
 * Pure catch-up check: true when a scheduled slot was missed between the
 * last completed run and now (laptop asleep or app closed at the slot).
 * With `attempt`, a run that keeps failing is retried on the back-off above rather than at every check.
 */
export function shouldCatchUp(lastRunAt: string | null, s: ScheduleSettings, now: Date, attempt?: AttemptState): boolean {
  if (s.frequency === 'manual') return false
  const prev = previousSlot(s, now)
  if (!prev) return false
  if (now.getTime() < prev.getTime()) return false
  const missed = !lastRunAt || new Date(lastRunAt).getTime() < prev.getTime()
  if (!missed) return false
  if (attempt?.lastAttemptAt && attempt.failures > 0) {
    const since = now.getTime() - new Date(attempt.lastAttemptAt).getTime()
    if (Number.isFinite(since) && since < catchUpBackoffMs(attempt.failures)) return false
  }
  return true
}

/** Most recent schedule slot at or before `now`. */
export function previousSlot(s: ScheduleSettings, now: Date): Date | null {
  if (s.frequency === 'manual') return null
  const slot = new Date(now)
  slot.setHours(s.hour, s.minute, 0, 0)
  if (s.frequency === 'daily') {
    if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1)
    return slot
  }
  // weekly
  const dayDiff = (slot.getDay() - s.weekday + 7) % 7
  slot.setDate(slot.getDate() - dayDiff)
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 7)
  return slot
}

export class Scheduler {
  private task: ScheduledTask | null = null
  private applied = ''
  private catchUpTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private runFn: (trigger: 'scheduled' | 'catchup') => void) {}

  /**
   * Arm the cron job (only when the schedule actually changed — re-arming every few minutes
   * used to re-run the catch-up check each time) and run a catch-up if a slot was missed.
   */
  apply(settings: ScheduleSettings, lastRunAt: string | null, attempt?: AttemptState): void {
    const key = JSON.stringify(settings)
    if (key !== this.applied) {
      this.stop()
      this.applied = key
      const expr = cronExpression(settings)
      if (expr) this.task = cron.schedule(expr, () => this.runFn('scheduled'))
    }
    this.checkCatchUp(settings, lastRunAt, attempt)
  }

  /** Missed a slot while off/asleep? Run shortly after (never two catch-ups queued at once). */
  checkCatchUp(settings: ScheduleSettings, lastRunAt: string | null, attempt?: AttemptState): void {
    if (this.catchUpTimer) return
    if (!shouldCatchUp(lastRunAt, settings, new Date(), attempt)) return
    this.catchUpTimer = setTimeout(() => {
      this.catchUpTimer = null
      this.runFn('catchup')
    }, 15000)
  }

  stop(): void {
    if (this.task) {
      this.task.stop()
      this.task = null
    }
    this.applied = ''
    if (this.catchUpTimer) {
      clearTimeout(this.catchUpTimer)
      this.catchUpTimer = null
    }
  }
}
