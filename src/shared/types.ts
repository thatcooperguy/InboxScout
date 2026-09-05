export type Category = 'personal' | 'work' | 'promotions_noise'
export type Screening = 'needs_reply' | 'fyi' | 'newsletter' | 'cold_pitch' | 'transactional' | 'other'
export type Sensitivity = 'personal_private' | 'company_confidential'
export type Trend = 'up' | 'steady' | 'down'
export type IssueState = 'emerging' | 'active' | 'resolved'
export type IssueSeverity = 'low' | 'medium' | 'high' | 'urgent'
export type ProjectState = 'active' | 'dormant' | 'done'
export type ProviderId = 'gemini' | 'groq' | 'openai' | 'xai' | 'anthropic' | 'ollama'
export type ProfileId = 'owner' | 'realestate' | 'utility' | 'general'
export type ScheduleFrequency = 'daily' | 'weekly' | 'manual'

export interface AccountConfig {
  id: string
  label: string
  email: string
  provider: 'gmail' | 'yahoo' | 'outlook' | 'imap'
  host: string
  port: number
  /** IMAP folders to scan. INBOX plus the sent folder for reply tracking. */
  folders: string[]
  createdAt: string
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

export interface Brief {
  headline: string
  topIssues: BriefIssue[]
  pulse: BriefPulseEntry[]
  waitingOnYou: string[]
  waitingOnThem: string[]
  deadlines: string[]
  personal: string[]
  sensitiveNotices: string[]
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  profileId: 'general',
  schedule: { frequency: 'daily', hour: 7, minute: 30, weekday: 1 },
  ai: { provider: 'gemini', model: '', ollamaBaseUrl: 'http://127.0.0.1:11434/v1' },
  simpleMode: true,
  storeFullBodies: true,
  launchAtLogin: true,
  reportsDir: '',
  lastRunAt: null
}

export interface RunProgress {
  phase: 'fetch' | 'classify' | 'track' | 'brief' | 'save' | 'done' | 'error'
  detail: string
}
