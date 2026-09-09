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
  'hero.firstRun': {
    simple: 'Your first brief takes about a minute. It shows up here when it is ready.',
    standard: 'Your first brief takes about a minute. It appears here the moment it is ready.',
    pro: 'First run: ~1 min.'
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
  'card.scams': { simple: 'Careful. These look like scams', standard: 'Careful — these look like scams', pro: 'Scam guard' },
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
  },

  // ---- Trusted helpers (v1.4, Part A). {name}, {title}, {n}, {time} are filled in by fill(). ----
  'help.button': { simple: 'Ask for help', standard: 'Ask for help', pro: 'Ask' },
  'help.prompt': {
    simple: 'Send this to {name}? You can add a note.',
    standard: 'Send "{title}" to {name} with an optional note. They get the title, the next step, and your note — not the email itself.',
    pro: 'Send to {name}'
  },
  'help.sending': { simple: 'Sending to {name} in {n} seconds.', standard: 'Sending to {name} in {n} s…', pro: '→ {name} in {n}s' },
  'help.cancel': { simple: "Don't send", standard: 'Cancel', pro: 'Cancel' },
  'help.sent': { simple: 'Sent to {name}.', standard: 'Sent to {name} at {time}. See everything you\'ve sent under Setup → Trusted helpers.', pro: 'Sent · {name} · {time}' },
  'help.none': {
    simple: 'First, add a helper. Press Setup, then Trusted helpers.',
    standard: 'No helper yet — add one under Setup → Trusted helpers.',
    pro: 'No helper. Setup → Helpers.'
  },
  'help.paused': { simple: 'Your helpers are paused.', standard: 'Your helpers are paused — turn them back on under Setup → Trusted helpers.', pro: 'Helpers paused.' },
  'help.note': { simple: 'Add a note (you can skip this)', standard: 'A note for them (optional)', pro: 'Note' },
  'help.send': { simple: 'Send', standard: 'Send', pro: 'Send' },
  'help.mailapp': { simple: 'Open in my mail app', standard: 'Open in my mail app — press Send there', pro: 'Open in mail app' },
  'helpers.title': { simple: 'Trusted helpers', standard: 'Trusted helpers', pro: 'Helpers' },
  'helpers.notes': { simple: 'Notes from your helpers', standard: 'Notes from your helpers', pro: 'Helper notes' },
  'helpers.notes.why': {
    simple: 'A helper wrote back to you. This is what they said.',
    standard: 'A helper replied to a note InboxScout sent them. It arrived in your inbox; this is a copy.',
    pro: 'Replies from helpers to InboxScout mail.'
  },
  'helpers.notice': {
    simple: '{name} now gets a copy of what needs you. Press here to change that.',
    standard: '{name} now gets a copy of what needs you. Change this.',
    pro: '{name} gets a copy of what needs you. Change'
  },
  'helpers.setupBy': {
    simple: '{name} set this up for you. {name} gets a short note when something needs you. Press here to change that.',
    standard: '{name} set this up for you and gets a short note when something needs you. Change this.',
    pro: 'Set up by {name}, who gets a note when something needs you. Change'
  },
  'helpers.done': { simple: 'Done', standard: 'Done', pro: 'Done' },

  // ---- Conversation (v1.4, Part B): "Ask about your mail…" ----
  'ask.placeholder': { simple: 'Ask me anything about your email', standard: 'Ask about your mail…', pro: 'Ask…' },
  'ask.button': { standard: 'Ask' },
  'ask.thinking': { simple: 'Thinking…', standard: 'thinking…', pro: 'AI thinking…' },
  'ask.nothing': { simple: 'I could not find anything about that.', standard: 'Nothing found for that.', pro: 'No hits.' },
  'ask.draftOpened': {
    simple: 'I opened a draft. Read it, then press Send in your mail app.',
    standard: 'Draft opened in your mail app — read it, then press Send.',
    pro: 'Draft opened — review and send.'
  },
  'ask.private': {
    simple: 'That email has private details. Open it to read it.',
    standard: 'That message contains private details — open it to read.',
    pro: 'Contains private details — open to read.'
  },
  'ask.unsure': { standard: 'Not sure — these are only word matches.', pro: 'unsure' },
  'ask.voiceHint': { simple: 'You can also press the microphone key on your keyboard and talk.', standard: 'Tip: your computer can type for you — press the microphone key and talk.' },
  'ask.help': {
    simple: 'Try: Who is waiting on me? What do I owe? Did the dentist write back?',
    standard: 'Try "Who is waiting on me?", "What do I owe this month?", "Did the dentist write back?", or "Tell Jane I\'ll sign it Friday".',
    pro: 'Intents: wrote back · owe · when is · waiting · promises · tell · what\'s new · from X · day · health · read. Anything else: search.'
  }
}

/** Fill {name}-style placeholders in a copy string. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m))
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
