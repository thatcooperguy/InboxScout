import { randomUUID } from 'node:crypto'
import type {
  Brief,
  Classification,
  IssueRecord,
  IssueSeverity,
  MessageRecord,
  Screening,
  Sensitivity
} from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'
import type { MessageClassificationOutput } from './schemas'
import type { BriefInputs } from './brief'

/**
 * Built-in engine: rule-based classification, issue derivation, and
 * template briefs. No AI account, no network, pure code — this is what
 * makes the app work out of the box for free. Any connected AI backend
 * replaces it with smarter results.
 */

const NOISE_SENDER = /(no-?reply|newsletter|marketing|notification|notifications|updates?|promo|deals|offers|digest|mailer|bounce)@/i
const NOISE_TEXT = /\bunsubscribe\b|view (this|in) browser|% ?off\b|flash sale|limited time|webinar|free shipping/i
const TRANSACTIONAL = /\breceipt\b|order (confirm|#|number)|shipping (confirm|update)|your (order|package|statement)|payment (received|confirmation)|booking confirm/i
const URGENT = /\burgent\b|\basap\b|immediately|final notice|past due|action required|expiring|expires (today|tomorrow)|last chance to (sign|submit)/i
const IMPORTANT = /deadline|due (date|by|on)|invoice|contract|signature|approve|approval|renewal|escalat|overdue|compliance|mandatory/i
const PERSONAL_TEXT = /birthday|anniversary|dinner|family|mom\b|dad\b|school|teacher|doctor|dentist|appointment|vacation|weekend|church|game night|recipe/i
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'comcast.net',
  'att.net'
])
const SENSITIVE_PERSONAL = /\bssn\b|social security|password|passcode|routing number|account number|medical|diagnosis|prescription|w-?2\b|1099\b|tax return|credit card number/i
const SENSITIVE_COMPANY = /\bconfidential\b|\bnda\b|do not (forward|share|distribute)|internal (use )?only|proprietary|trade secret/i
const DATE_PATTERN =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\btomorrow\b|\bend of (?:day|week|month)\b|\bnext (?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i

export function classifyMessageHeuristically(m: MessageRecord, profile: WorkProfile): MessageClassificationOutput {
  const text = `${m.subject}\n${m.bodyText}`.slice(0, 4000)
  const domain = m.fromAddress.split('@')[1] ?? ''

  const isNoise = NOISE_SENDER.test(m.fromAddress) || NOISE_TEXT.test(text)
  const isTransactional = TRANSACTIONAL.test(text)
  const workHints = new RegExp(
    'invoice|contract|meeting|project|client|customer|vendor|order|quote|proposal|schedule|shift|work order|' +
      'payroll|budget|report|deadline|compliance|training|escrow|listing|closing|inspection|offer|lender|title',
    'i'
  )
  const looksPersonal = PERSONAL_TEXT.test(text) || (PERSONAL_DOMAINS.has(domain) && !workHints.test(text))

  // Provider signals (Gmail categories, Outlook Focused/Other) are strong evidence.
  const hints = m.providerHints ?? null
  const hintNoise = hints?.category === 'promotions' || hints?.category === 'social' || hints?.category === 'forums'
  const hintUpdates = hints?.category === 'updates'
  const hintImportant = !!hints && (hints.important || hints.starred)

  let category: MessageClassificationOutput['category']
  if ((isNoise || hintNoise) && !hintImportant) category = 'promotions_noise'
  else if (looksPersonal && !isTransactional) category = 'personal'
  else category = 'work'

  const sensitivity: Sensitivity[] = []
  if (SENSITIVE_PERSONAL.test(text)) sensitivity.push('personal_private')
  if (SENSITIVE_COMPANY.test(text)) sensitivity.push('company_confidential')

  const urgent = URGENT.test(text)
  const important = IMPORTANT.test(text)
  const asksQuestion = /\?/.test(m.subject) || /can you|could you|please (reply|confirm|let me know|advise)|what do you think|are you available/i.test(text)

  let screening: Screening
  if (category === 'promotions_noise') screening = 'newsletter'
  else if (isTransactional || hintUpdates) screening = 'transactional'
  else if (asksQuestion) screening = 'needs_reply'
  else screening = 'fyi'

  let importance = 0
  if (category === 'work') importance = 1
  if (hints?.focused === true) importance = Math.max(importance, 1)
  if (important) importance = 2
  if (hintImportant) importance = Math.max(importance, 2)
  if (urgent) importance = 3
  if (hints?.focused === false && !hintImportant && !urgent) importance = Math.min(importance, 1)
  if (category === 'promotions_noise') importance = 0

  const deadlineMatch = category === 'promotions_noise' ? null : text.match(DATE_PATTERN)
  const deadline = deadlineMatch ? deadlineMatch[0] : null
  const isActionable = category !== 'promotions_noise' && (importance >= 2 || screening === 'needs_reply')

  let actionSummary: string | null = null
  if (isActionable) {
    actionSummary =
      screening === 'needs_reply'
        ? `Reply to ${m.fromName || m.fromAddress} about "${m.subject}"`
        : `Review "${m.subject}" from ${m.fromName || m.fromAddress}`
    if (deadline) actionSummary += ` (mentions ${deadline})`
  }

  return {
    index: 0,
    category,
    importance,
    screening,
    isActionable,
    actionSummary,
    deadline,
    topics: [],
    projectHint: profile.entityNoun === 'deal' && /offer|escrow|closing|listing/i.test(text) ? m.subject : null,
    people: m.fromName ? [m.fromName] : [],
    sensitivity
  }
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/^((re|fw|fwd)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Derive issues directly from high-importance actionable work mail,
 * skipping anything an open issue already covers.
 */
export function deriveIssues(
  existingIssues: IssueRecord[],
  workMessages: { message: MessageRecord; classification: Classification }[],
  now: string,
  newId: () => string = randomUUID
): IssueRecord[] {
  const openTitles = new Set(existingIssues.filter((i) => i.state !== 'resolved').map((i) => normalizeTitle(i.title)))
  const created: IssueRecord[] = []
  for (const { message, classification } of workMessages) {
    if (!classification.isActionable || classification.importance < 2) continue
    const title = message.subject || 'Untitled item'
    const key = normalizeTitle(title)
    if (openTitles.has(key)) continue
    openTitles.add(key)
    const severity: IssueSeverity = classification.importance >= 3 ? 'urgent' : 'high'
    created.push({
      id: newId(),
      title,
      severity,
      state: 'emerging',
      ownerAction: classification.actionSummary,
      deadline: classification.deadline,
      createdAt: now,
      updatedAt: now
    })
  }
  return created
}

const SEVERITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/** Template brief built purely from tracked data — no AI call. */
export function buildBasicBrief(inputs: BriefInputs): Brief {
  const { openIssues, projects, personalMessages, sensitiveMessages, deadlines, replies, skillSections } = inputs
  const sortedIssues = [...openIssues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  )
  const urgentCount = sortedIssues.filter((i) => i.severity === 'urgent' || i.severity === 'high').length
  const headline =
    sortedIssues.length === 0
      ? 'Nothing urgent — your inbox is under control.'
      : `${sortedIssues.length} open item${sortedIssues.length === 1 ? '' : 's'}` +
        (urgentCount > 0 ? `, ${urgentCount} high priority — start at the top.` : ' to review when you have a minute.')
  return {
    headline,
    topIssues: sortedIssues.slice(0, 7).map((i) => ({
      issueId: i.id,
      title: i.title,
      severity: i.severity,
      whyNow: i.deadline ? `Mentions ${i.deadline}.` : `Flagged ${i.severity} from recent mail.`,
      nextStep: i.ownerAction ?? 'Open the email and decide.',
      sources: []
    })),
    pulse: projects
      .filter((p) => p.state === 'active')
      .slice(0, 8)
      .map((p) => ({ projectName: p.name, status: p.statusSummary, trend: p.trend, whatChanged: p.lastChange })),
    waitingOnYou: replies.waitingOnYou.map((t) => `${t.subject} - ${t.counterpart}`),
    waitingOnThem: replies.waitingOnThem.map((t) => `${t.subject} - ${t.counterpart} (${t.daysWaiting}d)`),
    deadlines: deadlines.slice(0, 10),
    skillSections,
    resolvedRecently: inputs.resolvedRecently ?? [],
    waitingOnYouDetails: replies.waitingOnYou.map((t) => ({ subject: t.subject, counterpart: t.counterpart, address: t.address })),
    personal: personalMessages.slice(0, 10).map(({ message }) => `${message.subject} (${message.fromName || message.fromAddress})`),
    sensitiveNotices: sensitiveMessages
      .slice(0, 10)
      .map(
        ({ message, classification }) =>
          `"${message.subject}" from ${message.fromName || message.fromAddress} [${classification.sensitivity.join(', ')}]`
      )
  }
}
