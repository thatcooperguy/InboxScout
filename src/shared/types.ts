export type Category = 'personal' | 'work' | 'promotions_noise'
export type Screening = 'needs_reply' | 'fyi' | 'newsletter' | 'cold_pitch' | 'transactional' | 'other'
export type Sensitivity = 'personal_private' | 'company_confidential'
export type Trend = 'up' | 'steady' | 'down'
export type IssueState = 'emerging' | 'active' | 'resolved'
export type IssueSeverity = 'low' | 'medium' | 'high' | 'urgent'
export type ProjectState = 'active' | 'dormant' | 'done'
export type ProviderId =
  | 'builtin'
  | 'gemini'
  | 'groq'
  | 'openai'
  | 'xai'
  | 'anthropic'
  | 'openrouter'
  | 'mistral'
  | 'deepseek'
  | 'ollama'
  | 'lmstudio'
  | 'custom'
/** Work/life profile id. Fifty-odd built-ins live in src/main/profiles; 'general' is the fallback. */
export type ProfileId = string
export type ProfileGroup = 'business' | 'trades' | 'care' | 'creative' | 'life'
export type ScheduleFrequency = 'daily' | 'weekly' | 'manual'

export interface AccountConfig {
  id: string
  label: string
  email: string
  provider: 'gmail' | 'gmailapi' | 'yahoo' | 'icloud' | 'outlook' | 'imap'
  host: string
  port: number
  /** IMAP folders to scan. INBOX plus the sent folder for reply tracking. */
  folders: string[]
  createdAt: string
}

/** Signals the mail provider itself gives us (Gmail categories, Outlook Focused inbox). */
export interface ProviderHints {
  source: 'gmail' | 'outlook'
  /** Gmail: promotions | social | updates | forums | personal; Outlook: null */
  category: string | null
  important: boolean
  starred: boolean
  unread: boolean
  /** Outlook Focused inbox verdict: true = Focused, false = Other, null = unknown */
  focused: boolean | null
}

export interface MessageRecord {
  id: string
  accountId: string
  folder: string
  uid: number
  messageId: string
  threadKey: string
  fromAddress: string
  fromName: string
  toAddresses: string
  subject: string
  date: string
  snippet: string
  bodyText: string
  fromMe: boolean
  /** Raw List-Unsubscribe header when present (fuel for the future unsubscribe report). */
  listUnsubscribe: string | null
  hasAttachments: boolean
  providerHints?: ProviderHints | null
}

export interface Classification {
  messageId: string
  category: Category
  importance: number
  screening: Screening
  isActionable: boolean
  actionSummary: string | null
  deadline: string | null
  topics: string[]
  projectHint: string | null
  people: string[]
  sensitivity: Sensitivity[]
  runId: string
  model: string
  corrected: boolean
}

export interface ProjectRecord {
  id: string
  name: string
  statusSummary: string
  trend: Trend
  state: ProjectState
  lastActivity: string
  lastChange: string
}

export interface IssueRecord {
  id: string
  title: string
  severity: IssueSeverity
  state: IssueState
  ownerAction: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
}

export interface RunRecord {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'succeeded' | 'failed'
  trigger: 'manual' | 'scheduled' | 'catchup' | 'cli'
  messagesScanned: number
  error: string | null
}

export interface ReportRecord {
  id: string
  runId: string
  periodType: 'daily' | 'weekly'
  createdAt: string
  markdown: string
  html: string
  filePath: string | null
}

export interface BriefIssue {
  /** Present when the issue is tracked in the database (enables "Done"). */
  issueId?: string
  title: string
  severity: IssueSeverity
  whyNow: string
  nextStep: string
  sources: string[]
}

export interface BriefPulseEntry {
  projectName: string
  status: string
  trend: Trend
  whatChanged: string
}

export interface BriefSection {
  skillId: string
  title: string
  icon: string
  lines: string[]
}

export interface Brief {
  headline: string
  topIssues: BriefIssue[]
  pulse: BriefPulseEntry[]
  waitingOnYou: string[]
  waitingOnThem: string[]
  deadlines: string[]
  personal: string[]
  sensitiveNotices: string[]
  /** Sections contributed by enabled skills (bills, appointments, deals...). */
  skillSections: BriefSection[]
  /** Issues closed since the last brief of this period (weekly recap). */
  resolvedRecently?: string[]
  /** Structured reply-tracker entries (for one-click reply drafts). */
  waitingOnYouDetails?: { subject: string; counterpart: string; address: string }[]
}

export interface ScheduleSettings {
  frequency: ScheduleFrequency
  hour: number
  minute: number
  /** 0 = Sunday ... 6 = Saturday. Used when frequency is weekly. */
  weekday: number
}

export interface AiSettings {
  provider: ProviderId
  /** Model override; empty string uses the provider default. */
  model: string
  ollamaBaseUrl: string
  /** Base URL for the "custom" OpenAI-compatible provider. */
  customBaseUrl: string
}

export interface AppSettings {
  profileId: ProfileId
  /** Let InboxScout pick the profile from what the mail looks like (on by default; turn off to lock your choice). */
  profileAuto: boolean
  schedule: ScheduleSettings
  ai: AiSettings
  simpleMode: boolean
  storeFullBodies: boolean
  launchAtLogin: boolean
  reportsDir: string
  lastRunAt: string | null
  /** Skills the user has switched on; null = use the profile's defaults. */
  enabledSkillIds: string[] | null
  /** People whose mail is always important (names or addresses, matched loosely). */
  vipSenders: string[]
  /** Senders to always file as noise. */
  mutedSenders: string[]
  textSize: 'normal' | 'large' | 'xlarge'
  /** Microsoft Entra app (client) ID used for Outlook.com sign-in. */
  microsoftClientId: string
  /** Google OAuth desktop client used for "Sign in with Google" (Gmail API). */
  googleClientId: string
  googleClientSecret: string
  /** Send each brief to this address ('' = off). Uses one of your own accounts as the outbox. */
  deliverEmailTo: string
  /** Text the headline after each run via the carrier's email gateway ('' = off). */
  smsPhone: string
  smsCarrier: string
  /** Also save briefs as Google Docs and keep a Google Sheet tracker (needs Google sign-in). */
  googleDriveExport: boolean
  /** Speak a short summary out loud whenever a scheduled brief is ready. */
  speakBriefs: boolean
  /** Local HTTP bridge so Hermes and other agents on this computer can use InboxScout as a tool. */
  bridgeEnabled: boolean
  bridgePort: number
  /** What other agents may do through the bridge: read-only, or everything (scan, connect, drive the Assistant). */
  bridgeAccess: BridgeAccess
  /** How far the Assistant browser may go on its own. */
  assistantAutonomy: AssistantAutonomy
  /** POST each new brief to an agent (e.g. a Hermes webhook) after every run ('' = off). */
  agentWebhookUrl: string
  /** Optional bearer token sent with the webhook. */
  agentWebhookToken: string
}

/** read: look but don't touch; full: also scan, connect accounts, change preferences, and drive the Assistant. */
export type BridgeAccess = 'read' | 'full'

/**
 * careful: hands every sign-in and risky page to the person.
 * signin: uses saved sign-ins to log in for the person; pauses on risky pages so they can say yes.
 * full: signs in, proceeds through risky pages, and may leave the task's sites — only 2-factor codes are handed over.
 */
export type AssistantAutonomy = 'careful' | 'signin' | 'full'

export const DEFAULT_SETTINGS: AppSettings = {
  profileId: 'general',
  profileAuto: true,
  schedule: { frequency: 'daily', hour: 7, minute: 30, weekday: 1 },
  ai: { provider: 'builtin', model: '', ollamaBaseUrl: 'http://127.0.0.1:11434/v1', customBaseUrl: '' },
  simpleMode: true,
  storeFullBodies: true,
  launchAtLogin: true,
  reportsDir: '',
  lastRunAt: null,
  enabledSkillIds: null,
  vipSenders: [],
  mutedSenders: [],
  textSize: 'normal',
  microsoftClientId: '',
  googleClientId: '',
  googleClientSecret: '',
  deliverEmailTo: '',
  smsPhone: '',
  smsCarrier: '',
  googleDriveExport: false,
  speakBriefs: false,
  bridgeEnabled: false,
  bridgePort: 47311,
  bridgeAccess: 'full',
  assistantAutonomy: 'full',
  agentWebhookUrl: '',
  agentWebhookToken: ''
}

export interface RunProgress {
  phase: 'fetch' | 'classify' | 'track' | 'brief' | 'save' | 'done' | 'error'
  detail: string
}
