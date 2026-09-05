import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BriefSection, Classification, MessageRecord, ProfileId } from '../../shared/types'
import { BUILTIN_SKILLS } from './library'
import type { Skill, SkillMatch } from './types'

export interface SkillContext {
  vipSenders: string[]
  mutedSenders: string[]
}

/** Skills a profile turns on when the user hasn't chosen explicitly. */
export function defaultSkillIds(profileId: ProfileId): string[] {
  return BUILTIN_SKILLS.filter((s) => s.defaultFor.includes(profileId)).map((s) => s.id)
}

/**
 * Load custom skills from the user's skills folder. Each *.json file is one
 * Skill; malformed files are skipped (returned in `errors`) rather than
 * breaking the run.
 */
export function loadCustomSkills(dir: string): { skills: Skill[]; errors: string[] } {
  const skills: Skill[] = []
  const errors: string[] = []
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'))
        const valid = validateSkill(parsed)
        if (valid) skills.push({ ...valid, custom: true })
        else errors.push(`${file}: missing id, name, match, lineTemplate or sectionTitle`)
      } catch (err: any) {
        errors.push(`${file}: ${String(err?.message ?? err)}`)
      }
    }
  } catch (err: any) {
    errors.push(String(err?.message ?? err))
  }
  return { skills, errors }
}

export function validateSkill(input: any): Skill | null {
  if (!input || typeof input !== 'object') return null
  if (typeof input.id !== 'string' || typeof input.name !== 'string') return null
  if (!Array.isArray(input.match) || typeof input.lineTemplate !== 'string' || typeof input.sectionTitle !== 'string')
    return null
  return {
    id: input.id,
    name: input.name,
    icon: typeof input.icon === 'string' ? input.icon : '🔎',
    description: typeof input.description === 'string' ? input.description : '',
    defaultFor: Array.isArray(input.defaultFor) ? input.defaultFor : [],
    match: input.match.filter((m: unknown) => typeof m === 'string'),
    senderMatch: Array.isArray(input.senderMatch) ? input.senderMatch : undefined,
    extractors: Array.isArray(input.extractors) ? input.extractors : undefined,
    urgentWhen: Array.isArray(input.urgentWhen) ? input.urgentWhen : undefined,
    minImportance: typeof input.minImportance === 'number' ? input.minImportance : undefined,
    forceCategory: input.forceCategory === 'work' || input.forceCategory === 'personal' ? input.forceCategory : undefined,
    lineTemplate: input.lineTemplate,
    sectionTitle: input.sectionTitle,
    promptHint: typeof input.promptHint === 'string' ? input.promptHint : undefined,
    agent: input.agent && input.agent.kind === 'webhook' && typeof input.agent.url === 'string' ? input.agent : undefined
  }
}

/** All skills (built-in + custom) with the enabled set resolved. */
export function resolveSkills(
  profileId: ProfileId,
  enabledIds: string[] | null,
  customSkills: Skill[]
): { all: Skill[]; enabled: Skill[] } {
  const all = [...BUILTIN_SKILLS, ...customSkills]
  const ids = new Set(enabledIds ?? [...defaultSkillIds(profileId), ...customSkills.map((s) => s.id)])
  return { all, enabled: all.filter((s) => ids.has(s.id)) }
}

function safeRegex(source: string, flags = 'i'): RegExp | null {
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function senderMatches(m: MessageRecord, people: string[]): boolean {
  const hay = `${m.fromName} ${m.fromAddress}`.toLowerCase()
  return people.some((p) => p.trim() && hay.includes(p.trim().toLowerCase()))
}

/** Pure: run every enabled skill against one message. */
export function matchSkills(m: MessageRecord, skills: Skill[], ctx: SkillContext): SkillMatch[] {
  const text = `${m.subject}\n${m.fromName} <${m.fromAddress}>\n${m.bodyText}`.slice(0, 6000)
  const matches: SkillMatch[] = []
  for (const skill of skills) {
    let hit = false
    if (skill.id === 'vip') {
      hit = senderMatches(m, ctx.vipSenders)
    } else {
      hit = skill.match.some((p) => safeRegex(p)?.test(text))
      if (!hit && skill.senderMatch) hit = skill.senderMatch.some((p) => safeRegex(p)?.test(m.fromAddress))
    }
    if (!hit) continue
    const extracted: Record<string, string> = {}
    for (const ex of skill.extractors ?? []) {
      const re = safeRegex(ex.pattern, ex.flags ?? 'i')
      const found = re ? text.match(re) : null
      if (found) extracted[ex.field] = (found[1] ?? found[0]).trim()
    }
    const urgent = (skill.urgentWhen ?? []).some((p) => safeRegex(p)?.test(text))
    matches.push({ skillId: skill.id, messageId: m.id, extracted, urgent })
  }
  return matches
}

/** Pure: apply skill effects (and VIP/mute overrides) to a classification. */
export function applySkillEffects(
  m: MessageRecord,
  c: Classification,
  matches: SkillMatch[],
  skills: Skill[],
  ctx: SkillContext
): Classification {
  const out = { ...c }
  if (senderMatches(m, ctx.mutedSenders)) {
    return { ...out, category: 'promotions_noise', importance: 0, isActionable: false, screening: 'newsletter' }
  }
  const byId = new Map(skills.map((s) => [s.id, s]))
  for (const match of matches) {
    const skill = byId.get(match.skillId)
    if (!skill) continue
    // Important skill matches never stay buried in the noise pile.
    if (out.category === 'promotions_noise' && (skill.minImportance ?? 0) >= 2) {
      out.category = skill.forceCategory ?? 'personal'
      out.screening = 'fyi'
    }
    if (skill.forceCategory && skill.id !== 'vip') out.category = skill.forceCategory
    if (skill.minImportance !== undefined) out.importance = Math.max(out.importance, skill.minImportance)
    if (match.urgent) out.importance = 3
    if (out.importance >= 2) out.isActionable = true
    if (match.extracted['dueDate'] && !out.deadline) out.deadline = match.extracted['dueDate']
    if (match.extracted['when'] && !out.deadline) out.deadline = match.extracted['when']
    if (!out.topics.includes(skill.name)) out.topics = [...out.topics, skill.name]
  }
  return out
}

function fill(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .replace(/(due|arriving|—)\s*(\(|$)/g, '$2')
    .trim()
}

/** Pure: group matches into brief sections, one per skill. */
export function buildSkillSections(
  matches: SkillMatch[],
  messages: Map<string, MessageRecord>,
  skills: Skill[]
): BriefSection[] {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const grouped = new Map<string, string[]>()
  for (const match of matches) {
    const skill = byId.get(match.skillId)
    const m = messages.get(match.messageId)
    if (!skill || !m) continue
    const line = fill(skill.lineTemplate, {
      subject: m.subject,
      from: m.fromName || m.fromAddress,
      date: new Date(m.date).toLocaleDateString(),
      ...match.extracted
    })
    const lines = grouped.get(skill.id) ?? []
    if (!lines.includes(line)) lines.push((match.urgent ? '‼ ' : '') + line)
    grouped.set(skill.id, lines)
  }
  return [...grouped.entries()].map(([skillId, lines]) => {
    const skill = byId.get(skillId)!
    return { skillId, title: skill.sectionTitle, icon: skill.icon, lines: lines.slice(0, 12) }
  })
}

/** Prompt guidance from enabled skills for AI backends. */
export function skillPromptHints(skills: Skill[]): string {
  const hints = skills.filter((s) => s.promptHint).map((s) => `- ${s.name}: ${s.promptHint}`)
  return hints.length ? `\nThe user is watching for these kinds of mail:\n${hints.join('\n')}\n` : ''
}

/** Hand matched items to any custom agents (webhooks). Never throws. */
export async function dispatchAgents(
  matches: SkillMatch[],
  messages: Map<string, MessageRecord>,
  skills: Skill[]
): Promise<string[]> {
  const errors: string[] = []
  for (const skill of skills.filter((s) => s.agent)) {
    const items = matches
      .filter((m) => m.skillId === skill.id)
      .map((m) => {
        const msg = messages.get(m.messageId)
        return msg
          ? { subject: msg.subject, from: msg.fromAddress, date: msg.date, snippet: msg.snippet, extracted: m.extracted, urgent: m.urgent }
          : null
      })
      .filter(Boolean)
    if (items.length === 0) continue
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(skill.agent!.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(skill.agent!.headers ?? {}) },
        body: JSON.stringify({ skill: skill.id, items }),
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) errors.push(`${skill.name} agent: HTTP ${res.status}`)
    } catch (err: any) {
      errors.push(`${skill.name} agent: ${String(err?.message ?? err)}`)
    }
  }
  return errors
}

export { escapeRegex }
