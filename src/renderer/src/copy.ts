import type { UiLevel } from '../../shared/adapt'

/**
 * Strings that read differently at each layout level. Simple is grade-5
 * reading level with no product jargon; Pro is short with numbers first.
 * A missing variant falls back to Standard.
 */
type Variants = { simple?: string; standard: string; pro?: string }

export const COPY: Record<string, Variants> = {
  'tab.reports': { standard: 'My briefs', pro: 'Briefs' },
  'tab.review': { standard: 'Inbox review', pro: 'Inbox' },
  'hero.run': { simple: 'Check my email', standard: 'Check my email now', pro: 'Check now' },
  'hero.running': { standard: 'Checking…' },
  'hero.empty.noAccount': {
    simple: 'First, tell me where your email is. Press Connect my email.',
    standard: 'Connect an email account, then check your email to get your first brief.',
    pro: 'No inbox connected. Setup → Email accounts.'
  },
  'hero.empty.noBrief': {
    simple: 'Press the big blue button and I will check your email.',
    standard: 'Press the button to check your email and get your first brief.',
    pro: 'No brief yet. Press R to run.'
  },
  'card.all_clear': {
    simple: 'All good. Nothing needs you today.',
    standard: "You're all caught up. Nothing needs your attention right now.",
    pro: 'Clear · 0 need you · 0 waiting'
  },
  'card.needs_you': { standard: 'Needs you' },
  'card.waiting_on_you': { simple: 'People waiting to hear back', standard: "They're waiting on you", pro: 'Waiting on you' },
  'card.waiting_on_you.hint': {
    simple: 'These people wrote to you and are waiting to hear back.',
    standard: 'Draft reply opens your own mail app with a starter message — you review and send.',
    pro: 'Reply opens your mail app.'
  },
  'card.this_week': { simple: 'Coming up', standard: 'This week', pro: 'This week' },
  'card.promises': { simple: 'Things you said you would do', standard: 'Promises you made', pro: 'Promises' },
  'card.circle': { simple: 'Your people', standard: 'Your circle', pro: 'Circle' },
  'card.pulse': { simple: 'Things I am following', standard: "Topics I'm following", pro: 'Pulse' },
  'card.waiting_on_them': { simple: 'You are waiting on', standard: "You're waiting on", pro: 'Waiting on them' },
  'card.done_recently': { standard: 'Done recently' },
  'card.personal': { standard: 'Personal' },
  'card.sensitive': { simple: 'Private mail I noticed', standard: 'Private or confidential mail spotted', pro: 'Sensitive' },
  'card.regulars': { simple: 'Every week:', standard: 'Every week:', pro: 'Recurring:' },
  'why.button': { simple: 'Why?', standard: 'Why am I seeing this?', pro: 'Why?' },
  'explain.today': {
    simple: 'This is your summary. The top card shows what needs you. Press the big blue button any time to check again.',
    standard: 'Today shows what needs you, who is waiting on a reply, and what is coming up, from every inbox.',
    pro: 'Decisions first, evidence below. R to run, 1–6 for tabs, / to search.'
  },
  'more.show': { simple: 'Show me everything', standard: 'Show more', pro: 'More' },
  'decide.title': { standard: 'Decide today' },
  'decide.why': {
    standard: 'Urgent items, dates within two days, overdue promises, and replies owed to people who matter — the decisions for today, pulled from everything below.'
  }
}

export function t(key: string, level: UiLevel): string {
  const v = COPY[key]
  if (!v) return key
  return (level === 'simple' ? v.simple : level === 'pro' ? v.pro : undefined) ?? v.standard
}

/** "Checked this morning" / "Last checked today at 7:31 am" / "7:31 am · 212 msgs". */
export function lastChecked(when: Date, level: UiLevel, extra?: string): string {
  const now = new Date()
  const sameDay = when.toDateString() === now.toDateString()
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === when.toDateString()
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (level === 'pro') return `${sameDay ? '' : yesterday ? 'yesterday ' : `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} `}${time}${extra ? ` · ${extra}` : ''}`
  if (level === 'simple') {
    if (sameDay) return when.getHours() < 12 ? 'I checked this morning.' : 'I checked today.'
    if (yesterday) return 'I checked yesterday.'
    return `I checked on ${when.toLocaleDateString(undefined, { weekday: 'long' })}.`
  }
  if (sameDay) return `Last checked today at ${time}`
  if (yesterday) return `Last checked yesterday at ${time}`
  return `Last checked ${when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}

/** Words that must never appear in Simple copy. Tested. */
export const SIMPLE_JARGON = ['sync', 'scan', 'imap', 'oauth', 'api', 'provider', 'model', 'classification', 'bridge', 'webhook', 'token', 'mcp', 'rest']
