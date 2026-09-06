import type { DB } from './db/index'
import { getMeta, setMeta } from './db/repo'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types'

/**
 * `lastRunAt` lives in its own meta row: a run used to write it back together with the settings
 * object it loaded at start, which silently undid any preference changed during that run.
 * (Older databases still carry it inside the settings JSON; that value is the fallback.)
 */
export const META_LAST_RUN_AT = 'last-run-at'

export function loadSettings(db: DB): AppSettings {
  const raw = getMeta(db, 'settings')
  const lastRunAt = getMeta(db, META_LAST_RUN_AT)
  if (!raw) return { ...DEFAULT_SETTINGS, lastRunAt }
  try {
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      schedule: { ...DEFAULT_SETTINGS.schedule, ...(parsed.schedule ?? {}) },
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai ?? {}) },
      lastRunAt: lastRunAt ?? parsed.lastRunAt ?? null
    }
  } catch {
    return { ...DEFAULT_SETTINGS, lastRunAt }
  }
}

export function saveSettings(db: DB, settings: AppSettings): void {
  setMeta(db, 'settings', JSON.stringify(settings))
}

/** The only way a run records when it last succeeded — never through `saveSettings`. */
export function markLastRunAt(db: DB, iso: string): void {
  setMeta(db, META_LAST_RUN_AT, iso)
}
