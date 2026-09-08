/**
 * App-password helpers shared by the renderer (the connect forms) and the main process (v1.5.6).
 * Pure: no Electron, no network.
 *
 * Why: the most common first-run failure is a person typing their everyday password where an app
 * password goes. The server then answers with a bare "Command failed". Both halves are handled here:
 * `appPasswordShape` catches the wrong kind of password before anything is sent, and
 * `explainConnectError` turns whatever the server said into one plain sentence that names the fix.
 */

export type AppPasswordProvider = 'gmail' | 'yahoo' | 'icloud' | 'imap' | string

export const SERVICE_NAMES: Record<string, string> = {
  gmail: 'Gmail',
  yahoo: 'Yahoo',
  icloud: 'iCloud',
  outlook: 'Outlook',
  imap: 'Your email service'
}

export function serviceName(provider: AppPasswordProvider): string {
  return SERVICE_NAMES[provider] ?? SERVICE_NAMES.imap
}

export interface PasswordShape {
  /** The password as it should be sent: spaces and dashes the site shows for readability are dropped for Gmail and Yahoo. */
  normalized: string
  /** True when it looks like the kind of password this service hands out for apps. Always true for plain IMAP. */
  looksRight: boolean
  /** One plain sentence saying what is wrong, or null. */
  hint: string | null
}

/**
 * Google and Yahoo hand out 16 letters (Google shows them as four groups); Apple shows xxxx-xxxx-xxxx-xxxx.
 * Anything with digits or symbols is almost always the person's everyday password, which these services refuse.
 */
export function appPasswordShape(provider: AppPasswordProvider, raw: string): PasswordShape {
  const trimmed = String(raw ?? '').trim()
  if (provider === 'gmail' || provider === 'yahoo') {
    const normalized = trimmed.replace(/[\s-]+/g, '')
    const looksRight = /^[A-Za-z]{16}$/.test(normalized)
    return {
      normalized: looksRight ? normalized.toLowerCase() : normalized,
      looksRight,
      hint: looksRight ? null : `That looks like your everyday ${serviceName(provider)} password. ${serviceName(provider)} needs an app password: 16 letters it makes just for InboxScout. Press Get it for me and it is filled in on its own.`
    }
  }
  if (provider === 'icloud') {
    const compact = trimmed.replace(/\s+/g, '')
    const letters = compact.replace(/-/g, '')
    const looksRight = /^[A-Za-z]{16}$/.test(letters)
    const normalized = looksRight ? letters.toLowerCase().replace(/(.{4})(?=.)/g, '$1-') : trimmed
    return {
      normalized,
      looksRight,
      hint: looksRight ? null : 'That looks like your everyday Apple password. iCloud needs an app-specific password (four groups of four letters). Press Get it for me and it is filled in on its own.'
    }
  }
  return { normalized: trimmed, looksRight: trimmed.length > 0, hint: trimmed ? null : 'Type the password for this email service.' }
}

/** Electron wraps main-process errors as "Error invoking remote method 'accounts:add': Error: …"; keep only the message. */
export function cleanIpcError(err: unknown): string {
  const raw = String((err as { message?: unknown })?.message ?? err ?? '')
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim()
}

export interface ServerErrorLike {
  message?: string
  code?: string
  authenticationFailed?: boolean
  responseText?: string
  response?: string
  serverResponseCode?: string
}

const AUTH_RE = /AUTHENTICATIONFAILED|authentication failed|invalid credentials|login failed|Command failed|LOGIN Refused|\[AUTH\]|Application-specific password|not accepted|bad credentials|Invalid login/i
const NETWORK_RE = /ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|timed out|Timeout|socket hang up|fetch failed/i
const TLS_RE = /certificate|self[- ]signed|CERT_|TLS|SSL|handshake/i

/**
 * One plain sentence for a failed connection attempt: what happened and the button to press.
 * `err` is whatever ImapFlow (or the network) threw; the raw text is appended in brackets only when
 * it says something a person could act on.
 */
export function explainConnectError(provider: AppPasswordProvider, err: unknown, opts: { hasGetItForMe?: boolean } = {}): string {
  const e = (err ?? {}) as ServerErrorLike
  const service = serviceName(provider)
  const text = [e.message, e.responseText, e.response, e.serverResponseCode, e.code].filter(Boolean).join(' ')
  const getIt = opts.hasGetItForMe === false ? '' : ' Press Get it for me and InboxScout fills it in.'
  if (/Application-specific password required|2-Step|two-step|two factor/i.test(text)) {
    return `${service} needs 2-Step Verification turned on before it will make an app password.${getIt}`
  }
  if (e.authenticationFailed || AUTH_RE.test(text)) {
    if (provider === 'gmail' || provider === 'yahoo' || provider === 'icloud') {
      return `${service} did not accept that password. It needs an app password, not your everyday password.${getIt}`
    }
    return `${service} did not accept that sign-in. Check the email address and the password; most services need an app password made just for apps.`
  }
  if (NETWORK_RE.test(text)) {
    return provider === 'imap'
      ? 'Could not reach the mail server. Check the server name, the port, and the internet connection.'
      : `Could not reach ${service} right now. Check the internet connection and try again.`
  }
  if (TLS_RE.test(text)) {
    return `The secure connection to ${service} could not be verified. Check the server name, or try again on another network.`
  }
  const first = (e.message ?? String(err ?? '')).split('\n')[0].trim()
  return first ? `Could not connect to ${service}: ${first}` : `Could not connect to ${service}. Please try again.`
}
