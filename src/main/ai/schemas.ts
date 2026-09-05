import { z } from 'zod'

export const messageClassificationSchema = z.object({
  index: z.number().int().describe('Index of the message in the presented batch, starting at 0'),
  category: z.enum(['personal', 'work', 'promotions_noise']),
  importance: z.number().int().min(0).max(3),
  screening: z.enum(['needs_reply', 'fyi', 'newsletter', 'cold_pitch', 'transactional', 'other']),
  isActionable: z.boolean(),
  actionSummary: z.string().nullable().describe('One short sentence: what the user should do, if anything'),
  deadline: z.string().nullable().describe('ISO date or short phrase for any date/deadline mentioned, else null'),
  topics: z.array(z.string()).max(5),
  projectHint: z
    .string()
    .nullable()
    .describe('Name of the ongoing project/deal/job this message belongs to, if identifiable'),
  people: z.array(z.string()).max(5),
  sensitivity: z
    .array(z.enum(['personal_private', 'company_confidential']))
    .describe(
      'Flag personal_private for sensitive personal data (financial, medical, government IDs, credentials); ' +
        'company_confidential for confidential business information. Empty when neither.'
    )
})

export const classificationBatchSchema = z.object({
  results: z.array(messageClassificationSchema)
})

export type MessageClassificationOutput = z.infer<typeof messageClassificationSchema>

export const trackingDecisionSchema = z.object({
  projects: z.array(
    z.object({
      action: z.enum(['create', 'update']),
      id: z.string().nullable().describe('Existing project id when action is update, else null'),
      name: z.string(),
      statusSummary: z.string().describe('One or two sentences: latest status in plain language'),
      trend: z.enum(['up', 'steady', 'down']),
      state: z.enum(['active', 'dormant', 'done']),
      whatChanged: z.string().describe('What changed since the last run, one short sentence')
    })
  ),
  issues: z.array(
    z.object({
      action: z.enum(['create', 'update', 'resolve']),
      id: z.string().nullable().describe('Existing issue id when action is update/resolve, else null'),
      title: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'urgent']),
      ownerAction: z.string().nullable().describe('Suggested next step for the user'),
      deadline: z.string().nullable()
    })
  )
})

export type TrackingDecisions = z.infer<typeof trackingDecisionSchema>

export const briefSchema = z.object({
  headline: z.string().describe('One-sentence plain-language summary of the day/week'),
  topIssues: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'urgent']),
      whyNow: z.string(),
      nextStep: z.string(),
      sources: z.array(z.string()).describe('Short source descriptions, e.g. "3 emails from Acme"')
    })
  ),
  pulse: z.array(
    z.object({
      projectName: z.string(),
      status: z.string(),
      trend: z.enum(['up', 'steady', 'down']),
      whatChanged: z.string()
    })
  ),
  deadlines: z.array(z.string()).describe('Upcoming dates worth knowing, each one short line'),
  personal: z.array(z.string()).describe('Short personal-item lines, e.g. appointments and bills'),
  sensitiveNotices: z
    .array(z.string())
    .describe('One short line per message that contained sensitive or confidential content - a heads-up only')
})

export type BriefOutput = z.infer<typeof briefSchema>
