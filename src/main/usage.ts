import type { DB } from './db/index'
import * as repo from './db/repo'
import { loadSettings, saveSettings } from './settings'
import { PROFILES } from './profiles/profiles'
import { nextLevelState, resolveLevel, scoreLevel, type LevelState, type UiLevel, type UsageSignals } from '../shared/adapt'

/**
 * Local-only usage signals that let the UI adapt. Counts, never content;
 * stored in the local database and never sent anywhere.
 */
const USAGE_KEY = 'usage'
const LEVEL_KEY = 'ui-level-state'

export interface UsageStore {
  installedAt: string | null
  sessions: number
  tabVisits: Record<string, number>
  features: Record<string, number>
  /** Recent scans: new messages and open issues, newest last (max 14). */
  runs: { at: string; newMessages: number; openIssues: number }[]
}

const EMPTY: UsageStore = { installedAt: null, sessions: 0, tabVisits: {}, features: {}, runs: [] }

export function readUsage(db: DB): UsageStore {
  const raw = repo.getMeta(db, USAGE_KEY)
  if (!raw) return { ...EMPTY }
  try {
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    return { ...EMPTY }
  }
}

function writeUsage(db: DB, u: UsageStore): void {
  repo.setMeta(db, USAGE_KEY, JSON.stringify(u))
}

export function recordSession(db: DB): void {
  const u = readUsage(db)
  u.sessions += 1
  if (!u.installedAt) u.installedAt = new Date().toISOString()
  writeUsage(db, u)
}

export function recordTab(db: DB, tab: string): void {
  const u = readUsage(db)
  u.tabVisits[tab] = (u.tabVisits[tab] ?? 0) + 1
  writeUsage(db, u)
}

export function recordFeature(db: DB, feature: string): void {
  const u = readUsage(db)
  u.features[feature] = (u.features[feature] ?? 0) + 1
  writeUsage(db, u)
}

export function recordRun(db: DB, newMessages: number, openIssues: number): void {
  const u = readUsage(db)
  u.runs = [...u.runs, { at: new Date().toISOString(), newMessages, openIssues }].slice(-14)
  writeUsage(db, u)
}

export function readLevelState(db: DB): LevelState | null {
  const raw = repo.getMeta(db, LEVEL_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LevelState
  } catch {
    return null
  }
}

export function currentSignals(db: DB): UsageSignals {
  const u = readUsage(db)
  const s = loadSettings(db)
  const runs = u.runs
  const avg = (pick: (r: UsageStore['runs'][number]) => number): number => (runs.length ? runs.reduce((n, r) => n + pick(r), 0) / runs.length : 0)
  return {
    installedAt: u.installedAt,
    sessions: u.sessions,
    tabVisits: u.tabVisits,
    features: u.features,
    textSize: s.textSize,
    accounts: repo.listAccounts(db).length,
    dailyVolume: avg((r) => r.newMessages),
    issuesPerDay: avg((r) => r.openIssues),
    profileGroup: PROFILES[s.profileId]?.group ?? null,
    profileId: s.profileId,
    bridgeEnabled: s.bridgeEnabled,
    now: new Date().toISOString()
  }
}

export interface UiLevelInfo {
  level: UiLevel
  setting: 'auto' | UiLevel
  /** What the automatic rule would pick right now. */
  suggested: UiLevel
  reasons: string[]
  /** True once, right after an automatic change, until acknowledged. */
  announce: boolean
  previous?: UiLevel
}

/** Re-evaluate (with restraint) and return what the UI should show. */
export function evaluateLevel(db: DB): UiLevelInfo {
  const signals = currentSignals(db)
  const decision = scoreLevel(signals)
  const prev = readLevelState(db)
  const state = nextLevelState(prev, decision, signals)
  if (!prev || state.level !== prev.level || state.reasons.join() !== prev.reasons.join()) repo.setMeta(db, LEVEL_KEY, JSON.stringify(state))
  const s = loadSettings(db)
  return { level: resolveLevel(s.uiLevel, state), setting: s.uiLevel, suggested: decision.level, reasons: state.reasons, announce: s.uiLevel === 'auto' && state.announce, previous: state.previous }
}

export function acknowledgeLevel(db: DB): void {
  const st = readLevelState(db)
  if (st) repo.setMeta(db, LEVEL_KEY, JSON.stringify({ ...st, announce: false }))
}

/** "Keep it the way it was": pin the previous level as an explicit choice. */
export function revertLevel(db: DB): UiLevelInfo {
  const st = readLevelState(db)
  const s = loadSettings(db)
  if (st?.previous) saveSettings(db, { ...s, uiLevel: st.previous })
  acknowledgeLevel(db)
  return evaluateLevel(db)
}
