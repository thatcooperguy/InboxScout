import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: unknown) => ipcRenderer.invoke('settings:set', settings),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),

  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  accountPresets: () => ipcRenderer.invoke('accounts:presets'),
  addAccount: (input: unknown) => ipcRenderer.invoke('accounts:add', input),
  removeAccount: (id: string) => ipcRenderer.invoke('accounts:remove', id),

  aiProviders: () => ipcRenderer.invoke('ai:providers'),
  aiConnect: (input: unknown) => ipcRenderer.invoke('ai:connect', input),
  aiDisconnect: (provider: string) => ipcRenderer.invoke('ai:disconnect', provider),
  aiOpenKeyPage: (provider: string) => ipcRenderer.invoke('ai:openKeyPage', provider),

  runNow: () => ipcRenderer.invoke('run:now'),
  listRuns: () => ipcRenderer.invoke('runs:list'),
  listReports: () => ipcRenderer.invoke('reports:list'),
  getReport: (id: string) => ipcRenderer.invoke('reports:get', id),
  openReportFile: (path: string) => ipcRenderer.invoke('reports:openFile', path),

  listIssues: () => ipcRenderer.invoke('issues:list'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  recentMessages: (limit: number) => ipcRenderer.invoke('messages:recent', limit),
  searchMessages: (query: string) => ipcRenderer.invoke('messages:search', query),
  correctMessage: (input: unknown) => ipcRenderer.invoke('messages:correct', input),

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

contextBridge.exposeInMainWorld('inboxIntel', api)

export type InboxIntelApi = typeof api
