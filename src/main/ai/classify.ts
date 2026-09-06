import { generateObject, type LanguageModel } from 'ai'
import type { MessageRecord } from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'
import { classificationBatchSchema, type ClassifiableMessage, type MessageClassificationOutput } from './schemas'

export const BATCH_SIZE = 20
/** Chunks classified at the same time (item 3): ~8 serial calls on a 150-message first sync become ~3 rounds. */
export const CLASSIFY_CONCURRENCY = 3

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Run `fn` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const n = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: n }, worker))
  return results
}

/**
 * Item 4: senders and provider categories that the built-in engine already files as noise with certainty.
 * These skip the AI batch (same brief, 40–60 % fewer messages sent). Mirrors NOISE_SENDER in ai/builtin.ts;
 * anything the provider marked important or starred still goes to the AI.
 */
const OBVIOUS_NOISE_SENDER = /(no-?reply|newsletter|marketing|notification|notifications|updates?|promo|deals|offers|digest|mailer|bounce)@/i
const NOISE_CATEGORIES = new Set(['promotions', 'social', 'forums'])
export function isObviousNoise(m: MessageRecord): boolean {
  const hints = m.providerHints ?? null
  if (hints && (hints.important || hints.starred)) return false
  if (OBVIOUS_NOISE_SENDER.test(m.fromAddress)) return true
  return !!hints?.category && NOISE_CATEGORIES.has(hints.category)
}

/** Rate limits and provider hiccups: "429", "503", "overloaded"… — worth one retry before giving up on the AI for this run. */
export const TRANSIENT_AI_RE = /\b(429|5\d\d)\b|too many requests|rate limit|overloaded|temporarily unavailable/i
export const TRANSIENT_RETRY_MS = 2000

/**
 * Extra (a): retry once after a short back-off when the AI helper answers 429/5xx, so a busy free tier
 * does not flip the whole run to the built-in engine on the first blip. Any other error is rethrown at once.
 */
export async function withTransientRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const reason = err instanceof Error ? `${err.message} ${(err as any).statusCode ?? (err as any).status ?? ''}` : String(err)
    if (!TRANSIENT_AI_RE.test(reason)) throw err
    await sleep(TRANSIENT_RETRY_MS)
    return await fn()
  }
}

export interface CorrectionExample {
  subject: string
  from: string
  category: string
}

/** Reads attachments (v1.5): the one sentence that tells the model what the `Attachments:` block is. */
export const ATTACHMENTS_PROMPT_LINE =
  'Some emails include "Attachments": the contents of files attached to this message — treat amounts, dates, and requests in them as part of the message.'

export function buildClassificationPrompt(
  profile: WorkProfile,
  messages: ClassifiableMessage[],
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
  if (messages.some((m) => m.attachments)) lines.push('', ATTACHMENTS_PROMPT_LINE)
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
      ...(m.providerHints ? [`Provider signals: ${describeHints(m.providerHints)}`] : []),
      `Body (truncated): ${m.bodyText.slice(0, 1200)}`,
      ...(m.attachments ? [`Attachments (contents of the attached files): ${m.attachments.slice(0, 3000)}`] : []),
      ''
    )
  })
  return lines.join('\n')
}

function describeHints(h: NonNullable<MessageRecord['providerHints']>): string {
  const parts: string[] = []
  if (h.category) parts.push(`${h.source === 'gmail' ? 'Gmail category' : 'category'} = ${h.category}`)
  if (h.focused === true) parts.push('Outlook Focused inbox')
  if (h.focused === false) parts.push('Outlook "Other" (not focused)')
  if (h.important) parts.push('marked important')
  if (h.starred) parts.push('starred/flagged')
  parts.push(h.unread ? 'unread' : 'already read')
  return parts.join(', ')
}

export async function classifyBatch(
  model: LanguageModel,
  profile: WorkProfile,
  messages: ClassifiableMessage[],
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
