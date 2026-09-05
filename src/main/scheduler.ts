import cron, { type ScheduledTask } from 'node-cron'
import type { ScheduleSettings } from '../shared/types'

export function cronExpression(s: ScheduleSettings): string | null {
  if (s.frequency === 'manual') return null
  if (s.frequency === 'daily') return `${s.minute} ${s.hour} * * *`
  return `${s.minute} ${s.hour} * * ${s.weekday}`
}

/**
 * Pure catch-up check: true when a scheduled slot was missed between the
 * last completed run and now (laptop asleep or app closed at the slot).
 */
export function shouldCatchUp(lastRunAt: string | null, s: ScheduleSettings, now: Date): boolean {
  if (s.frequency === 'manual') return false
  const prev = previousSlot(s, now)
  if (!prev) return false
  if (now.getTime() < prev.getTime()) return false
  if (!lastRunAt) return true
  return new Date(lastRunAt).getTime() < prev.getTime()
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

  constructor(private runFn: (trigger: 'scheduled' | 'catchup') => void) {}

  apply(settings: ScheduleSettings, lastRunAt: string | null): void {
    this.stop()
    const expr = cronExpression(settings)
    if (!expr) return
    this.task = cron.schedule(expr, () => this.runFn('scheduled'))
    if (shouldCatchUp(lastRunAt, settings, new Date())) {
      // Missed a slot while off/asleep - run shortly after startup.
      setTimeout(() => this.runFn('catchup'), 15000)
    }
  }

  stop(): void {
    if (this.task) {
      this.task.stop()
      this.task = null
    }
  }
}
