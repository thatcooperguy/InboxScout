import type { DB } from './db/index'
import { getMeta, setMeta } from './db/repo'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types'

export function loadSettings(db: DB): AppSettings {
  const raw = getMeta(db, 'settings')
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      schedule: { ...DEFAULT_SETTINGS.schedule, ...(parsed.schedule ?? {}) },
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai ?? {}) }
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(db: DB, settings: AppSettings): void {
  setMeta(db, 'settings', JSON.stringify(settings))
}
