import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { loadSettings, saveSettings } from '../settings'
import { PROFILE_LIST, getProfile, type WorkProfile } from './profiles'
import { detectProfile, type DetectInput, type Detection } from './detect'
import type { AppSettings } from '../../shared/types'

/**
 * "Choose for me": after each scan, look at recent mail and switch the profile
 * when the evidence is clear. When the person has locked their choice, only
 * remember a suggestion for the UI to show.
 */
const SUGGESTION_KEY = 'profile-suggestion'

export interface StoredSuggestion extends Detection {
  at: string
  /** Profile that was active when the suggestion was made. */
  current: string
  dismissed?: boolean
}

export function recentDetectInput(db: DB, limit = 300): DetectInput[] {
  return repo.recentMessagesWithClassification(db, limit).map((m: any) => ({
    subject: String(m.subject ?? ''),
    fromName: String(m.from_name ?? ''),
    fromAddress: String(m.from_address ?? ''),
    snippet: String(m.snippet ?? '')
  }))
}

export function readSuggestion(db: DB): StoredSuggestion | null {
  const raw = repo.getMeta(db, SUGGESTION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSuggestion
  } catch {
    return null
  }
}

export function dismissSuggestion(db: DB): void {
  const s = readSuggestion(db)
  if (s) repo.setMeta(db, SUGGESTION_KEY, JSON.stringify({ ...s, dismissed: true }))
}

/** Run detection now and return it (does not change settings). */
export function detectNow(db: DB): Detection | null {
  return detectProfile(recentDetectInput(db), PROFILE_LIST)
}

export interface AutoProfileResult {
  profile: WorkProfile
  settings: AppSettings
  /** Plain-language note for the run's notices when something changed or is suggested. */
  notice: string | null
  changed: boolean
}

/**
 * Decide whether to switch. Switching requires a high-confidence read, or a
 * medium one when the person is still on the generic default.
 */
export function applyAutoProfile(db: DB, settings: AppSettings): AutoProfileResult {
  const current = getProfile(settings.profileId)
  const detection = detectNow(db)
  if (!detection || detection.id === current.id) {
    return { profile: current, settings, notice: null, changed: false }
  }
  const target = getProfile(detection.id)
  const strong = detection.confidence === 'high' || (detection.confidence === 'medium' && current.id === 'general')
  const previous = readSuggestion(db)
  const store: StoredSuggestion = { ...detection, at: new Date().toISOString(), current: current.id, dismissed: previous?.id === detection.id ? previous.dismissed : false }
  repo.setMeta(db, SUGGESTION_KEY, JSON.stringify(store))

  if (settings.profileAuto && strong && !store.dismissed) {
    const next: AppSettings = { ...settings, profileId: target.id, enabledSkillIds: null }
    saveSettings(db, next)
    return {
      profile: target,
      settings: next,
      notice: `Your profile is now "${target.name}" — ${detection.why} Change or lock it in Setup → Preferences.`,
      changed: true
    }
  }
  if (store.dismissed) return { profile: current, settings, notice: null, changed: false }
  return {
    profile: current,
    settings,
    notice: `Looks like "${target.name}" mail (${detection.why}) — switch profiles in Setup → Preferences if that fits.`,
    changed: false
  }
}

/** Reload settings after a possible switch elsewhere (keeps callers simple). */
export function currentProfile(db: DB): WorkProfile {
  return getProfile(loadSettings(db).profileId)
}
