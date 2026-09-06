import type { RunProgress } from './types'

/**
 * Pure helpers behind the Today step bar (v1.4 item 10): which of the five pipeline phases a
 * progress event belongs to, how long the last successful run took, and a rough "time left".
 */

/** The five pipeline phases in order, with plain labels. */
export const RUN_PHASES: { phase: RunProgress['phase']; label: string }[] = [
  { phase: 'fetch', label: 'Checking mail' },
  { phase: 'classify', label: 'Sorting' },
  { phase: 'track', label: 'Following up' },
  { phase: 'brief', label: 'Writing' },
  { phase: 'save', label: 'Saving' }
]

/** 1-based step for a phase (done/error count as the last step). */
export function stepOf(phase: RunProgress['phase'] | undefined): number {
  const i = RUN_PHASES.findIndex((p) => p.phase === phase)
  return i < 0 ? RUN_PHASES.length : i + 1
}

/** Seconds the last successful run took (runs newest first), or null when there is none to learn from. */
export function lastRunSeconds(runs: { status: string; startedAt: string; finishedAt: string | null }[]): number | null {
  for (const r of runs ?? []) {
    if (r.status !== 'succeeded' || !r.finishedAt) continue
    const s = (new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000
    if (Number.isFinite(s) && s > 0) return s
  }
  return null
}

/** "about 40 seconds left" / "about 2 minutes left" from the step reached and the last run's length; null when unknown. */
export function remainingLabel(step: number, total: number, lastSeconds: number | null): string | null {
  if (!lastSeconds || total <= 0) return null
  const left = Math.max(5, Math.round((lastSeconds * (total - step + 1)) / total))
  if (left < 60) return `about ${Math.max(5, Math.round(left / 5) * 5)} seconds left`
  const m = Math.round(left / 60)
  return `about ${m} minute${m === 1 ? '' : 's'} left`
}

/** Standard layout slots (item 15): dated and people things on the right, things to do on the left. Same order at every level. */
const RIGHT_SLOTS = new Set(['this_week', 'coming_up', 'circle', 'pulse'])
export function slotOf(cardId: string): 'left' | 'right' {
  return RIGHT_SLOTS.has(cardId) || cardId.startsWith('skill:') ? 'right' : 'left'
}
