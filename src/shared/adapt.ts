import type { ProfileGroup } from './types'

/**
 * The evolving UI: InboxScout watches a few local signals (never sent anywhere)
 * and picks how much to show — Simple for a grandparent or a child, Standard
 * for most people, Pro for someone running a company from three inboxes.
 * Pure functions so the rule is testable and explainable.
 */
export type UiLevel = 'simple' | 'standard' | 'pro'
export type UiLevelSetting = 'auto' | UiLevel

export interface UsageSignals {
  installedAt: string | null
  /** App launches. */
  sessions: number
  /** Visits per tab id (today, reports, people, setup, dashboard, review). */
  tabVisits: Record<string, number>
  /** Feature uses: search, correct, export, assistant, voice, bridge, skills, draftReply, done. */
  features: Record<string, number>
  textSize: 'normal' | 'large' | 'xlarge'
  accounts: number
  /** Average new messages per scan over recent runs. */
  dailyVolume: number
  /** Average open issues in recent briefs. */
  issuesPerDay: number
  profileGroup: ProfileGroup | null
  profileId: string | null
  bridgeEnabled: boolean
  now: string
}

export interface LevelDecision {
  level: UiLevel
  score: number
  /** Plain-language reasons, strongest first — shown under "Why this layout?". */
  reasons: string[]
}

const PRO_PROFILES = new Set(['owner', 'manager', 'lawyer', 'finance', 'consultant', 'projectmanager', 'sales', 'developer', 'itadmin', 'physician', 'nonprofit', 'schooladmin'])
const SIMPLE_PROFILES = new Set(['retiree', 'caregiver', 'newcomer', 'student', 'parent', 'homeowner', 'volunteer'])

function sum(rec: Record<string, number>, keys: string[]): number {
  return keys.reduce((n, k) => n + (rec[k] ?? 0), 0)
}

/** Score > 0 leans Pro, < 0 leans Simple. Every point comes with a reason. */
export function scoreLevel(s: UsageSignals): LevelDecision {
  const parts: { weight: number; reason: string | null }[] = []
  const add = (weight: number, reason: string | null): void => {
    parts.push({ weight, reason })
  }
  const days = s.installedAt ? Math.max(0, (new Date(s.now).getTime() - new Date(s.installedAt).getTime()) / 86400000) : 0
  const advanced = sum(s.tabVisits, ['dashboard', 'review'])
  const power = sum(s.features, ['search', 'correct', 'export', 'bridge', 'skills'])

  if (s.accounts >= 2) add(s.accounts >= 3 ? 3 : 2, `${s.accounts} inboxes connected`)
  if (s.dailyVolume >= 60) add(2, `about ${Math.round(s.dailyVolume)} new emails per check`)
  else if (s.dailyVolume > 0 && s.dailyVolume < 15) add(-1, 'a light inbox')
  if (s.issuesPerDay >= 6) add(1, 'several open items most days')
  if (s.profileGroup === 'business') add(2, 'a business profile')
  else if (s.profileGroup === 'life') add(-1, 'a life & home profile')
  if (s.profileId && PRO_PROFILES.has(s.profileId)) add(1, null)
  if (s.profileId && SIMPLE_PROFILES.has(s.profileId)) add(-2, `the ${s.profileId} profile`)
  if (advanced >= 5) add(2, 'you open the Details and Inbox review tabs')
  else if (days >= 14 && advanced === 0 && s.sessions >= 5) add(-1, 'you never needed the advanced tabs')
  if (power >= 3) add(2, 'you search, correct, and export')
  if (s.bridgeEnabled) add(1, 'other agents use InboxScout through the bridge')
  if (s.textSize === 'xlarge') add(-3, 'extra-large text')
  else if (s.textSize === 'large') add(-2, 'large text')
  if ((s.features['voice'] ?? 0) >= 3) add(-1, 'you like it read aloud')

  const score = parts.reduce((n, p) => n + p.weight, 0)
  const level: UiLevel = score >= 4 ? 'pro' : score <= -3 ? 'simple' : 'standard'
  // Explain with the reasons that pushed toward the chosen side, strongest first.
  const side = level === 'pro' ? 1 : level === 'simple' ? -1 : 0
  const reasons = parts
    .filter((p) => p.reason && (side === 0 || Math.sign(p.weight) === side))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map((p) => p.reason!)
    .slice(0, 4)
  if (reasons.length === 0) reasons.push('a balanced layout until InboxScout knows you better')
  return { level, score, reasons }
}

export interface LevelState {
  level: UiLevel
  since: string
  /** Set when the level changed on its own and the person hasn't seen the note yet. */
  announce: boolean
  reasons: string[]
  previous?: UiLevel
}

const MIN_DAYS_BETWEEN_CHANGES = 7
const MIN_SESSIONS_BEFORE_ADAPTING = 3

/**
 * Apply the decision with restraint: the first pick happens right away (so onboarding
 * lands on the right layout), later changes wait at least a week and a few sessions,
 * and every automatic change is announced once with a way back.
 */
export function nextLevelState(prev: LevelState | null, decision: LevelDecision, signals: UsageSignals): LevelState {
  if (!prev) return { level: decision.level, since: signals.now, announce: false, reasons: decision.reasons }
  if (decision.level === prev.level) return { ...prev, reasons: decision.reasons }
  if (signals.sessions < MIN_SESSIONS_BEFORE_ADAPTING) return prev
  const daysSince = (new Date(signals.now).getTime() - new Date(prev.since).getTime()) / 86400000
  if (daysSince < MIN_DAYS_BETWEEN_CHANGES) return prev
  return { level: decision.level, since: signals.now, announce: true, reasons: decision.reasons, previous: prev.level }
}

/** The person's explicit choice always wins. */
export function resolveLevel(setting: UiLevelSetting, state: LevelState | null): UiLevel {
  if (setting !== 'auto') return setting
  return state?.level ?? 'standard'
}

export const LEVEL_LABEL: Record<UiLevel, string> = { simple: 'Simple', standard: 'Standard', pro: 'Pro' }
export const LEVEL_BLURB: Record<UiLevel, string> = {
  simple: 'One big button, big text, only what needs you today.',
  standard: 'The full brief with the tools most people use.',
  pro: 'Everything at a glance: all inboxes, your circle, promises, trends, and shortcuts.'
}
