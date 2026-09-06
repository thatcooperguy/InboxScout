import type { AppSettings } from '../shared/types'

// Baked in at build time by electron.vite.config.ts from the release environment
// (GitHub Actions secrets). Empty in local dev builds.
declare const __INBOXSCOUT_GOOGLE_CLIENT_ID__: string
declare const __INBOXSCOUT_GOOGLE_CLIENT_SECRET__: string
declare const __INBOXSCOUT_MS_CLIENT_ID__: string

function baked(name: 'google_id' | 'google_secret' | 'ms_id'): string {
  try {
    if (name === 'google_id') return __INBOXSCOUT_GOOGLE_CLIENT_ID__ || ''
    if (name === 'google_secret') return __INBOXSCOUT_GOOGLE_CLIENT_SECRET__ || ''
    return __INBOXSCOUT_MS_CLIENT_ID__ || ''
  } catch {
    return ''
  }
}

/** Resolution order: the person's own setting → environment → value baked into the official build. */
export function googleClient(settings: AppSettings): { clientId: string; clientSecret: string } {
  return {
    clientId: settings.googleClientId || process.env['INBOXSCOUT_GOOGLE_CLIENT_ID'] || baked('google_id'),
    clientSecret: settings.googleClientSecret || process.env['INBOXSCOUT_GOOGLE_CLIENT_SECRET'] || baked('google_secret')
  }
}

export function microsoftClientId(settings: AppSettings): string {
  return settings.microsoftClientId || process.env['INBOXSCOUT_MS_CLIENT_ID'] || baked('ms_id')
}

/** True when official builds carry IDs, so the UI can hide the one-time setup entirely. */
export function hasBakedClients(): { google: boolean; microsoft: boolean } {
  return { google: !!baked('google_id'), microsoft: !!baked('ms_id') }
}
