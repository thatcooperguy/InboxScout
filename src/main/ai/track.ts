import { generateObject, type LanguageModel } from 'ai'
import { randomUUID } from 'node:crypto'
import type { Classification, IssueRecord, MessageRecord, ProjectRecord } from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'
import { trackingDecisionSchema, type TrackingDecisions } from './schemas'

export function buildTrackingPrompt(
  profile: WorkProfile,
  projects: ProjectRecord[],
  issues: IssueRecord[],
  workMessages: { message: MessageRecord; classification: Classification }[]
): string {
  const lines: string[] = []
  lines.push(
    `You maintain a rolling tracker of the user's ${profile.entityNoun}s and open issues, updated from new work emails.`,
    '',
    `User context: ${profile.workDescription}`,
    '',
    `Existing ${profile.entityNoun}s (id | name | state | current status):`
  )
  if (projects.length === 0) lines.push('(none yet)')
  for (const p of projects) lines.push(`- ${p.id} | ${p.name} | ${p.state} | ${p.statusSummary}`)
  lines.push('', 'Existing open issues (id | severity | title | suggested action):')
  if (issues.length === 0) lines.push('(none yet)')
  for (const i of issues) lines.push(`- ${i.id} | ${i.severity} | ${i.title} | ${i.ownerAction ?? ''}`)
  lines.push(
    '',
    'New work emails since the last run:',
    ''
  )
  for (const { message, classification } of workMessages) {
    lines.push(
      `- From ${message.fromName} <${message.fromAddress}> | Subject: ${message.subject} | Date: ${message.date}`,
      `  Summary: ${classification.actionSummary ?? message.snippet.slice(0, 200)}` +
        (classification.projectHint ? ` | Related to: ${classification.projectHint}` : '') +
        (classification.deadline ? ` | Deadline: ${classification.deadline}` : '')
    )
  }
  lines.push(
    '',
    'Decide updates:',
    `- Link evidence to existing ${profile.entityNoun}s by id (action "update") rather than creating duplicates;`,
    '  match on names, addresses, and aliases loosely.',
    `- Create new ${profile.entityNoun}s only for genuinely new ongoing work streams (not one-off emails).`,
    '- Create issues for things that need the user\'s attention or action; update severity as things escalate;',
    '  resolve issues the new mail shows are settled.',
    '- Keep status summaries short, plain-language, and current.'
  )
  return lines.join('\n')
}

export async function decideTracking(
  model: LanguageModel,
  profile: WorkProfile,
  projects: ProjectRecord[],
  issues: IssueRecord[],
  workMessages: { message: MessageRecord; classification: Classification }[]
): Promise<TrackingDecisions> {
  const prompt = buildTrackingPrompt(profile, projects, issues, workMessages)
  const { object } = await generateObject({ model, schema: trackingDecisionSchema, prompt })
  return object
}

export interface TrackingApplyResult {
  projects: ProjectRecord[]
  issues: IssueRecord[]
}

/**
 * Pure merge of AI tracking decisions into current records.
 * Unknown ids on "update" fall back to creation so nothing is lost;
 * resolve on an unknown id is ignored.
 */
export function applyTrackingDecisions(
  existingProjects: ProjectRecord[],
  existingIssues: IssueRecord[],
  decisions: TrackingDecisions,
  now: string,
  newId: () => string = randomUUID
): TrackingApplyResult {
  const projectsById = new Map(existingProjects.map((p) => [p.id, { ...p }]))
  const issuesById = new Map(existingIssues.map((i) => [i.id, { ...i }]))
  const changedProjects = new Map<string, ProjectRecord>()
  const changedIssues = new Map<string, IssueRecord>()

  for (const d of decisions.projects) {
    const existing = d.action === 'update' && d.id ? projectsById.get(d.id) : undefined
    if (existing) {
      existing.name = d.name || existing.name
      existing.statusSummary = d.statusSummary
      existing.trend = d.trend
      existing.state = d.state
      existing.lastActivity = now
      existing.lastChange = d.whatChanged
      changedProjects.set(existing.id, existing)
    } else {
      const created: ProjectRecord = {
        id: newId(),
        name: d.name,
        statusSummary: d.statusSummary,
        trend: d.trend,
        state: d.state,
        lastActivity: now,
        lastChange: d.whatChanged
      }
      projectsById.set(created.id, created)
      changedProjects.set(created.id, created)
    }
  }

  for (const d of decisions.issues) {
    const existing = d.id ? issuesById.get(d.id) : undefined
    if (d.action === 'resolve') {
      if (existing) {
        existing.state = 'resolved'
        existing.updatedAt = now
        changedIssues.set(existing.id, existing)
      }
      continue
    }
    if (d.action === 'update' && existing) {
      existing.title = d.title || existing.title
      existing.severity = d.severity
      existing.state = existing.state === 'emerging' ? 'active' : existing.state
      existing.ownerAction = d.ownerAction
      existing.deadline = d.deadline
      existing.updatedAt = now
      changedIssues.set(existing.id, existing)
    } else {
      const created: IssueRecord = {
        id: newId(),
        title: d.title,
        severity: d.severity,
        state: 'emerging',
        ownerAction: d.ownerAction,
        deadline: d.deadline,
        createdAt: now,
        updatedAt: now
      }
      issuesById.set(created.id, created)
      changedIssues.set(created.id, created)
    }
  }

  return { projects: [...changedProjects.values()], issues: [...changedIssues.values()] }
}
