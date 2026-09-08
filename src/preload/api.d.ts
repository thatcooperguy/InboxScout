import type { Answer, AttachmentInfo, HealthReport, Helper, HelperCadence, HelperLevel, HelperSend } from '../shared/types'

export interface BridgeInfo {
  enabled: boolean
  running: boolean
  port: number
  token: string
  url: string
  mcpUrl: string
  access: 'read' | 'full'
}

/** "InboxScout on your phone" (Setup → On your phone). */
export interface PhoneInfo {
  enabled: boolean
  running: boolean
  port: number
  /** This computer's Wi‑Fi address, or null when it is not on a network. */
  address: string | null
  /** The link the QR code holds (null without an address). */
  url: string | null
  qrDataUrl: string | null
  token: string
  /** Plain-words reason the server is not running when it should be ('' when fine). */
  error: string
}

export interface ProfileSummary {
  id: string
  name: string
  group: string
  icon: string
  tagline: string
  pulseName: string
}

export interface ProfileSuggestion {
  id: string
  name: string
  confidence: 'high' | 'medium' | 'low'
  why: string
}

export interface UiLevelInfo {
  level: 'simple' | 'standard' | 'pro'
  setting: 'auto' | 'simple' | 'standard' | 'pro'
  suggested: 'simple' | 'standard' | 'pro'
  reasons: string[]
  announce: boolean
  previous?: 'simple' | 'standard' | 'pro'
}

export interface InboxScoutApi {
  getSettings: () => Promise<any>
  setSettings: (settings: unknown) => Promise<any>
  listProfiles: () => Promise<ProfileSummary[]>
  profileGroups: () => Promise<{ id: string; name: string; icon: string }[]>
  profileStatus: () => Promise<{ profileId: string; profileAuto: boolean; suggestion: ProfileSuggestion | null }>
  chooseProfile: (id: string | 'auto') => Promise<any>
  detectProfile: () => Promise<ProfileSuggestion | null>
  dismissProfileSuggestion: () => Promise<boolean>

  listAccounts: () => Promise<any[]>
  accountPresets: () => Promise<Record<string, { host: string; port: number; sentFolder: string; help: string; helpUrl: string }>>
  addAccount: (input: unknown) => Promise<any>
  removeAccount: (id: string) => Promise<boolean>
  appPasswordStart: (provider: string, email: string) => Promise<{ ok: boolean; message?: string }>
  appPasswordStop: () => Promise<boolean>
  onAppPasswordEvent: (cb: (e: { status: 'opened' | 'captured' | 'done' | 'failed' | 'closed'; provider: string; email: string; message: string }) => void) => () => void
  outlookSignIn: () => Promise<any>
  googleSignIn: () => Promise<any>
  openExternal: (url: string) => Promise<boolean>
  onOutlookDeviceCode: (cb: (info: { userCode: string; verificationUri: string; message: string }) => void) => () => void
  exportReportPdf: (id: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>
  exportCsv: () => Promise<{ ok: boolean; filePath?: string; error?: string }>
  exportIcs: () => Promise<{ ok: boolean; filePath?: string; error?: string; count?: number }>
  deliveryCarriers: () => Promise<{ id: string; name: string }[]>
  deliveryTest: (kind: 'email' | 'sms') => Promise<{ ok: boolean; error?: string }>
  agentRecipes: () => Promise<{ recipes: any[]; aiReady: boolean; autonomy: 'careful' | 'signin' | 'full'; signins: string[] }>
  agentSetAutonomy: (autonomy: string) => Promise<'careful' | 'signin' | 'full'>
  signinsList: () => Promise<string[]>
  signinsSave: (email: string, password: string) => Promise<string[]>
  signinsDelete: (email: string) => Promise<string[]>
  agentStart: (input: unknown) => Promise<{ ok: boolean; summary?: string }>
  agentAnswer: (text: string) => Promise<boolean>
  agentContinue: () => Promise<boolean>
  agentStop: () => Promise<boolean>
  agentStatus: () => Promise<{ status: string; log: string[]; captured: Record<string, string>; task: any }>
  agentCloseWindow: () => Promise<boolean>
  onAgentEvent: (cb: (e: any) => void) => () => void
  bridgeInfo: () => Promise<BridgeInfo>
  bridgeSetEnabled: (enabled: boolean) => Promise<BridgeInfo>
  bridgeRegenerate: () => Promise<BridgeInfo>
  bridgeSetAccess: (access: string) => Promise<BridgeInfo>
  phoneInfo: () => Promise<PhoneInfo>
  phoneSet: (on: boolean) => Promise<PhoneInfo>
  phoneRegenerate: () => Promise<PhoneInfo>
  setupInfo: () => Promise<{
    google: { steps: any[]; configured: boolean; baked: boolean }
    microsoft: { steps: any[]; configured: boolean; baked: boolean }
  }>
  setupStart: (kind: string, step: number) => Promise<boolean>
  setupGoto: (kind: string, step: number) => Promise<boolean>
  setupStop: () => Promise<boolean>
  onSetupEvent: (cb: (p: any) => void) => () => void
  resolveIssue: (id: string) => Promise<boolean>
  reopenIssue: (id: string) => Promise<boolean>

  aiProviders: () => Promise<any[]>
  aiDetect: () => Promise<{ provider: string; kind: string; detail: string; hasKey: boolean }[]>
  aiConnectDetected: (provider: string) => Promise<{ ok: boolean; error?: string }>
  aiConnect: (input: unknown) => Promise<{ ok: boolean; error?: string }>
  aiDisconnect: (provider: string) => Promise<boolean>
  aiOpenKeyPage: (provider: string) => Promise<boolean>

  skillsList: () => Promise<{ skills: any[]; errors: string[]; folder: string }>
  skillsSetEnabled: (ids: string[]) => Promise<boolean>
  skillsOpenFolder: () => Promise<string>
  latestBrief: () => Promise<{ brief: any; createdAt: string; reportId: string } | null>

  runNow: () => Promise<{ started: boolean; reason?: string }>
  listRuns: () => Promise<any[]>
  listReports: () => Promise<any[]>
  getReport: (id: string) => Promise<any | null>
  openReportFile: (path: string) => Promise<string>

  listIssues: () => Promise<any[]>
  listProjects: () => Promise<any[]>
  recentMessages: (limit: number) => Promise<any[]>
  chooseDir: (current: string) => Promise<string | null>
  track: (kind: 'tab' | 'feature', name: string) => Promise<boolean>
  uiLevel: () => Promise<UiLevelInfo>
  uiAckLevel: () => Promise<UiLevelInfo>
  uiRevertLevel: () => Promise<UiLevelInfo>
  uiSetLevel: (setting: 'auto' | 'simple' | 'standard' | 'pro') => Promise<UiLevelInfo>
  listPeople: () => Promise<any[]>
  markPerson: (address: string, how: 'important' | 'quiet' | 'clear') => Promise<boolean>
  searchMessages: (query: string) => Promise<any[]>
  correctMessage: (input: unknown) => Promise<boolean>

  // Reads attachments and photos (v1.5). One id or many; the result is flat (group by messageId).
  listAttachments: (messageIds: string | string[]) => Promise<AttachmentInfo[]>
  /** Opens the stored file with the default app. Resolves to '' when it opened, else a plain-words reason. */
  openAttachment: (id: string) => Promise<string>

  // System control (v1.1). Renderer-side typing added by the UI agent as a last resort so typecheck passes;
  // the preload agent owns the real implementation — if these lines are duplicated after merge, keep one copy.
  systemStatus: () => Promise<{ enabled: boolean; consents: Partial<Record<string, 'always' | 'never'>>; platform: string }>
  systemSetConsent: (kind: string, value: 'always' | 'never' | null) => Promise<unknown>
  systemReset: () => Promise<unknown>

  // Self-healing (v1.2). Renderer-side typing added by the UI agent as a last resort so typecheck passes;
  // the health agent owns the real implementation — if these lines are duplicated after merge, keep one copy.
  healthStatus: () => Promise<HealthReport>
  healthRepair: () => Promise<HealthReport>
  diagnosticsText: () => Promise<string>
  diagnosticsOpen: () => Promise<boolean>
  /** Fired after the automatic health pass at startup and after every run. */
  onHealthReport: (cb: (r: HealthReport) => void) => () => void

  // Trusted helpers (v1.4, Part A). The person's own screen sees full contact details; the bridge and phone see them masked.
  helpersList: () => Promise<{ helpers: Helper[]; paused: boolean; setupBy: 'me' | 'someone_else' | null; helperNoticeUntil: string | null }>
  helpersAdd: (input: { name: string; relationship?: string; email?: string; phone?: string; carrier?: string; level?: HelperLevel; cadence?: HelperCadence; weekday?: number; addedBy?: 'person' | 'helper_setup' }) => Promise<Helper>
  helpersUpdate: (id: string, patch: Partial<Pick<Helper, 'name' | 'relationship' | 'email' | 'phone' | 'carrier' | 'level' | 'cadence' | 'weekday' | 'paused'>>) => Promise<Helper>
  helpersRemove: (id: string) => Promise<{ ok: boolean }>
  /** Queues the message; it goes after 10 seconds unless helpersCancel(sendId) is called first. */
  helpersAsk: (input: { helperId: string; title: string; nextStep?: string; whyNow?: string; note?: string }) => Promise<{ sendId: string; sendsAt: string; helperName: string; outboxMissing: boolean; mailto: string | null }>
  helpersCancel: (sendId: string) => Promise<{ cancelled: boolean }>
  helpersLog: (limit?: number, helperId?: string) => Promise<HelperSend[]>
  helpersPauseAll: (paused: boolean) => Promise<{ paused: boolean }>
  helpersSetSetupBy: (setupBy: 'me' | 'someone_else' | null) => Promise<boolean>
  helpersDismissNotice: () => Promise<boolean>

  onRunProgress: (cb: (p: any) => void) => () => void
  onRunFinished: (cb: (r: any) => void) => () => void

  // Conversation (v1.4, Part B): "Ask about your mail…".
  /** The local answer, at once. `aiPending` = an AI answer will follow on onAskAnswer with the same id. */
  ask: (q: string, id?: string) => Promise<{ id: string; answer: Answer; aiPending: boolean }>
  onAskAnswer: (cb: (r: { id: string; answer: Answer }) => void) => () => void
}

declare global {
  interface Window {
    inboxScout: InboxScoutApi
  }
}

export {}
