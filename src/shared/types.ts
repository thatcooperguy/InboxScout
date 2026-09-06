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
export type ProfileId = 'owner' | 'realestate' | 'utility' | 'general'
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  profileId: 'general',
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
  googleClientSecret: ''
}

export interface RunProgress {
  phase: 'fetch' | 'classify' | 'track' | 'brief' | 'save' | 'done' | 'error'
  detail: string
}
