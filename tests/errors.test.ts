import { describe, expect, it } from 'vitest'
import { ERROR_SIMPLE_COPY, accountIn, errorKind, nextSlotLabel, plainError } from '../src/shared/errors'
import { SHARED_COPY, notificationCopy, tShared } from '../src/shared/copy'
import { RUN_PHASES, lastRunSeconds, remainingLabel, slotOf, stepOf } from '../src/shared/runProgress'
import { SIMPLE_JARGON } from '../src/renderer/src/copy'

/** Same reading-level rules as tests/copy.test.ts, applied to the shared copy and the plain-words errors. */
function grade(text: string): number {
  const words = text.split(/\s+/).filter(Boolean)
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length)
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) ?? []).length), 0)
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59
}
function expectSimple(key: string, text: string): void {
  const lower = text.toLowerCase()
  for (const word of SIMPLE_JARGON) expect(new RegExp(`\\b${word}\\b`).test(lower), `${key} uses "${word}"`).toBe(false)
  if (text.split(/\s+/).length >= 4) expect(grade(text), `${key} reads at grade ${grade(text).toFixed(1)}: ${text}`).toBeLessThanOrEqual(7)
  for (const sentence of text.split(/[.!?]+/).filter((s) => s.trim())) {
    expect(sentence.trim().split(/\s+/).length, `${key} sentence too long: ${sentence}`).toBeLessThanOrEqual(14)
  }
}

describe('plainError (item 12)', () => {
  const AUTH = 'Could not check any account. me@gmail.com: Invalid credentials (Failure) | other@yahoo.com: AUTHENTICATIONFAILED'
  const OFFLINE = 'getaddrinfo ENOTFOUND imap.gmail.com'
  const NO_KEY = 'No API key connected for provider "gemini". Open Setup → AI helper to add one.'

  it('classifies the raw pipeline messages', () => {
    expect(errorKind(AUTH)).toBe('auth')
    expect(errorKind(OFFLINE)).toBe('offline')
    expect(errorKind('read ECONNRESET')).toBe('offline')
    expect(errorKind(NO_KEY)).toBe('ai')
    expect(errorKind('No email accounts connected yet.')).toBe('noAccount')
    expect(errorKind('SQLITE_BUSY: database is locked')).toBe('other')
  })

  it('names the account that rejected the password and points at the button', () => {
    expect(accountIn(AUTH, 'standard')).toBe('me@gmail.com')
    const e = plainError(AUTH, 'standard')
    expect(e.kind).toBe('auth')
    expect(e.text).toBe("me@gmail.com didn't accept the password. Press Fix it for me, or add a new app password under Setup → Email accounts.")
    expect(e.detail).toBe(AUTH)
    expect(plainError('Invalid credentials', 'standard').text).toMatch(/^Your email account didn't accept/)
  })

  it('says when it will try again while offline, and calls the screen "AI helper"', () => {
    expect(plainError(OFFLINE, 'standard', { nextSlot: 'at 7:30 AM' }).text).toBe("No internet right now. I'll try again at 7:30 AM.")
    expect(plainError(OFFLINE, 'pro').text).toBe('Offline. Retry soon.')
    const ai = plainError(NO_KEY, 'standard')
    expect(ai.text).toContain('AI helper')
    expect(ai.text).not.toContain('Connect AI')
  })

  it('keeps the raw text for Show details at Standard/Pro only', () => {
    expect(plainError(AUTH, 'simple').detail).toBeNull()
    expect(plainError(AUTH, 'pro').detail).toBe(AUTH)
    expect(plainError('SQLITE_BUSY: database is locked', 'pro').text).toBe('SQLITE_BUSY: database is locked')
    expect(plainError('SQLITE_BUSY: database is locked', 'standard').text).toBe('Something went wrong: SQLITE_BUSY: database is locked')
    expect(plainError('SQLITE_BUSY: database is locked', 'simple').text).toBe('Something went wrong. Please try again in a little while.')
  })

  it('reads at Simple level with no jargon, even with an account and a time filled in', () => {
    for (const [key, text] of Object.entries(ERROR_SIMPLE_COPY)) {
      expectSimple(key, text.replace('{account}', 'Your email').replace('{when}', 'at 7:30 AM').replace('{raw}', ''))
    }
    expectSimple('error.auth.filled', plainError(AUTH, 'simple').text)
    expectSimple('error.offline.filled', plainError(OFFLINE, 'simple', { nextSlot: 'tomorrow at 7:30 AM' }).text)
  })

  it('finds the next scheduled slot in words', () => {
    const now = new Date(2026, 8, 6, 12, 0) // Sunday noon
    expect(nextSlotLabel({ frequency: 'manual', hour: 7, minute: 30, weekday: 1 }, now)).toBeNull()
    expect(nextSlotLabel({ frequency: 'daily', hour: 7, minute: 30, weekday: 1 }, now)).toMatch(/^tomorrow at /)
    expect(nextSlotLabel({ frequency: 'daily', hour: 18, minute: 0, weekday: 1 }, now)).toMatch(/^at /)
    expect(nextSlotLabel({ frequency: 'weekly', hour: 9, minute: 0, weekday: 1 }, now)).toMatch(/^tomorrow at /)
    expect(nextSlotLabel({ frequency: 'weekly', hour: 9, minute: 0, weekday: 3 }, now)).toMatch(/^on Wednesday at /)
  })
})

describe('shared copy (extra b)', () => {
  it('keeps every Simple variant short, jargon-free, and easy to read', () => {
    for (const [key, v] of Object.entries(SHARED_COPY)) {
      if (v.simple) expectSimple(key, v.simple.replace('{k}', '3').replace('{n}', '12').replace('{reason}', 'No internet right now.'))
    }
  })

  it('falls back to Standard', () => {
    expect(tShared('notify.ready.title', 'simple')).toBe('InboxScout — your brief is ready')
    expect(tShared('nope', 'pro')).toBe('nope')
  })

  it('writes the notification in the level\'s words', () => {
    const ok = { messagesScanned: 212, issueCount: 2, error: null, notices: ['Fixed on its own: reset the sync bookmark'] }
    expect(notificationCopy(ok, 'simple').body).toBe('I checked your email. 2 things need you.')
    expect(notificationCopy(ok, 'standard').body).toBe('212 new messages, 2 items need your attention. (Fixed on its own: reset the sync bookmark)')
    expect(notificationCopy(ok, 'pro').body).toBe('212 new · 2 need you (Fixed on its own: reset the sync bookmark)')
    expect(notificationCopy({ ...ok, issueCount: 1, notices: [] }, 'simple').body).toBe('I checked your email. One thing needs you.')
    expect(notificationCopy({ ...ok, issueCount: 0, notices: [] }, 'standard').body).toBe('212 new messages, nothing needs your attention.')
    const failed = { messagesScanned: 0, issueCount: 0, error: 'getaddrinfo ENOTFOUND imap.gmail.com', notices: [] }
    expect(notificationCopy(failed, 'simple')).toEqual({ title: 'InboxScout — I could not check your email', body: 'I could not check your email. Open InboxScout to see why.' })
    expect(notificationCopy(failed, 'standard', { nextSlot: 'at 7:30 AM' }).body).toBe("No internet right now. I'll try again at 7:30 AM.")
    for (const level of ['simple', 'standard', 'pro'] as const) {
      const lower = notificationCopy(ok, level).body.toLowerCase()
      if (level === 'simple') for (const word of SIMPLE_JARGON) expect(new RegExp(`\\b${word}\\b`).test(lower)).toBe(false)
    }
  })
})

describe('run progress helpers (item 10) and slots (item 15)', () => {
  it('maps phases to five steps and estimates time left from the last good run', () => {
    expect(RUN_PHASES).toHaveLength(5)
    expect(stepOf('fetch')).toBe(1)
    expect(stepOf('classify')).toBe(2)
    expect(stepOf('save')).toBe(5)
    expect(stepOf('done')).toBe(5)
    expect(stepOf(undefined)).toBe(5)
    const runs = [
      { status: 'failed', startedAt: '2026-09-06T07:30:00.000Z', finishedAt: '2026-09-06T07:30:02.000Z' },
      { status: 'succeeded', startedAt: '2026-09-05T07:30:00.000Z', finishedAt: '2026-09-05T07:30:50.000Z' }
    ]
    expect(lastRunSeconds(runs)).toBe(50)
    expect(lastRunSeconds([])).toBeNull()
    expect(remainingLabel(1, 5, 50)).toBe('about 50 seconds left')
    expect(remainingLabel(4, 5, 50)).toBe('about 20 seconds left')
    expect(remainingLabel(2, 5, 300)).toBe('about 4 minutes left')
    expect(remainingLabel(2, 5, null)).toBeNull()
  })

  it('puts to-do cards left and dated/people cards right, in the canonical card order', () => {
    expect(['needs_you', 'waiting_on_you', 'promises', 'waiting_on_them', 'done_recently', 'personal', 'sensitive'].map(slotOf)).toEqual(Array(7).fill('left'))
    expect(['this_week', 'coming_up', 'circle', 'pulse', 'skill:bills'].map(slotOf)).toEqual(Array(5).fill('right'))
  })
})
