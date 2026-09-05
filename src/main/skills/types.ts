import type { ProfileId } from '../../shared/types'

/**
 * A Skill is a small, declarative "watcher" that teaches InboxScout about
 * one kind of mail: how to recognise it, which facts to pull out, how urgent
 * it is, what to put in the brief, how to coach an AI backend, and
 * optionally which external agent to hand matches to.
 *
 * Skills are pure data so companies and power users can add their own as
 * JSON files without touching code.
 */
export interface SkillExtractor {
  /** Name of the extracted field, e.g. "amount", "trackingNumber". */
  field: string
  /** Regex source; the first capture group (or whole match) becomes the value. */
  pattern: string
  flags?: string
}

export interface SkillAgent {
  /** Only webhooks for now: matched items are POSTed as JSON. */
  kind: 'webhook'
  url: string
  headers?: Record<string, string>
}

export interface Skill {
  id: string
  name: string
  icon: string
  /** One plain sentence a non-technical person understands. */
  description: string
  /** Profiles that switch this skill on by default. */
  defaultFor: ProfileId[]
  /** Any of these regexes (subject + sender + body) means the skill applies. */
  match: string[]
  /** Optional sender-address regexes that also count as a match. */
  senderMatch?: string[]
  extractors?: SkillExtractor[]
  /** Regexes that make a matched message urgent (importance 3). */
  urgentWhen?: string[]
  /** Minimum importance for any match (0-3). */
  minImportance?: number
  /** Force a category for matched mail (e.g. bills are rarely "noise"). */
  forceCategory?: 'personal' | 'work'
  /** Template for the brief line. {subject} {from} {date} and {field} placeholders. */
  lineTemplate: string
  /** Section title in the brief. */
  sectionTitle: string
  /** Extra guidance injected into AI prompts when this skill is on. */
  promptHint?: string
  agent?: SkillAgent
  /** True for skills loaded from the user's skills folder. */
  custom?: boolean
}

export interface SkillMatch {
  skillId: string
  messageId: string
  extracted: Record<string, string>
  urgent: boolean
}
