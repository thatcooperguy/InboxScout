import { generateObject, type LanguageModel } from 'ai'
import type { MessageRecord } from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'
import { classificationBatchSchema, type MessageClassificationOutput } from './schemas'

export const BATCH_SIZE = 20

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface CorrectionExample {
  subject: string
  from: string
  category: string
}

export function buildClassificationPrompt(
  profile: WorkProfile,
  messages: MessageRecord[],
  corrections: CorrectionExample[],
  promptHints = ''
): string {
  const lines: string[] = []
  lines.push(
    'You are an email triage assistant. Classify each email below for this user.',
    '',
    `User context: ${profile.workDescription}`,
    '',
    'Things that make an email urgent or important for this user:',
    ...profile.urgencyHints.map((h) => `- ${h}`),
    '',
    'Categories: "work" (their professional life as described above), "personal" (family, friends, household,',
    'health, personal finance), "promotions_noise" (marketing, newsletters they never engage with, spam-adjacent bulk mail).',
    '',
    'Also flag sensitivity: personal_private for sensitive personal data (financial details, medical, government IDs,',
    'credentials), company_confidential for confidential business information. This is a heads-up flag only.'
  )
  if (promptHints) lines.push(promptHints)
  if (corrections.length > 0) {
    lines.push('', 'The user has corrected past classifications - follow these precedents:')
    for (const c of corrections.slice(0, 10)) {
      lines.push(`- From "${c.from}", subject "${c.subject}" -> ${c.category}`)
    }
  }
  lines.push('', `Classify all ${messages.length} emails. Use the batch index shown for each.`, '')
  messages.forEach((m, i) => {
    lines.push(
      `--- Email index ${i} ---`,
      `From: ${m.fromName} <${m.fromAddress}>`,
      `Subject: ${m.subject}`,
      `Date: ${m.date}`,
      `Body (truncated): ${m.bodyText.slice(0, 1200)}`,
      ''
    )
  })
  return lines.join('\n')
}

export async function classifyBatch(
  model: LanguageModel,
  profile: WorkProfile,
  messages: MessageRecord[],
  corrections: CorrectionExample[],
  promptHints = ''
): Promise<Map<string, MessageClassificationOutput>> {
  const prompt = buildClassificationPrompt(profile, messages, corrections, promptHints)
  const { object } = await generateObject({ model, schema: classificationBatchSchema, prompt })
  const byMessage = new Map<string, MessageClassificationOutput>()
  for (const result of object.results) {
    const msg = messages[result.index]
    if (msg) byMessage.set(msg.id, result)
  }
  return byMessage
}
