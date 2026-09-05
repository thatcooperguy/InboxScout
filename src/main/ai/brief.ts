import { generateObject, type LanguageModel } from 'ai'
import type { Brief, BriefSection, Classification, IssueRecord, MessageRecord, ProjectRecord } from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'
import { briefSchema } from './schemas'
import type { ReplyTrackerResult } from '../pipeline/replies'

export interface BriefInputs {
  profile: WorkProfile
  periodType: 'daily' | 'weekly'
  projects: ProjectRecord[]
  openIssues: IssueRecord[]
  personalMessages: { message: MessageRecord; classification: Classification }[]
  sensitiveMessages: { message: MessageRecord; classification: Classification }[]
  deadlines: string[]
  replies: ReplyTrackerResult
  /** Sections built deterministically by enabled skills. */
  skillSections: BriefSection[]
  /** Guidance from enabled skills for the AI. */
  promptHints?: string
  resolvedRecently?: string[]
}

export function buildBriefPrompt(inputs: BriefInputs): string {
  const { profile, projects, openIssues, personalMessages, sensitiveMessages, deadlines } = inputs
  const lines: string[] = []
  lines.push(
    `Write the user's ${inputs.periodType} email brief. Plain language, no jargon, scannable in 30 seconds.`,
    '',
    `User context: ${profile.workDescription}`,
    inputs.promptHints ?? '',
    '',
    `Open issues (severity | title | suggested action | deadline):`
  )
  if (openIssues.length === 0) lines.push('(none)')
  for (const i of openIssues) lines.push(`- ${i.severity} | ${i.title} | ${i.ownerAction ?? ''} | ${i.deadline ?? ''}`)
  lines.push('', `${profile.pulseName} - tracked ${profile.entityNoun}s (name | state | status | latest change):`)
  if (projects.length === 0) lines.push('(none)')
  for (const p of projects) lines.push(`- ${p.name} | ${p.state} | ${p.statusSummary} | ${p.lastChange}`)
  lines.push('', 'Personal items noticed:')
  if (personalMessages.length === 0) lines.push('(none)')
  for (const { message, classification } of personalMessages.slice(0, 15)) {
    lines.push(`- ${message.subject} (from ${message.fromName || message.fromAddress})` +
      (classification.deadline ? ` - ${classification.deadline}` : ''))
  }
  lines.push('', 'Dates and deadlines extracted from mail:')
  if (deadlines.length === 0) lines.push('(none)')
  for (const d of deadlines.slice(0, 15)) lines.push(`- ${d}`)
  if (sensitiveMessages.length > 0) {
    lines.push('', 'Messages flagged as containing sensitive or confidential content (heads-up only, do not quote the sensitive details):')
    for (const { message, classification } of sensitiveMessages.slice(0, 10)) {
      lines.push(`- "${message.subject}" from ${message.fromName || message.fromAddress} [${classification.sensitivity.join(', ')}]`)
    }
  }
  lines.push(
    '',
    'Produce:',
    '- headline: one sentence on the overall state.',
    '- topIssues: rank the open issues by urgency x importance, keep at most 7, each with whyNow and a concrete nextStep.',
    `- pulse: the top ${profile.entityNoun}s with current status, trend, and whatChanged (skip done/dormant unless notable).`,
    '- deadlines: short lines for upcoming dates.',
    '- personal: short lines for personal items worth noticing.',
    '- sensitiveNotices: one short line per sensitive-flagged message, naming subject and sender only.'
  )
  return lines.join('\n')
}

export async function generateBrief(model: LanguageModel, inputs: BriefInputs): Promise<Brief> {
  const prompt = buildBriefPrompt(inputs)
  const { object } = await generateObject({ model, schema: briefSchema, prompt })
  return {
    headline: object.headline,
    topIssues: object.topIssues,
    pulse: object.pulse,
    waitingOnYou: inputs.replies.waitingOnYou.map((t) => `${t.subject} - ${t.counterpart}`),
    waitingOnThem: inputs.replies.waitingOnThem.map((t) => `${t.subject} - ${t.counterpart} (${t.daysWaiting}d)`),
    deadlines: object.deadlines,
    personal: object.personal,
    sensitiveNotices: object.sensitiveNotices,
    skillSections: inputs.skillSections,
    resolvedRecently: inputs.resolvedRecently ?? []
  }
}
