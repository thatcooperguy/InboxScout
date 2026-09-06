import { generateText, stepCountIs, tool, type LanguageModel, type StepResult, type ToolSet } from 'ai'
import { z } from 'zod'
import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { redact, redactText } from './redact'
import { wordsMailto } from './local'
import type { Answer, AskAction, AskSource, Brief } from '../../shared/types'

/**
 * Conversation (v1.4, Part B): the AI answerer. Only when `settings.ai.provider !== 'builtin'` and a
 * key/endpoint is configured; `generateText` with a READ-ONLY tool set and a hard budget (B3, B5).
 *
 * Safety, in code not prompt: the tools can read mail, the brief, issues, schedule, people, and promises,
 * and can open a draft (a mailto: the person sends themselves). Nothing else — no settings, no desktop,
 * no send. `AskCtx` is built from the database only; it never sees the SecretStore. `redact()` runs on
 * every tool result and on the final text.
 */

export const ASK_SYSTEM = `You are InboxScout, a calm assistant that answers questions about ONE person's own email, using only the tools provided.
Rules:
- Answer in plain words, at most three short sentences, then a short list if needed. Lead with the answer.
- Use the tools to look things up; never guess a date, amount, or name. If the tools return nothing, say so.
- Cite what you used: end with "From: <subject> — <sender> — <date>" lines, one per source, max 3.
- You can NEVER send email. To write to someone, call draft_reply; it opens a draft the person must send themselves. Say that.
- NEVER repeat passwords, codes, account numbers, card numbers, or ID numbers, even if a message contains them. Say "that message contains private details" and offer to open it.
- Do not change settings, accounts, or anything on the computer. You have no tools for that.
- Today is {today}. The person's name is {ownerName}. Dates in tool results are ISO; say them as weekday + day.`

export interface MailHit {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
}

export interface AskCtx {
  model: LanguageModel
  /** YYYY-MM-DD */
  today: string
  ownerName: string
  searchMail: (ftsQuery: string, limit: number) => MailHit[]
  readMessage: (id: string, chars: number) => { id: string; subject: string; from: string; to: string; date: string; text: string; sensitive: boolean } | null
  compactBrief: () => unknown
  openIssues: () => unknown
  schedule: (day?: string) => unknown
  findPeople: (name: string) => unknown
  promises: () => unknown
  mailto: (a: { to: string; subject: string; body: string; name: string }) => string
}

const SNIPPET = 160

/** Everything the tools can reach, from the database only (B5 rule 2). */
export function buildAskCtx(db: DB, model: LanguageModel, opts: { now?: Date; ownerName?: string } = {}): AskCtx {
  const now = opts.now ?? new Date()
  const ownerName = opts.ownerName || 'the person'
  const latest = (): Brief | null => (repo.latestBrief(db)?.brief as Brief | undefined) ?? null
  return {
    model,
    today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    ownerName,
    searchMail: (q, limit) =>
      repo.searchMessages(db, q, Math.min(8, Math.max(1, limit))).map((h) => ({
        id: h.id,
        subject: String(h.subject ?? ''),
        from: h.from_name ? `${h.from_name} <${h.from_address}>` : String(h.from_address ?? ''),
        date: String(h.date ?? ''),
        snippet: String(h.snippet ?? '').slice(0, SNIPPET)
      })),
    readMessage: (id, chars) => {
      const m = repo.getMessages(db, [id])[0]
      if (!m) return null
      const c = repo.getClassifications(db, [id])[0]
      return {
        id: m.id,
        subject: m.subject,
        from: m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress,
        to: m.toAddresses,
        date: m.date,
        text: (m.bodyText || m.snippet).slice(0, Math.min(1500, Math.max(200, chars))),
        sensitive: !!c && c.sensitivity.length > 0
      }
    },
    compactBrief: () => {
      const b = latest()
      if (!b) return { note: 'No brief yet — the person has not checked their email in InboxScout.' }
      return {
        headline: b.headline,
        topIssues: b.topIssues.slice(0, 6).map((i) => ({ title: i.title, severity: i.severity, nextStep: i.nextStep, whyNow: i.whyNow })),
        waitingOnYou: (b.waitingOnYouDetails ?? []).slice(0, 6).map((w) => ({ subject: w.subject, counterpart: w.counterpart, address: w.address })),
        waitingOnThem: b.waitingOnThem.slice(0, 5),
        deadlines: b.deadlines.slice(0, 8),
        skillSections: (b.skillSections ?? []).filter((s) => s.lines.length).map((s) => ({ skillId: s.skillId, title: s.title, lines: s.lines.slice(0, 5) })),
        sensitiveNotices: b.sensitiveNotices.slice(0, 3)
      }
    },
    openIssues: () =>
      repo.listIssues(db, true).slice(0, 20).map((i) => ({ id: i.id, title: i.title, severity: i.severity, nextStep: i.ownerAction, deadline: i.deadline, updatedAt: i.updatedAt })),
    schedule: (day) => {
      const s = latest()?.schedule
      if (!s) return { days: [], overdue: [], conflicts: [] }
      const days = (day ? s.days.filter((d) => d.date === day) : s.days).slice(0, 14).map((d) => ({
        date: d.date,
        label: d.label,
        events: d.events.slice(0, 12).map((e) => ({ title: e.title, iso: e.iso, time: e.time, person: e.person, source: e.sourceLabel ?? e.source, messageId: e.messageId, conflict: !!e.conflict }))
      }))
      return { days, overdue: s.overdue.slice(0, 6), conflicts: s.conflicts.slice(0, 4) }
    },
    findPeople: (name) => {
      const n = String(name ?? '').trim().toLowerCase()
      if (!n) return []
      const people = repo.listPeople(db, 300).filter((p) => p.name.toLowerCase().includes(n) || p.addresses.some((a) => a.toLowerCase().includes(n)))
      const list = people.length ? people.map((p) => ({ name: p.name, address: p.addresses[0], role: p.role, lastSeen: p.lastSeen, goingQuiet: p.goingQuiet })) : repo.findSendersByName(db, n, 5)
      return list.slice(0, 5)
    },
    promises: () => (latest()?.promises ?? []).slice(0, 10).map((p) => ({ text: p.text, to: p.to, address: p.address, due: p.due, subject: p.subject, madeOn: p.madeOn, overdue: p.overdue, messageId: p.messageId })),
    mailto: (a) => wordsMailto(a.to, a.subject, a.name, a.body, ownerName === 'the person' ? '' : ownerName)
  }
}

/** The eight read-only tools (B3). `toFtsQuery` runs inside searchMessages, so raw words are safe here. */
export function askTools(ctx: AskCtx) {
  return {
    search_mail: tool({
      description: "Full-text search over the person's mail. Returns up to 8 hits: id, subject, from, date, snippet.",
      inputSchema: z.object({ q: z.string(), limit: z.number().int().min(1).max(8).optional() }),
      execute: async ({ q, limit }) => redact(ctx.searchMail(repo.toFtsQuery(q), limit ?? 8))
    }),
    read_message: tool({
      description: 'Read one message (first 1500 characters) by id from search_mail.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => redact(ctx.readMessage(id, 1500))
    }),
    get_brief: tool({
      description: 'The latest brief, compact: headline, topIssues (title, nextStep, whyNow), waitingOnYou, deadlines, skill sections.',
      inputSchema: z.object({}),
      execute: async () => redact(ctx.compactBrief())
    }),
    list_issues: tool({
      description: 'Open items that need the person: title, severity, next step, deadline.',
      inputSchema: z.object({}),
      execute: async () => redact(ctx.openIssues())
    }),
    get_schedule: tool({
      description: 'Dated things across every inbox for the next 14 days plus overdue items.',
      inputSchema: z.object({ day: z.string().optional().describe('YYYY-MM-DD to narrow to one day') }),
      execute: async ({ day }) => redact(ctx.schedule(day))
    }),
    list_people: tool({
      description: 'Find a person in the circle by name: name, address, role, last seen, going quiet.',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => redact(ctx.findPeople(name))
    }),
    list_promises: tool({
      description: 'Commitments the person made in their own sent mail, with due dates.',
      inputSchema: z.object({}),
      execute: async () => redact(ctx.promises())
    }),
    draft_reply: tool({
      description: "Open a reply draft in the person's own mail app. Never sends. Body must be in the person's voice, first person, short.",
      inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string().max(1200), name: z.string() }),
      execute: async (a) => ({ opened: true, mailto: ctx.mailto(a) })
    })
  }
}

export type AskTools = ReturnType<typeof askTools>

/** Only the tool results matter here; the loose shape accepts steps from any tool set (the real one or a test's). */
type Steps = ReadonlyArray<Pick<StepResult<ToolSet>, 'toolResults'> | { toolResults: ReadonlyArray<{ toolName: string; input: unknown; output: unknown }> }>

/** Messages the model actually read come first; otherwise the first search hits. Max 3. */
export function sourcesFrom(steps: Steps, now: Date = new Date()): AskSource[] {
  const out: AskSource[] = []
  const seen = new Set<string>()
  const push = (id: string, subject: string, from: string, date: string): void => {
    if (!id || seen.has(id) || out.length >= 3) return
    seen.add(id)
    const who = String(from ?? '').replace(/\s*<.*>$/, '')
    out.push({ messageId: id, label: `${clip(subject || '(no subject)', 60)} · ${clip(who, 30)} · ${shortDate(date, now)}` })
  }
  const results = steps.flatMap((s) => s.toolResults ?? [])
  for (const r of results) {
    if (r.toolName !== 'read_message') continue
    const o = r.output as { id?: string; subject?: string; from?: string; date?: string } | null
    if (o?.id) push(o.id, o.subject ?? '', o.from ?? '', o.date ?? '')
  }
  if (out.length === 0) {
    for (const r of results) {
      if (r.toolName !== 'search_mail') continue
      for (const h of (r.output as MailHit[] | undefined) ?? []) push(h.id, h.subject, h.from, h.date)
    }
  }
  return out
}

/** Every draft_reply the model opened becomes an open_draft action the renderer runs with openExternal. */
export function actionsFrom(steps: Steps): AskAction[] {
  const out: AskAction[] = []
  for (const r of steps.flatMap((s) => s.toolResults ?? [])) {
    if (r.toolName !== 'draft_reply') continue
    const o = r.output as { mailto?: string } | undefined
    const input = r.input as { name?: string; to?: string } | undefined
    if (o?.mailto?.startsWith('mailto:')) out.push({ kind: 'open_draft', mailto: o.mailto, label: `Open the draft to ${input?.name || input?.to || 'them'}`, auto: out.length === 0 })
  }
  return out
}

export async function askAi(ctx: AskCtx, question: string, signal: AbortSignal): Promise<Answer> {
  const { text, steps } = await generateText({
    model: ctx.model,
    system: ASK_SYSTEM.replace('{today}', ctx.today).replace('{ownerName}', ctx.ownerName),
    prompt: question,
    tools: askTools(ctx),
    stopWhen: stepCountIs(4),
    abortSignal: signal
  })
  const actions = actionsFrom(steps)
  let answer = redactText(String(text ?? '').trim())
  if (!answer && actions.length) answer = 'I opened a draft in your mail app. Read it, then press Send.'
  if (!answer) throw new Error('The AI returned no answer.')
  return { text: answer, sources: sourcesFrom(steps), actions, engine: 'ai', unsure: false }
}

function clip(s: string, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`
}

function shortDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso ?? '')
  const days = Math.round((now.getTime() - d.getTime()) / 86400000)
  if (days >= 0 && days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
