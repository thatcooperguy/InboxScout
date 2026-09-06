import type { ProfileGroup, ProfileId } from '../../shared/types'
import { CORE_PROFILES } from './core'
import { BUSINESS_PROFILES } from './groups/business'
import { TRADES_PROFILES } from './groups/trades'
import { CARE_PROFILES } from './groups/care'
import { CREATIVE_PROFILES } from './groups/creative'
import { LIFE_PROFILES } from './groups/life'

/**
 * A profile describes one kind of person InboxScout works for: what counts as
 * "work" mail, what makes something urgent, what the brief's pulse tracks, which
 * skills to switch on, and how to recognise this person from their mail so the
 * profile can be picked automatically.
 */
export interface ProfileSignal {
  /** Regex source, case-insensitive, matched against "subject | from name <from address> | snippet". */
  pattern: string
  /** How strongly one hit suggests this profile (default 1). Use 2-3 for very specific vocabulary. */
  weight?: number
}

export interface WorkProfile {
  id: ProfileId
  name: string
  group: ProfileGroup
  icon: string
  /** One short line for the picker, in plain words. */
  tagline: string
  pulseName: string
  /** Injected into the classification prompt: what counts as "work" for this person. */
  workDescription: string
  /** Extra hints for what makes an issue urgent for this person. */
  urgencyHints: string[]
  /** Vocabulary for tracked entities, e.g. "project" vs "deal" vs "job" vs "patient". */
  entityNoun: string
  /** Skill ids switched on by default for this profile (plus any skill whose defaultFor lists it). */
  defaultSkills: string[]
  /** Vocabulary and sender patterns that identify this kind of person from their mail. */
  signals: ProfileSignal[]
}

export const PROFILE_GROUPS: { id: ProfileGroup; name: string; icon: string }[] = [
  { id: 'business', name: 'Business & office', icon: '💼' },
  { id: 'trades', name: 'Trades, field & property', icon: '🛠' },
  { id: 'care', name: 'Health, education & public service', icon: '🩺' },
  { id: 'creative', name: 'Creative, tech & independent', icon: '🎨' },
  { id: 'life', name: 'Life & home', icon: '🏡' }
]

const ALL: WorkProfile[] = [...CORE_PROFILES, ...BUSINESS_PROFILES, ...TRADES_PROFILES, ...CARE_PROFILES, ...CREATIVE_PROFILES, ...LIFE_PROFILES]

export const PROFILE_LIST: WorkProfile[] = dedupe(ALL)

export const PROFILES: Record<ProfileId, WorkProfile> = Object.fromEntries(PROFILE_LIST.map((p) => [p.id, p]))

export function getProfile(id: ProfileId): WorkProfile {
  return PROFILES[id] ?? PROFILES.general
}

export function profilesInGroup(group: ProfileGroup): WorkProfile[] {
  return PROFILE_LIST.filter((p) => p.group === group)
}

function dedupe(list: WorkProfile[]): WorkProfile[] {
  const seen = new Set<string>()
  const out: WorkProfile[] = []
  for (const p of list) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}
