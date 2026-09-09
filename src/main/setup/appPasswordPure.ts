import { RECIPES } from '../agent/policy'

/**
 * Electron-free part of the Get-it-for-me window (v1.5.6): the start address per service and the
 * user-agent cleanup. Kept apart so unit tests never load Electron (which, on a CI runner, tries to
 * find its binary and can stall the test past its timeout).
 */

export type AppPasswordProvider = 'gmail' | 'yahoo' | 'icloud'

export function startUrlFor(provider: AppPasswordProvider, email: string): string {
  const recipe = RECIPES.find((r) => r.id === `${provider}-app-password`)
  const base = recipe?.startUrl({ email }) ?? ''
  if (provider === 'gmail') {
    // Google's chooser lands on the right account when the person has several signed in.
    return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=${encodeURIComponent(base)}`
  }
  return base
}


/** Drop the Electron and app tokens from the user agent, leaving plain Chrome. */
export function chromeUserAgent(ua: string, name = 'inboxscout'): string {
  return ua
    .replace(/\s?Electron\/\S+/g, '')
    .replace(new RegExp(`\\s?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/\\S+`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
