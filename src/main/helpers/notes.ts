import type { Helper, HelperNote, MessageRecord } from '../../shared/types'

/**
 * Trusted helpers (v1.4, A2d): the helper's side needs no app. Every message goes out from the
 * person's own outbox, so a helper's reply lands in the person's inbox, which the pipeline
 * already syncs. This finds those replies — sender matches a helper, subject is `Re:` plus one
 * of our own subject shapes — and turns them into "Notes from your helpers" on Today.
 *
 * Commands by email ("DONE 2") are out of scope on purpose: `From:` is spoofable and the app
 * stays read-only.
 */

/** Our subject shapes (ask, digest, heads-up, hello). A reply keeps them after "Re:". */
export const HELPER_SUBJECT_RE = /needs a hand:|week looks|heads-up about|inboxscout/i
const REPLY_RE = /^\s*(re|aw|sv|antw)\s*:/i
export const NOTE_MAX_CHARS = 600
export const NOTE_WINDOW_DAYS = 14

/** Keep the helper's own words: drop the quoted original and signature-ish tails. */
export function replyText(body: string, snippet = ''): string {
  const lines = (body || snippet || '').replace(/\r/g, '').split('\n')
  const kept: string[] = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^>/.test(line)) break
    if (/^On .{6,120} wrote:\s*$/i.test(line)) break
    if (/^-{2,}\s*(Original Message|Forwarded message)/i.test(line)) break
    if (/^(From|Sent|To|Subject):\s/.test(line) && kept.length > 0) break
    if (/^--\s*$/.test(line)) break
    kept.push(line)
  }
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim() || snippet.trim()
  return text.length > NOTE_MAX_CHARS ? `${text.slice(0, NOTE_MAX_CHARS - 1).trimEnd()}…` : text
}

export interface FindNotesOptions {
  now?: Date
  /** How far back to look. Default 14 days. */
  days?: number
  /** Cap on notes returned, newest first. Default 10. */
  limit?: number
}

/** Replies from helpers, newest first. Only `Re:` + one of our subject prefixes counts. */
export function findHelperNotes(messages: MessageRecord[], helpers: Helper[], opts: FindNotesOptions = {}): HelperNote[] {
  const byAddress = new Map<string, Helper>()
  for (const h of helpers) if (h.email) byAddress.set(h.email.trim().toLowerCase(), h)
  if (byAddress.size === 0) return []
  const now = opts.now ?? new Date()
  const cutoff = now.getTime() - (opts.days ?? NOTE_WINDOW_DAYS) * 86400000
  const out: HelperNote[] = []
  for (const m of messages) {
    if (m.fromMe) continue
    const helper = byAddress.get(m.fromAddress.trim().toLowerCase())
    if (!helper) continue
    if (!REPLY_RE.test(m.subject) || !HELPER_SUBJECT_RE.test(m.subject)) continue
    const when = new Date(m.date).getTime()
    if (Number.isFinite(when) && when < cutoff) continue
    const text = replyText(m.bodyText, m.snippet)
    if (!text) continue
    out.push({ from: helper.name, text, receivedAt: m.date, messageId: m.id })
  }
  out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  return out.slice(0, opts.limit ?? 10)
}
