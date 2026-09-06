import type { UiLevel } from './adapt'
import type { ScheduleSettings } from './types'

/**
 * Plain-words errors (v1.4, item 12). A raw pipeline message becomes what happened → the likely
 * reason → the button to press, in the level's words. The raw text is kept for "Show details" at
 * Standard/Pro; Simple never sees it. Pure, shared by the renderer (App/Today) and the main process
 * (OS notification bodies).
 */

/** Mirrors AUTH_ERROR_RE in src/main/health/checks.ts (the main process keeps its own copy; the renderer cannot import it). */
export const AUTH_ERROR_RE = /auth|login|credential|invalid|AUTHENTICATIONFAILED|401|403/i
export const OFFLINE_RE = /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|fetch failed|getaddrinfo/i
export const NO_AI_KEY_RE = /No API key/i
export const NO_ACCOUNT_RE = /No email accounts connected/i

export type ErrorKind = 'auth' | 'offline' | 'ai' | 'noAccount' | 'other'

export interface PlainError {
  kind: ErrorKind
  /** What happened, why, and what to press — in the level's words. */
  text: string
  /** The raw message for "Show details"; null at Simple. */
  detail: string | null
}

type Variants = { simple: string; standard: string; pro: string }

const ERROR_COPY: Record<ErrorKind, Variants> = {
  auth: {
    simple: '{account} did not take the password. Press Fix it for me. Or open Setup and press Email accounts.',
    standard: "{account} didn't accept the password. Press Fix it for me, or add a new app password under Setup → Email accounts.",
    pro: '{account}: password rejected. Fix it for me, or Setup → Email accounts.'
  },
  offline: {
    simple: 'No internet right now. I will try again {when}.',
    standard: "No internet right now. I'll try again {when}.",
    pro: 'Offline. Retry {when}.'
  },
  ai: {
    simple: 'The AI helper is not set up yet. Open Setup, then AI helper.',
    standard: 'No AI helper key is connected. Open Setup → AI helper to add one, or switch to the built-in engine.',
    pro: 'No AI key. Setup → AI helper.'
  },
  noAccount: {
    simple: 'First, tell me where your email is. Press Setup.',
    standard: 'No email account is connected yet. Open Setup → Email accounts to add one.',
    pro: 'No inbox connected. Setup → Email accounts.'
  },
  other: {
    simple: 'Something went wrong. Please try again in a little while.',
    standard: 'Something went wrong: {raw}',
    pro: '{raw}'
  }
}

/** Every Simple sentence, for the copy test (grade, length, deny-list). */
export const ERROR_SIMPLE_COPY: Record<string, string> = Object.fromEntries(Object.entries(ERROR_COPY).map(([k, v]) => [`error.${k}`, v.simple]))

const EMAIL_RE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*:/

export function errorKind(raw: string): ErrorKind {
  if (NO_ACCOUNT_RE.test(raw)) return 'noAccount'
  if (NO_AI_KEY_RE.test(raw)) return 'ai'
  if (OFFLINE_RE.test(raw)) return 'offline'
  if (AUTH_ERROR_RE.test(raw)) return 'auth'
  return 'other'
}

/** The account named in a sync error ("me@gmail.com: Invalid credentials") — or a plain stand-in. */
export function accountIn(raw: string, level: UiLevel): string {
  const m = raw.match(EMAIL_RE)
  if (m) return m[1]
  return level === 'pro' ? 'Account' : 'Your email account'
}

/**
 * Next scheduled slot as words: "at 7:30 AM", "tomorrow at 7:30 AM", "on Monday at 9:00 AM"; null when manual.
 * Simple says "in the morning" style times through the same formatter — the OS locale decides the format.
 */
export function nextSlotLabel(s: ScheduleSettings | null | undefined, now: Date = new Date()): string | null {
  if (!s || s.frequency === 'manual') return null
  const slot = new Date(now)
  slot.setHours(s.hour, s.minute, 0, 0)
  if (s.frequency === 'daily') {
    if (slot.getTime() <= now.getTime()) slot.setDate(slot.getDate() + 1)
  } else {
    const ahead = (s.weekday - slot.getDay() + 7) % 7
    slot.setDate(slot.getDate() + ahead)
    if (slot.getTime() <= now.getTime()) slot.setDate(slot.getDate() + 7)
  }
  const time = slot.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameDay = slot.toDateString() === now.toDateString()
  if (sameDay) return `at ${time}`
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === slot.toDateString()
  if (tomorrow) return `tomorrow at ${time}`
  return `on ${slot.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`
}

export function plainError(raw: string, level: UiLevel, opts: { nextSlot?: string | null } = {}): PlainError {
  const message = String(raw ?? '').trim() || 'unknown error'
  const kind = errorKind(message)
  const variants = ERROR_COPY[kind]
  const template = level === 'simple' ? variants.simple : level === 'pro' ? variants.pro : variants.standard
  const when = opts.nextSlot ?? (level === 'pro' ? 'soon' : 'soon')
  const text = template
    .replace('{account}', accountIn(message, level))
    .replace('{when}', when)
    .replace('{raw}', firstLine(message, 160))
  return { kind, text, detail: level === 'simple' ? null : message }
}

function firstLine(s: string, max: number): string {
  const line = s.split('\n')[0].trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}
