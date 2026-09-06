import { DEFAULT_SETTINGS, type AppSettings } from './types'
import type { UiLevel } from './adapt'

/**
 * Every setting, explained. The Preferences screen is generated from this list
 * so nothing can appear without a plain "what it does" and "why it's set this way".
 */
export type SettingGroupId = 'basics' | 'looks' | 'get' | 'helpers' | 'advanced'

export interface SettingOption {
  value: string
  label: string
}

export interface SettingDesc {
  /** Dotted path into AppSettings, e.g. 'schedule.frequency'. */
  key: string
  group: SettingGroupId
  label: string
  /** One plain sentence: what changes when you change this. */
  what: string
  /** Why the default is what it is. */
  why: string
  /** Who typically changes it. */
  who?: string
  kind: 'select' | 'toggle' | 'text' | 'password' | 'number' | 'time' | 'list' | 'folder'
  options?: SettingOption[]
  placeholder?: string
  /** Lowest layout level that shows this setting (Simple shows the fewest). */
  minLevel?: UiLevel
  /** Shown only when this predicate holds (e.g. weekday only for weekly schedules). */
  showWhen?: (s: AppSettings) => boolean
  /** True when InboxScout manages this value itself unless you override it. */
  managed?: boolean
  /** A red one-liner for risky values. */
  caution?: string
}

export const SETTING_GROUPS: { id: SettingGroupId; name: string; blurb: string }[] = [
  { id: 'basics', name: 'Basics', blurb: 'What InboxScout does and when.' },
  { id: 'looks', name: 'Reading & display', blurb: 'How much you see and how big it is.' },
  { id: 'get', name: 'What I get', blurb: 'Where your brief goes and what it includes.' },
  { id: 'helpers', name: 'Who can help', blurb: 'The web-chores helper, other AI tools on this computer, and your voice.' },
  { id: 'advanced', name: 'Advanced', blurb: 'Only if you know why you are here.' }
]

const yesNo = (yes: string, no: string): SettingOption[] => [
  { value: 'true', label: yes },
  { value: 'false', label: no }
]

export const SETTINGS_REGISTRY: SettingDesc[] = [
  // ---- Basics ----
  {
    key: 'profileAuto',
    group: 'basics',
    label: 'Choose my profile for me',
    what: 'When on, InboxScout looks at what your mail is about after each check and picks the best-fitting profile (nurse, landlord, retiree, owner…). When off, it keeps the one you picked.',
    why: 'Most people never want to think about this, and the mail itself is the best clue.',
    who: 'Turn it off if you picked a profile on purpose and want it to stay.',
    kind: 'toggle',
    options: yesNo('On — pick from my mail (recommended)', 'Off — keep the profile I chose'),
    managed: true
  },
  {
    key: 'schedule.frequency',
    group: 'basics',
    label: 'Check my email automatically',
    what: 'How often InboxScout checks your mail and writes a new brief without you pressing anything.',
    why: 'A morning brief every day is what most people want; weekly suits a quieter inbox.',
    kind: 'select',
    options: [
      { value: 'daily', label: 'Every day' },
      { value: 'weekly', label: 'Once a week' },
      { value: 'manual', label: 'Only when I press the button' }
    ]
  },
  {
    key: 'schedule.weekday',
    group: 'basics',
    label: 'Which day',
    what: 'The day of the week your weekly brief is made.',
    why: 'Monday morning gives you the week ahead.',
    kind: 'select',
    options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: String(i), label: d })),
    showWhen: (s) => s.schedule.frequency === 'weekly'
  },
  {
    key: 'schedule.time',
    group: 'basics',
    label: 'What time',
    what: 'When the automatic check runs. If the computer was asleep, it runs as soon as it wakes.',
    why: '7:30 in the morning means the brief is ready with your coffee.',
    kind: 'time',
    showWhen: (s) => s.schedule.frequency !== 'manual'
  },
  {
    key: 'launchAtLogin',
    group: 'basics',
    label: 'Start with the computer',
    what: 'Starts InboxScout quietly when you sign in to the computer, so scheduled checks always happen.',
    why: 'Without this, a morning brief only happens if you remember to open the app.',
    kind: 'toggle',
    options: yesNo('Yes — so briefs always arrive (recommended)', "No — I'll open it myself"),
    minLevel: 'standard'
  },

  // ---- Looks ----
  {
    key: 'uiLevel',
    group: 'looks',
    label: 'How much to show',
    what: 'Simple is one big button and only what needs you. Standard is the full brief. Pro is everything at a glance for someone running several inboxes. "Let InboxScout decide" picks from how you use it and changes at most once a week, always with a note.',
    why: 'The right amount is different for a grandparent and a CEO, and it changes as you settle in.',
    who: 'Pick a level yourself if you never want it to change.',
    kind: 'select',
    options: [
      { value: 'auto', label: 'Let InboxScout decide (recommended)' },
      { value: 'simple', label: 'Simple — big and calm' },
      { value: 'standard', label: 'Standard' },
      { value: 'pro', label: 'Pro — dense and complete' }
    ],
    managed: true
  },
  {
    key: 'textSize',
    group: 'looks',
    label: 'Text size',
    what: 'Makes everything in the app bigger or smaller.',
    why: 'Normal fits most screens; Large and Extra large are easier on the eyes and also nudge the layout toward Simple.',
    kind: 'select',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'large', label: 'Large' },
      { value: 'xlarge', label: 'Extra large' }
    ]
  },
  {
    key: 'simpleMode',
    group: 'looks',
    label: 'Advanced tools',
    what: 'Shows the Details and Inbox review tabs, where you can see how every email was sorted and correct it.',
    why: 'Hidden by default so the app stays calm; the Pro layout always shows them.',
    kind: 'toggle',
    options: yesNo('Hide them — keep it simple', 'Show them'),
    minLevel: 'standard'
  },
  {
    key: 'insightsEnabled',
    group: 'looks',
    label: 'Extra cards on Today',
    what: 'Adds cards about your people (who matters, who has gone quiet), this week across every inbox, promises you made, and each inbox. They only appear when there is something to say.',
    why: 'On because they cost nothing when quiet and are the most-loved part of the brief.',
    kind: 'toggle',
    options: yesNo('On — show them when useful (recommended)', 'Off')
  },

  // ---- What I get ----
  {
    key: 'deliverEmailTo',
    group: 'get',
    label: 'Email me my brief',
    what: 'Sends each new brief to this address using one of your own connected accounts as the outbox. Blank means off.',
    why: 'Handy on a phone; InboxScout only ever sends to you.',
    kind: 'text',
    placeholder: 'you@example.com (blank = off)'
  },
  {
    key: 'smsPhone',
    group: 'get',
    label: 'Text me the one-line summary',
    what: 'Sends the one-line headline to this phone as a text, through your carrier\'s free email-to-text gateway. Blank means off.',
    why: 'Free and works on any phone; pick your carrier below.',
    kind: 'text',
    placeholder: '(555) 123-4567 (blank = off)',
    minLevel: 'standard'
  },
  {
    key: 'smsCarrier',
    group: 'get',
    label: 'Your mobile carrier',
    what: 'Needed because texts are sent through the carrier\'s free email-to-text service.',
    why: 'No default — carriers differ and a wrong one silently fails. Not all carriers deliver these reliably; send a test.',
    kind: 'select',
    options: [],
    showWhen: (s) => !!s.smsPhone,
    minLevel: 'standard'
  },
  {
    key: 'speakBriefs',
    group: 'get',
    label: 'Speak my brief out loud',
    what: 'When a scheduled brief is ready, the computer reads a short summary aloud, even with the window closed.',
    why: 'Off because a talking computer at 7:30 am surprises people; turn it on if you prefer listening.',
    who: 'Anyone who would rather listen than read, or who is away from the screen in the morning.',
    kind: 'toggle',
    options: yesNo("Yes — use the computer's voice", 'No')
  },
  {
    key: 'googleDriveExport',
    group: 'get',
    label: 'Save briefs to Google Drive',
    what: 'Also saves each brief as a Google Doc and keeps a Google Sheet of open items. Needs "Sign in with Google".',
    why: 'Off unless you want briefs on every device; you may be asked to sign in again to allow Drive.',
    kind: 'toggle',
    options: yesNo('Yes — Docs and a Sheet tracker', 'No'),
    minLevel: 'standard'
  },
  {
    key: 'storeFullBodies',
    group: 'advanced',
    label: 'Keep a copy of email text on this computer',
    what: 'Lets you search old mail and lets the brief re-check details. Off keeps only short previews.',
    why: 'Search and follow-ups need the text; it stays on this computer and is never sent anywhere unless you connect an AI service.',
    caution: 'Turning this off stops search from working.',
    kind: 'toggle',
    options: yesNo('Yes — enables search (recommended)', 'No — short previews only'),
    minLevel: 'standard'
  },
  {
    key: 'reportsDir',
    group: 'advanced',
    label: 'Where to save briefs',
    what: 'The folder where each brief is saved as a file you can open, print, or share.',
    why: 'Documents is where people look for their files.',
    kind: 'folder',
    minLevel: 'standard'
  },

  // ---- Helpers ----
  {
    key: 'assistantAutonomy',
    group: 'helpers',
    label: 'How far the web-chores helper goes on its own',
    what: 'Full signs in with your saved sign-ins and keeps going; Sign in for me pauses on payment or delete pages; Careful hands every sign-in to you. Verification codes always come to you.',
    why: 'Full so chores finish without interruptions; every step is visible and Stop is always one click away.',
    who: 'Dial it back if you would rather be asked before anything risky.',
    caution: 'Full lets it continue through payment or delete pages when the job calls for it.',
    kind: 'select',
    options: [
      { value: 'full', label: 'Full (recommended)' },
      { value: 'signin', label: 'Sign in for me, but ask on risky pages' },
      { value: 'careful', label: 'Careful — hand sign-ins to me' }
    ]
  },
  {
    key: 'systemControl',
    group: 'helpers',
    label: 'Let InboxScout use my computer',
    what: 'Opens apps and files, types and clicks on your desktop, runs commands, and reads and writes files under your home folder — for the Assistant and any connected agent.',
    why: 'On because chores should just finish. The first time it does each kind of thing, a popup asks you; dangerous things always ask.',
    who: 'Turn it off if you would rather the helper stayed inside its own browser window.',
    caution: 'When on, a connected agent with Full bridge access can do these things too — it will still see the popups.',
    kind: 'select',
    options: [
      { value: 'on', label: 'On — ask the first time for each kind of thing (recommended)' },
      { value: 'off', label: 'Off' }
    ]
  },
  {
    key: 'systemDangerousOverride',
    group: 'helpers',
    label: 'Full autonomy: skip the safety popup for dangerous actions',
    what: "When on, and 'Run commands' is set to Always allow, InboxScout no longer stops to ask before dangerous commands — deleting files, formatting, shutting down, changing passwords, payments. Everything still shows in the Assistant log.",
    why: 'Off, because those popups are the last safety net. Turn it on only if you want the Assistant or a connected agent to run completely unattended.',
    who: 'Power users who run long unattended jobs.',
    caution: 'With this on, a mistake by the AI can delete files or change your system with no chance to say no.',
    kind: 'toggle',
    options: yesNo('On — never ask, even for dangerous commands', 'Off — always ask before dangerous commands (recommended)'),
    showWhen: (s) => s.systemControl === 'on',
    minLevel: 'standard'
  },
  {
    key: 'bridgeEnabled',
    group: 'helpers',
    label: 'Let other AI tools on this computer use InboxScout',
    what: 'Lets another AI tool on this computer — such as Hermes — use InboxScout: read your brief, search mail, check now, run the web-chores helper.',
    why: 'Off so nothing on your PC can read your brief unless you switch it on. Only reachable from this computer, with a secret key.',
    kind: 'toggle',
    options: yesNo('On — other agents on this PC may call InboxScout', 'Off'),
    minLevel: 'standard'
  },
  {
    key: 'bridgeAccess',
    group: 'helpers',
    label: 'What other tools may do',
    what: 'Read only lets them look (brief, mail, status). Full also lets them check now, connect accounts, save sign-ins, change settings, and drive the web-chores helper.',
    why: 'Full, because a tool you chose to connect usually needs to act.',
    caution: 'Full lets a connected tool change settings and connect accounts.',
    kind: 'select',
    options: [
      { value: 'read', label: 'Read only' },
      { value: 'full', label: 'Full' }
    ],
    showWhen: (s) => s.bridgeEnabled,
    minLevel: 'standard'
  },
  {
    key: 'agentWebhookUrl',
    group: 'helpers',
    label: 'Also send each brief to another program',
    what: 'Sends every new brief to this web address (for example a Hermes inbox) so that program can act on it.',
    why: 'Off until you give an address.',
    kind: 'text',
    placeholder: 'https://… (blank = off)',
    minLevel: 'pro'
  },
  {
    key: 'agentWebhookToken',
    group: 'helpers',
    label: 'Secret to send with it (optional)',
    what: 'A secret sent along with the brief so the other program knows it is from InboxScout.',
    why: 'Blank because most local programs do not need one.',
    kind: 'password',
    showWhen: (s) => !!s.agentWebhookUrl,
    minLevel: 'pro'
  },

  // ---- Advanced ----
  {
    key: 'ai.model',
    group: 'advanced',
    label: 'AI model (advanced)',
    what: 'Forces a specific model name for the connected AI service. Leave blank for the recommended one.',
    why: 'Each service\'s recommended model is tested with InboxScout; only change this if you know a model you prefer.',
    kind: 'text',
    placeholder: 'e.g. gemini-2.5-flash',
    minLevel: 'standard'
  },
  {
    key: 'ai.ollamaBaseUrl',
    group: 'advanced',
    label: 'Local AI address (Ollama)',
    what: 'Where to find Ollama if you run a free AI on this computer.',
    why: 'This is Ollama\'s standard address on your own PC.',
    kind: 'text',
    minLevel: 'pro'
  },
  {
    key: 'microsoftClientId',
    group: 'advanced',
    label: 'Microsoft app ID (advanced)',
    what: 'The ID Microsoft gave this copy of InboxScout so "Sign in with Microsoft" works. Official builds include one.',
    why: 'Blank unless the person who installed InboxScout registered it themselves (Sign-in setup).',
    kind: 'text',
    placeholder: '00000000-0000-0000-0000-000000000000',
    minLevel: 'pro'
  },
  {
    key: 'googleClientId',
    group: 'advanced',
    label: 'Google app ID (advanced)',
    what: 'The ID Google gave this copy of InboxScout so "Sign in with Google" works. Official builds include one.',
    why: 'Blank unless the person who installed InboxScout registered it themselves (Sign-in setup).',
    kind: 'text',
    placeholder: 'xxxx.apps.googleusercontent.com',
    minLevel: 'pro'
  },
  {
    key: 'googleClientSecret',
    group: 'advanced',
    label: 'Google app secret (advanced)',
    what: 'The matching secret for the Google app ID. Kept encrypted on this computer.',
    why: 'Only needed with a custom Google app ID.',
    kind: 'password',
    minLevel: 'pro'
  },
  {
    key: 'bridgePort',
    group: 'advanced',
    label: 'Local door number for other tools (advanced)',
    what: 'The local network door number other tools use to reach InboxScout. Only reachable from this computer.',
    why: 'An unusual number that nothing else uses.',
    kind: 'number',
    showWhen: (s) => s.bridgeEnabled,
    minLevel: 'pro'
  }
]

const LEVEL_RANK: Record<UiLevel, number> = { simple: 0, standard: 1, pro: 2 }

export function visibleAt(desc: SettingDesc, level: UiLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[desc.minLevel ?? 'simple']
}

/** Read a dotted key from settings ('schedule.time' is a virtual HH:MM). */
export function getSetting(s: AppSettings, key: string): unknown {
  if (key === 'schedule.time') return `${String(s.schedule.hour).padStart(2, '0')}:${String(s.schedule.minute).padStart(2, '0')}`
  return key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), s)
}

/** Return a new settings object with the dotted key set. */
export function setSetting(s: AppSettings, key: string, value: unknown): AppSettings {
  if (key === 'schedule.time') {
    const [h, m] = String(value).split(':').map(Number)
    return { ...s, schedule: { ...s.schedule, hour: Number.isFinite(h) ? h : s.schedule.hour, minute: Number.isFinite(m) ? m : s.schedule.minute } }
  }
  const parts = key.split('.')
  if (parts.length === 1) return { ...s, [key]: value }
  const [head, ...rest] = parts
  const inner = (s as any)[head] ?? {}
  return { ...s, [head]: setSetting(inner, rest.join('.'), value) } as AppSettings
}

export function defaultOf(key: string): unknown {
  return getSetting(DEFAULT_SETTINGS, key)
}

export function isDefault(s: AppSettings, key: string): boolean {
  return JSON.stringify(getSetting(s, key) ?? '') === JSON.stringify(defaultOf(key) ?? '')
}

/** Search across labels and explanations. */
export function searchSettings(query: string): SettingDesc[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return SETTINGS_REGISTRY
  return SETTINGS_REGISTRY.filter((d) => {
    const hay = `${d.label} ${d.what} ${d.why} ${d.who ?? ''} ${d.key} ${(d.options ?? []).map((o) => o.label).join(' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
