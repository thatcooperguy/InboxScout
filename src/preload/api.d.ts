export interface InboxIntelApi {
  getSettings: () => Promise<any>
  setSettings: (settings: unknown) => Promise<any>
  listProfiles: () => Promise<{ id: string; name: string; pulseName: string }[]>

  listAccounts: () => Promise<any[]>
  accountPresets: () => Promise<Record<string, { host: string; port: number; sentFolder: string; help: string }>>
  addAccount: (input: unknown) => Promise<any>
  removeAccount: (id: string) => Promise<boolean>

  aiProviders: () => Promise<any[]>
  aiConnect: (input: unknown) => Promise<{ ok: boolean; error?: string }>
  aiDisconnect: (provider: string) => Promise<boolean>
  aiOpenKeyPage: (provider: string) => Promise<boolean>

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
    inboxIntel: InboxIntelApi
  }
}

export {}
