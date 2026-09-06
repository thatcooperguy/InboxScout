import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: unknown) => ipcRenderer.invoke('settings:set', settings),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  profileGroups: () => ipcRenderer.invoke('profiles:groups'),
  profileStatus: () => ipcRenderer.invoke('profiles:status'),
  chooseProfile: (id: string) => ipcRenderer.invoke('profiles:choose', id),
  detectProfile: () => ipcRenderer.invoke('profiles:detect'),
  dismissProfileSuggestion: () => ipcRenderer.invoke('profiles:dismiss'),

  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  accountPresets: () => ipcRenderer.invoke('accounts:presets'),
  addAccount: (input: unknown) => ipcRenderer.invoke('accounts:add', input),
  removeAccount: (id: string) => ipcRenderer.invoke('accounts:remove', id),
  outlookSignIn: () => ipcRenderer.invoke('accounts:outlookSignIn'),
  googleSignIn: () => ipcRenderer.invoke('accounts:googleSignIn'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onOutlookDeviceCode: (cb: (info: unknown) => void) => {
    const listener = (_e: unknown, info: unknown): void => cb(info)
    ipcRenderer.on('outlook:deviceCode', listener)
    return () => ipcRenderer.removeListener('outlook:deviceCode', listener)
  },
  exportReportPdf: (id: string) => ipcRenderer.invoke('reports:exportPdf', id),
  exportCsv: () => ipcRenderer.invoke('export:csv'),
  exportIcs: () => ipcRenderer.invoke('export:ics'),
  deliveryCarriers: () => ipcRenderer.invoke('delivery:carriers'),
  deliveryTest: (kind: string) => ipcRenderer.invoke('delivery:test', kind),
  agentRecipes: () => ipcRenderer.invoke('agent:recipes'),
  agentStart: (input: unknown) => ipcRenderer.invoke('agent:start', input),
  agentAnswer: (text: string) => ipcRenderer.invoke('agent:answer', text),
  agentContinue: () => ipcRenderer.invoke('agent:continue'),
  agentStop: () => ipcRenderer.invoke('agent:stop'),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  agentCloseWindow: () => ipcRenderer.invoke('agent:closeWindow'),
  onAgentEvent: (cb: (e: unknown) => void) => {
    const listener = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  },
  agentSetAutonomy: (autonomy: string) => ipcRenderer.invoke('agent:setAutonomy', autonomy),
  signinsList: () => ipcRenderer.invoke('signins:list'),
  signinsSave: (email: string, password: string) => ipcRenderer.invoke('signins:save', email, password),
  signinsDelete: (email: string) => ipcRenderer.invoke('signins:delete', email),
  bridgeInfo: () => ipcRenderer.invoke('bridge:info'),
  bridgeSetEnabled: (enabled: boolean) => ipcRenderer.invoke('bridge:setEnabled', enabled),
  bridgeRegenerate: () => ipcRenderer.invoke('bridge:regenerate'),
  bridgeSetAccess: (access: string) => ipcRenderer.invoke('bridge:setAccess', access),
  phoneInfo: () => ipcRenderer.invoke('phone:info'),
  phoneSet: (on: boolean) => ipcRenderer.invoke('phone:set', on),
  phoneRegenerate: () => ipcRenderer.invoke('phone:regenerate'),
  setupInfo: () => ipcRenderer.invoke('setup:info'),
  setupStart: (kind: string, step: number) => ipcRenderer.invoke('setup:start', kind, step),
  setupGoto: (kind: string, step: number) => ipcRenderer.invoke('setup:goto', kind, step),
  setupStop: () => ipcRenderer.invoke('setup:stop'),
  onSetupEvent: (cb: (p: unknown) => void) => {
    const listener = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('setup:event', listener)
    return () => ipcRenderer.removeListener('setup:event', listener)
  },
  resolveIssue: (id: string) => ipcRenderer.invoke('issues:resolve', id),
  reopenIssue: (id: string) => ipcRenderer.invoke('issues:reopen', id),

  aiProviders: () => ipcRenderer.invoke('ai:providers'),
  aiDetect: () => ipcRenderer.invoke('ai:detect'),
  aiConnectDetected: (provider: string) => ipcRenderer.invoke('ai:connectDetected', provider),
  aiConnect: (input: unknown) => ipcRenderer.invoke('ai:connect', input),
  aiDisconnect: (provider: string) => ipcRenderer.invoke('ai:disconnect', provider),
  aiOpenKeyPage: (provider: string) => ipcRenderer.invoke('ai:openKeyPage', provider),

  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsSetEnabled: (ids: string[]) => ipcRenderer.invoke('skills:setEnabled', ids),
  skillsOpenFolder: () => ipcRenderer.invoke('skills:openFolder'),
  latestBrief: () => ipcRenderer.invoke('brief:latest'),

  runNow: () => ipcRenderer.invoke('run:now'),
  listRuns: () => ipcRenderer.invoke('runs:list'),
  listReports: () => ipcRenderer.invoke('reports:list'),
  getReport: (id: string) => ipcRenderer.invoke('reports:get', id),
  openReportFile: (path: string) => ipcRenderer.invoke('reports:openFile', path),

  listIssues: () => ipcRenderer.invoke('issues:list'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  recentMessages: (limit: number) => ipcRenderer.invoke('messages:recent', limit),
  chooseDir: (current: string) => ipcRenderer.invoke('dialog:chooseDir', current),
  systemStatus: () => ipcRenderer.invoke('system:status'),
  systemSetConsent: (kind: string, value: 'always' | 'never' | null) => ipcRenderer.invoke('system:setConsent', kind, value),
  systemReset: () => ipcRenderer.invoke('system:reset'),
  track: (kind: 'tab' | 'feature', name: string) => ipcRenderer.invoke('usage:track', kind, name),
  uiLevel: () => ipcRenderer.invoke('ui:level'),
  uiAckLevel: () => ipcRenderer.invoke('ui:ackLevel'),
  uiRevertLevel: () => ipcRenderer.invoke('ui:revertLevel'),
  uiSetLevel: (setting: string) => ipcRenderer.invoke('ui:setLevel', setting),
  listPeople: () => ipcRenderer.invoke('people:list'),
  markPerson: (address: string, how: string) => ipcRenderer.invoke('people:mark', address, how),
  searchMessages: (query: string) => ipcRenderer.invoke('messages:search', query),
  correctMessage: (input: unknown) => ipcRenderer.invoke('messages:correct', input),
  // Reads attachments and photos (v1.5): what the files said, and Open for the ones still kept.
  listAttachments: (messageIds: string | string[]) => ipcRenderer.invoke('attachments:list', messageIds),
  openAttachment: (id: string) => ipcRenderer.invoke('attachments:open', id),

  // Self-healing (v1.2): quiet health checks, one-button repair, copyable diagnostics.
  healthStatus: () => ipcRenderer.invoke('health:status'),
  healthRepair: () => ipcRenderer.invoke('health:repair'),
  diagnosticsText: () => ipcRenderer.invoke('diagnostics:text'),
  diagnosticsOpen: () => ipcRenderer.invoke('diagnostics:open'),
  onHealthReport: (cb: (r: unknown) => void) => {
    const listener = (_e: unknown, r: unknown): void => cb(r)
    ipcRenderer.on('health:report', listener)
    return () => ipcRenderer.removeListener('health:report', listener)
  },

  // Trusted helpers (v1.4, Part A).
  helpersList: () => ipcRenderer.invoke('helpers:list'),
  helpersAdd: (input: unknown) => ipcRenderer.invoke('helpers:add', input),
  helpersUpdate: (id: string, patch: unknown) => ipcRenderer.invoke('helpers:update', id, patch),
  helpersRemove: (id: string) => ipcRenderer.invoke('helpers:remove', id),
  helpersAsk: (input: unknown) => ipcRenderer.invoke('helpers:ask', input),
  helpersCancel: (sendId: string) => ipcRenderer.invoke('helpers:cancel', sendId),
  helpersLog: (limit?: number, helperId?: string) => ipcRenderer.invoke('helpers:log', limit, helperId),
  helpersPauseAll: (paused: boolean) => ipcRenderer.invoke('helpers:pauseAll', paused),
  helpersSetSetupBy: (setupBy: string | null) => ipcRenderer.invoke('helpers:setSetupBy', setupBy),
  helpersDismissNotice: () => ipcRenderer.invoke('helpers:dismissNotice'),

  // Conversation (v1.4): "Ask about your mail…". The local answer comes back at once; an AI answer, when
  // there is one, arrives on onAskAnswer with the same id.
  ask: (q: string, id?: string) => ipcRenderer.invoke('ask:question', { q, id }),
  onAskAnswer: (cb: (r: unknown) => void) => {
    const listener = (_e: unknown, r: unknown): void => cb(r)
    ipcRenderer.on('ask:answer', listener)
    return () => ipcRenderer.removeListener('ask:answer', listener)
  },

  onRunProgress: (cb: (p: unknown) => void) => {
    const listener = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('run:progress', listener)
    return () => ipcRenderer.removeListener('run:progress', listener)
  },
  onRunFinished: (cb: (r: unknown) => void) => {
    const listener = (_e: unknown, r: unknown): void => cb(r)
    ipcRenderer.on('run:finished', listener)
    return () => ipcRenderer.removeListener('run:finished', listener)
  }
}

contextBridge.exposeInMainWorld('inboxScout', api)

export type InboxScoutApi = typeof api
