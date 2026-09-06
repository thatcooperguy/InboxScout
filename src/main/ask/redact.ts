/**
 * Conversation (v1.4, Part B): mask secrets before any text leaves the ask tools or reaches the screen.
 *
 * Runs on every tool result and on the final answer text (B5 rule 3). Pure; Electron-free.
 * Masks: `password: hunter2`, 13–19-digit runs (cards, accounts — separators allowed), US SSNs
 * (`123-45-6789`), and 6-digit codes preceded by code / otp / pin.
 */

const PASSWORD = /(\bpass(?:word|code|phrase)?\b\s*(?:[:=]|is)\s*)\S+/gi
const LONG_DIGITS = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g
const CODE = /\b((?:verification |security |one-time |2fa |login )?(?:code|otp|pin)\b[^\d\n]{0,12})(\d{6})\b/gi

/** Mask secrets in one string. Safe on any input. */
export function redactText(text: string): string {
  if (!text) return text
  return String(text)
    .replace(PASSWORD, '$1••••••')
    .replace(SSN, '•••-••-••••')
    .replace(LONG_DIGITS, '•••• (number hidden)')
    .replace(CODE, '$1••••••')
}

/** Mask secrets everywhere inside a value: strings, arrays, and plain objects (recursively). */
export function redact<T>(value: T): T {
  return walk(value, 0) as T
}

function walk(v: unknown, depth: number): unknown {
  if (depth > 12) return v
  if (typeof v === 'string') return redactText(v)
  if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x, depth + 1)
    return out
  }
  return v
}
