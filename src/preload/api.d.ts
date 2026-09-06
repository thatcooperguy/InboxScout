export interface BridgeInfo {
  enabled: boolean
  running: boolean
  port: number
  token: string
  url: string
  mcpUrl: string
  access: 'read' | 'full'
}

export interface InboxScoutApi {
  getSettings: () => Promise<any>
  setSettings: (settings: unknown) => Promise<any>
  listProfiles: () => Promise<{ id: string; name: string; pulseName: string }[]>

  listAccounts: () => Promise<any[]>
  accountPresets: () => Promise<Record<string, { host: string; port: number; sentFolder: string; help: string }>>
  addAccount: (input: unknown) => Promise<any>
  removeAccount: (id: string) => Promise<boolean>
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
  setupInfo: () => Promise<{
    google: { steps: any[]; configured: boolean; baked: boolean }
    microsoft: { steps: any[]; configured: boolean; baked: boolean }
  }>
  setupStart: (kind: string, step: number) => Promise<boolean>
  setupGoto: (kind: string, step: number) => Promise<boolean>
  setupStop: () => Promise<boolean>
  onSetupEvent: (cb: (p: any) => void) => () => void
  resolveIssue: (id: string) => Promise<boolean>

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
  searchMessages: (query: string) => Promise<any[]>
  correctMessage: (input: unknown) => Promise<boolean>

  onRunProgress: (cb: (p: any) => void) => () => void
  onRunFinished: (cb: (r: any) => void) => () => void
}

declare global {
  interface Window {
    inboxScout: InboxScoutApi
  }
}

export {}
