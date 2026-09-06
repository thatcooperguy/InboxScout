import type { UiLevel } from './adapt'
import { plainError } from './errors'

/**
 * Level-aware copy that the main process needs too (ADAPTIVE-UI §7): OS notifications after a
 * scheduled run used to say "212 new messages scanned, 2 issues need attention" at every level —
 * words the Simple deny-list forbids. The renderer's own strings still live in
 * src/renderer/src/copy.ts; this file holds the shared subset and the same lookup rule
 * (a missing variant falls back to Standard). Both are covered by the Simple copy test.
 */
export type CopyVariants = { simple?: string; standard: string; pro?: string }

export const SHARED_COPY: Record<string, CopyVariants> = {
  'notify.ready.title': { simple: 'InboxScout — your brief is ready', standard: 'InboxScout — brief ready', pro: 'InboxScout · brief' },
  'notify.ready.none': { simple: 'I checked your email. Nothing needs you.', standard: '{n} new messages, nothing needs your attention.', pro: '{n} new · 0 need you' },
  'notify.ready.one': { simple: 'I checked your email. One thing needs you.', standard: '{n} new messages, 1 item needs your attention.', pro: '{n} new · 1 needs you' },
  'notify.ready.many': { simple: 'I checked your email. {k} things need you.', standard: '{n} new messages, {k} items need your attention.', pro: '{n} new · {k} need you' },
  'notify.failed.title': { simple: 'InboxScout — I could not check your email', standard: 'InboxScout — check failed', pro: 'InboxScout · run failed' },
  'notify.failed': { simple: 'I could not check your email. Open InboxScout to see why.', standard: '{reason}', pro: '{reason}' },
  'notify.snag': {
    simple: 'InboxScout had a small problem and kept going. Open it to see more.',
    standard: 'InboxScout hit a snag and kept going — see Settings → Health',
    pro: 'Snag logged — Settings → Health'
  }
}

export function tShared(key: string, level: UiLevel): string {
  const v = SHARED_COPY[key]
  if (!v) return key
  return (level === 'simple' ? v.simple : level === 'pro' ? v.pro : undefined) ?? v.standard
}

export interface RunOutcome {
  messagesScanned: number
  issueCount: number
  error: string | null
  notices: string[]
}

/** Title and body of the OS notification after a run, in the level's words. */
export function notificationCopy(result: RunOutcome, level: UiLevel, opts: { nextSlot?: string | null } = {}): { title: string; body: string } {
  if (result.error) {
    const reason = plainError(result.error, level, opts).text.slice(0, 200)
    return { title: tShared('notify.failed.title', level), body: tShared('notify.failed', level).replace('{reason}', reason) }
  }
  const k = result.issueCount
  const key = k === 0 ? 'notify.ready.none' : k === 1 ? 'notify.ready.one' : 'notify.ready.many'
  let body = tShared(key, level).replace('{n}', String(result.messagesScanned)).replace('{k}', String(k))
  // Standard/Pro also get the first notice ("Fixed on its own: …"); Simple keeps the one calm line.
  if (level !== 'simple' && result.notices.length) body += ` (${result.notices[0]})`
  return { title: tShared('notify.ready.title', level), body }
}
