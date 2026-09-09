import { useEffect, useMemo, useState } from 'react'
import { delegateMailto, replyMailto } from '../../../shared/mailto'
import { briefToSpeech } from '../../../shared/speech'
import { plainError } from '../../../shared/errors'
import { RUN_PHASES, lastRunSeconds, remainingLabel, slotOf, stepOf } from '../../../shared/runProgress'
import type { RunProgress } from '../../../shared/types'
import { lastChecked, t } from '../copy'
import { speak, stopSpeaking } from '../useLevel'
import AskBox from './AskBox'
import AskForHelp from '../components/AskForHelp'
import HelperNotesCard from '../components/HelperNotesCard'
import HelperNotice from '../components/HelperNotice'

type Level = 'simple' | 'standard' | 'pro'

/** "Why am I seeing this?" — one calm sentence per card, on request; spoken at Simple. Full-size button (WCAG 2.5.8). */
function Why({ text, level }: { text: string; level: Level }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ marginLeft: 'auto', fontWeight: 400 }}>
      <button
        className="ghost why"
        aria-label={t('why.button', level)}
        title={t('why.button', level)}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          if (!open && level === 'simple') speak(text)
        }}
      >
        {open ? '✕' : level === 'standard' ? 'Why am I seeing this?' : 'Why?'}
      </button>
      {open && (
        <div className="hint" style={{ fontSize: 13, marginTop: 4, width: '100%', fontWeight: 400 }}>
          {text}
        </div>
      )}
    </span>
  )
}

const WHY: Record<string, string> = {
  decide: 'Urgent items, dates within two days, overdue promises, and replies owed to people who matter — the decisions for today, pulled from everything below.',
  scams: 'Emails that look like scams: a sender pretending to be a company, pressure to act now, odd ways to pay, or links that hide where they go. Found by rules on this computer, never sent anywhere. Nothing was deleted.',
  needs_you: 'Emails that look like they need a decision or action from you, most urgent first. Press Done when it is handled.',
  waiting_on_you: 'Someone wrote to you and you have not replied yet.',
  promises: 'Sentences in your own sent mail that read like a commitment, with the date you gave. They disappear once you write again in that thread.',
  this_week: 'Every dated thing across all your inboxes: deadlines, appointments, travel, bills, shifts, and promises — with overlaps and overdue items flagged.',
  coming_up: 'Dates and deadlines InboxScout found in recent mail.',
  circle: 'Learned from who you write to and who writes back. Someone going quiet means the silence is well past their usual rhythm.',
  pulse: 'The topics, deals, jobs, or cases InboxScout is following in your mail across checks, with what changed most recently.',
  waiting_on_them: 'Threads where you spoke last and nobody has answered for a couple of days.',
  done_recently: 'Items you marked Done since the last brief.',
  personal: 'Personal items worth noticing — family, home, health — kept separate from work.',
  sensitive: 'A heads-up that a message contains private or company-confidential details. Nothing is hidden or redacted.'
}

interface Props {
  running: boolean
  onRun: () => void
  /** Simple: one button and only what needs you. Pro: everything at a glance. */
  level?: Level
  /** Progress line while a check runs. */
  status?: string
  /** Structured progress (phase + detail) while a check runs — drives the step bar. */
  progress?: RunProgress | null
  /** Bumped by App after every run and settings change: Today refetches in place, without remounting. */
  refreshKey?: number
  /** Raw error from the last run (null when it succeeded). Shown in plain words; raw text behind "Show details". */
  lastError?: string | null
  /** "at 7:30 AM" — when the next scheduled check will try again (for the offline message). */
  nextSlot?: string | null
  onGoTo?: (tab: string) => void
  /**
   * Notices from the latest run (App passes r.notices from onRunFinished). Only the self-healing lines —
   * "Fixed on its own: …" and "Reconnecting …" — are shown, as one calm line each under "last checked".
   */
  notices?: string[]
}

/** The notices worth a quiet line on the Today screen: things InboxScout repaired or is repairing itself. */
export const isHealingNotice = (n: string): boolean => /^(Fixed on its own:|Reconnecting)/.test(n.trim())

interface Card {
  id: string
  node: JSX.Element
  count: number
}

/** Item 10: a five-segment bar labelled from the pipeline phase, so runs over 10 s never look hung. */
function RunBar({ progress, level, lastSeconds }: { progress: RunProgress | null | undefined; level: Level; lastSeconds: number | null }): JSX.Element {
  const step = stepOf(progress?.phase)
  const total = RUN_PHASES.length
  const remaining = remainingLabel(step, total, lastSeconds)
  return (
    <div className="run-bar" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`Step ${step} of ${total}`}>
      <div className="run-bar-track">
        {RUN_PHASES.map((p, i) => (
          <span key={p.phase} className={`seg${i + 1 < step ? ' done' : i + 1 === step ? ' now' : ''}`} />
        ))}
      </div>
      <div className="run-bar-label" aria-live="polite">
        Step {step} of {total}
        {progress?.detail ? ` · ${progress.detail}` : ''}
        {remaining && level !== 'simple' ? ` · ${remaining}` : ''}
      </div>
    </div>
  )
}

/** Rows that J/K can walk and D can finish (Standard/Pro). */
const rowProps = { 'data-row': true, tabIndex: -1 } as const

/** Reads attachments (v1.5): an issue whose facts came from an attached file says so in its sources. */
export const fromAttachment = (issue: { sources?: string[] }): boolean => (issue.sources ?? []).some((s) => /\battached\b/i.test(s))

/**
 * The one screen most people need: what needs you, who is waiting on you,
 * what's coming up - and one big button. Adapts to the layout level.
 */
export default function Today({ running, onRun, level = 'standard', status = '', progress = null, refreshKey = 0, lastError = null, nextSlot = null, onGoTo, notices = [] }: Props): JSX.Element {
  const simple = level === 'simple'
  const pro = level === 'pro'
  const healing = notices.filter(isHealingNotice)
  const [latest, setLatest] = useState<any | null | undefined>(undefined)
  const [accounts, setAccounts] = useState<any[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [speaking, setSpeaking] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<string | null>(null)
  const [lastSeconds, setLastSeconds] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [notesHidden, setNotesHidden] = useState(false)

  // Item 9: refetch in place after every run — the previous brief stays on screen (no "Opening…" flash),
  // and "Show me everything", the inbox filter, and the undo toast survive a check.
  useEffect(() => {
    let alive = true
    void window.inboxScout.latestBrief().then((b) => alive && setLatest(b))
    void window.inboxScout.listAccounts().then((a) => alive && setAccounts(a))
    void window.inboxScout
      .listIssues()
      .then((issues) => alive && setDoneIds(new Set(issues.filter((i) => i.state === 'resolved').map((i) => i.id))))
    void window.inboxScout.listRuns().then((runs) => alive && setLastSeconds(lastRunSeconds(runs)))
    return () => {
      alive = false
    }
  }, [refreshKey])

  // Item 11: leaving Today (or the app switching layouts) must stop the voice — Stop always works.
  useEffect(
    () => () => {
      stopSpeaking()
    },
    []
  )
  useEffect(() => {
    if (running) setSpeaking(false)
  }, [running])
  useEffect(() => setShowDetails(false), [lastError])

  // Item 15: J/K walk the rows, D finishes the focused one (Standard/Pro; never while typing).
  useEffect(() => {
    if (simple) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const key = e.key.toLowerCase()
      if (key !== 'j' && key !== 'k' && key !== 'd') return
      const rows = Array.from(document.querySelectorAll<HTMLElement>('main [data-row]'))
      if (rows.length === 0) return
      const current = rows.findIndex((r) => r === document.activeElement || r.contains(document.activeElement))
      if (key === 'd') {
        const btn = current >= 0 ? rows[current].querySelector<HTMLButtonElement>('[data-done]') : null
        if (btn) {
          e.preventDefault()
          btn.click()
        }
        return
      }
      e.preventDefault()
      const next = key === 'j' ? Math.min(rows.length - 1, current + 1) : Math.max(0, current <= 0 ? 0 : current - 1)
      rows[next]?.focus()
      rows[next]?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [simple])

  useEffect(() => {
    if (!msg?.ok) return
    const id = window.setTimeout(() => setMsg(null), 6000)
    return () => window.clearTimeout(id)
  }, [msg])

  const rawBrief = latest?.brief
  const brief = useMemo(
    () => (rawBrief ? { ...rawBrief, topIssues: rawBrief.topIssues.filter((i: any) => !i.issueId || !doneIds.has(i.issueId)) } : null),
    [rawBrief, doneIds]
  )

  const readAloud = (): void => {
    if (!('speechSynthesis' in window) || !brief) return
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    void window.inboxScout.track('feature', 'voice')
    const utter = new SpeechSynthesisUtterance(briefToSpeech(brief, { short: simple }))
    utter.rate = simple ? 0.9 : 0.95
    utter.onend = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
    setSpeaking(true)
  }

  const exportCsv = async (): Promise<void> => {
    void window.inboxScout.track('feature', 'export')
    const r = await window.inboxScout.exportCsv()
    setMsg(r.ok ? { ok: true, text: `Saved ${r.filePath}` } : r.error ? { ok: false, text: r.error } : null)
  }
  const exportIcs = async (): Promise<void> => {
    void window.inboxScout.track('feature', 'export')
    const r = await window.inboxScout.exportIcs()
    setMsg(r.ok ? { ok: true, text: `Saved ${r.count} date${r.count === 1 ? '' : 's'} to ${r.filePath} — open it to add them to your calendar.` } : r.error ? { ok: false, text: r.error } : null)
  }
  /** Pro: a plain-text version of the brief for handing to an assistant or pasting into a note. */
  const copyBrief = async (): Promise<void> => {
    if (!brief) return
    void window.inboxScout.track('feature', 'export')
    const lines: string[] = [brief.headline, '']
    if (brief.topIssues.length) lines.push('Needs you:', ...brief.topIssues.map((i: any) => `- ${i.title} → ${i.nextStep}`), '')
    if (brief.waitingOnYou.length) lines.push('Waiting for my reply:', ...brief.waitingOnYou.map((w: string) => `- ${w}`), '')
    for (const d of brief.schedule?.days ?? []) if (d.events.length) lines.push(`${d.label}:`, ...d.events.map((e: any) => `- ${e.time ? `${e.time} ` : ''}${e.title}`), '')
    const promises = brief.promises ?? []
    if (promises.length) lines.push('Promises I made:', ...promises.map((p: any) => `- To ${p.to}: ${p.text}${p.due ? ` (by ${new Date(p.due).toDateString()})` : ''}`), '')
    try {
      await navigator.clipboard.writeText(lines.join('\n').trim())
      setMsg({ ok: true, text: 'Copied — paste it into a note, a message, or hand it to your assistant.' })
    } catch {
      setMsg({ ok: false, text: 'Could not copy.' })
    }
  }

  const markDone = async (id: string, title: string): Promise<void> => {
    void window.inboxScout.track('feature', 'done')
    await window.inboxScout.resolveIssue(id)
    setDoneIds((prev) => new Set([...prev, id]))
    setUndo({ id, title })
    window.setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), 12000)
  }
  const undoDone = async (): Promise<void> => {
    if (!undo) return
    await window.inboxScout.reopenIssue(undo.id)
    setDoneIds((prev) => {
      const next = new Set(prev)
      next.delete(undo.id)
      return next
    })
    setUndo(null)
  }

  const showMore = (): void => {
    setExpanded(true)
    void window.inboxScout.track('feature', 'expand')
  }

  if (latest === undefined) {
    return (
      <div className="empty" role="status">
        📬 Opening your brief…
      </div>
    )
  }

  const when = latest ? new Date(latest.createdAt) : null
  const schedule = brief?.schedule
  const circle = brief?.people
  const promises: any[] = brief?.promises ?? []
  const inboxes: any[] = brief?.inboxes ?? []
  const waiting: any[] = brief
    ? brief.waitingOnYouDetails?.length
      ? brief.waitingOnYouDetails
      : brief.waitingOnYou.map((s: string) => ({ subject: s, counterpart: '', address: '' }))
    : []
  const inFilter = (accountId?: string): boolean => !inboxFilter || !accountId || accountId === inboxFilter
  const scheduleDays: any[] = (schedule?.days ?? []).map((d: any) => ({ ...d, events: d.events.filter((e: any) => inFilter(e.accountId)) })).filter((d: any) => d.events.length)
  const scheduleHas = !!schedule && (scheduleDays.length > 0 || schedule.overdue.length > 0)
  const circleHas = !!circle && (circle.goingQuiet.length > 0 || (!simple && circle.newFaces.length > 0))
  const dateShort = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  // ---- Cards, in a fixed order that never changes with level (only presence and density do). ----
  const cards: Card[] = []
  const card = (id: string, title: string, count: number, body: JSX.Element, opts: { full?: boolean; attention?: boolean; hint?: string } = {}): void => {
    cards.push({
      id,
      count,
      node: (
        <div className={`today-card${opts.attention ? ' attention' : ''}${opts.full ? ' full' : ''}`} key={id}>
          <h3>
            {title}
            {!simple && count > 0 && <span className="count">({count})</span>}
            <Why text={WHY[id] ?? ''} level={level} />
          </h3>
          {body}
          {opts.hint && !pro && <p className="hint">{opts.hint}</p>}
        </div>
      )
    })
  }

  if (brief) {
    // Pro: decisions first, synthesized from everything below.
    if (pro) {
      const soon = Date.now() + 48 * 3600000
      const rows: { key: string; title: string; detail: string; issueId?: string; address?: string; subject?: string; who?: string; nextStep?: string; whyNow?: string }[] = []
      for (const i of brief.topIssues) if (i.severity === 'urgent' || i.severity === 'high') rows.push({ key: `i${i.title}`, title: i.title, detail: i.nextStep, issueId: i.issueId, whyNow: i.whyNow, nextStep: i.nextStep })
      for (const d of scheduleDays) for (const e of d.events) if (e.conflict || new Date(e.iso).getTime() <= soon) rows.push({ key: `e${e.iso}${e.title}`, title: e.title, detail: `${e.time ? e.time : d.label}${e.person ? ` · ${e.person}` : ''}${e.conflict ? ' · overlaps' : ''}` })
      for (const p of promises) if (p.overdue) rows.push({ key: `p${p.messageId}`, title: `You promised ${p.to}`, detail: `“${p.text}”`, address: p.address, subject: p.subject, who: p.to })
      const inner = new Set((circle?.inner ?? []).map((p: any) => String(p.address).toLowerCase()))
      for (const w of waiting) if (w.address && inner.has(String(w.address).toLowerCase())) rows.push({ key: `w${w.address}${w.subject}`, title: `Reply to ${w.counterpart}`, detail: w.subject, address: w.address, subject: w.subject, who: w.counterpart })
      if (rows.length) {
        card(
          'decide',
          `🎯 ${t('decide.title', level)}`,
          rows.length,
          <ul>
            {rows.slice(0, 8).map((r) => (
              <li key={r.key} {...rowProps} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>
                  <strong>{r.title}</strong>
                  <div className="next">{r.detail}</div>
                </span>
                <span style={{ display: 'flex', gap: 6, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  {r.address && (
                    <button className="ghost" onClick={() => void window.inboxScout.openExternal(replyMailto(r.address!, r.subject ?? '', r.who ?? ''))}>
                      Reply
                    </button>
                  )}
                  {r.nextStep && (
                    <button className="ghost" onClick={() => void window.inboxScout.openExternal(delegateMailto(r.title, r.nextStep!, r.whyNow))}>
                      Delegate
                    </button>
                  )}
                  {r.issueId && (
                    <button className="ghost" data-done onClick={() => void markDone(r.issueId!, r.title)}>
                      Done
                    </button>
                  )}
                </span>
              </li>
            ))}
            {rows.length > 8 && <li className="hint">+{rows.length - 8} more below</li>}
          </ul>,
          { full: true, attention: true }
        )
      }
    }

    const scams: any[] = brief.scamWarnings ?? []
    if (scams.length) {
      const shown = simple ? scams.slice(0, 3) : scams
      card(
        'scams',
        `🛑 ${t('card.scams', level)}`,
        scams.length,
        <ul>
          {shown.map((w: any) => (
            <li key={w.messageId} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong>
                {w.level === 'likely' ? 'Looks like a scam' : 'Could be a scam'}: “{w.subject}”
              </strong>
              <div className="hint">From {w.from}</div>
              <div className="next">{simple ? w.reasons[0] : w.reasons.slice(0, 2).join(' ')}</div>
              <div className="next">
                <strong>{w.advice}</strong>
              </div>
            </li>
          ))}
        </ul>,
        { attention: true, full: true, hint: simple ? 'I did not delete anything. When in doubt, ask someone you trust.' : 'Nothing was deleted or moved. If you are unsure, ask someone you trust to look at it with you.' }
      )
    }

    if (brief.topIssues.length) {
      const items = simple ? brief.topIssues.slice(0, 3) : brief.topIssues
      card(
        'needs_you',
        `⚠ ${t('card.needs_you', level)}`,
        brief.topIssues.length,
        <ul>
          {items.map((i: any, idx: number) => (
            <li key={idx} {...rowProps} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>
                <strong>{i.title}</strong>
                {fromAttachment(i) && (
                  <span className="hint" style={{ marginLeft: 6, fontWeight: 400 }} title="Part of this came from an attached file" aria-label="from an attached file">
                    📎
                  </span>
                )}
                <div className="next">→ {i.nextStep}</div>
                {!simple && i.whyNow && <div className="next">Because: {i.whyNow}</div>}
                {pro && i.sources?.length > 0 && <div className="next">From: {i.sources.slice(0, 2).join('; ')}</div>}
              </span>
              <span style={{ display: 'flex', gap: 6, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                {pro && (
                  <button className="ghost" title="Open your mail app with this item written out, ready to send to someone" onClick={() => void window.inboxScout.openExternal(delegateMailto(i.title, i.nextStep, i.whyNow))}>
                    ↗ Delegate
                  </button>
                )}
                <AskForHelp title={i.title} nextStep={i.nextStep} whyNow={i.whyNow} level={level} />
                {i.issueId && (
                  <button className="ghost" data-done onClick={() => void markDone(i.issueId, i.title)}>
                    Done ✓
                  </button>
                )}
              </span>
            </li>
          ))}
          {simple && brief.topIssues.length > 3 && (
            <li className="hint">
              <button className="ghost" onClick={showMore}>
                and {brief.topIssues.length - 3} more
              </button>
            </li>
          )}
        </ul>,
        // Pro spans the dense grid; Standard keeps it at the top of the left column (fixed slots, item 15).
        { full: pro, attention: true }
      )
    }

    if (waiting.length) {
      card(
        'waiting_on_you',
        `✉ ${t('card.waiting_on_you', level)}`,
        waiting.length,
        <ul>
          {waiting.slice(0, simple ? 3 : 50).map((w: any, idx: number) => (
            <li key={idx} {...rowProps} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>
                <strong>{w.subject}</strong>
                {w.counterpart && <div className="next">{w.counterpart}</div>}
              </span>
              {w.address && (
                <button className="ghost" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }} onClick={() => void window.inboxScout.openExternal(replyMailto(w.address, w.subject, w.counterpart))}>
                  ✍ {pro ? 'Reply' : 'Draft reply'}
                </button>
              )}
            </li>
          ))}
        </ul>,
        { hint: t('card.waiting_on_you.hint', level) }
      )
    }

    if (scheduleHas) {
      const days = simple ? scheduleDays.filter((d: any) => d.label === 'Today' || d.label === 'Tomorrow') : scheduleDays
      card(
        'this_week',
        `🗓 ${t('card.this_week', level)}`,
        days.reduce((n: number, d: any) => n + d.events.length, 0) + schedule.overdue.length,
        <ul>
          {schedule.overdue.slice(0, 3).map((o: string, idx: number) => (
            <li key={`o${idx}`} style={{ color: 'var(--red, #c0392f)' }}>
              ‼ {o}
            </li>
          ))}
          {days.map((d: any) => (
            <li key={d.date}>
              <strong>{d.label}</strong>
              {d.events.map((e: any, i: number) => (
                <div className="next" key={i} style={e.conflict ? { color: 'var(--red, #c0392f)' } : {}}>
                  {e.conflict ? '‼ ' : ''}
                  {e.time ? `${e.time} · ` : ''}
                  {e.title}
                  {e.person ? ` (${e.person})` : ''}
                </div>
              ))}
            </li>
          ))}
          {!simple && schedule.recurring.length > 0 && (
            <li>
              <span className="hint">
                {t('card.regulars', level)} {schedule.recurring.slice(0, 3).join(' · ')}
              </span>
            </li>
          )}
        </ul>
      )
    } else if (brief.deadlines.length) {
      card(
        'coming_up',
        '📅 Coming up',
        brief.deadlines.length,
        <ul>
          {brief.deadlines.slice(0, simple ? 3 : 20).map((d: string, idx: number) => (
            <li key={idx}>{d}</li>
          ))}
        </ul>
      )
    }

    const shownPromises = simple ? promises.filter((p: any) => p.overdue) : promises
    if (shownPromises.length) {
      card(
        'promises',
        `🤝 ${t('card.promises', level)}`,
        shownPromises.length,
        <ul>
          {shownPromises.slice(0, simple ? 2 : 6).map((p: any, idx: number) => (
            <li key={idx} {...rowProps} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>
                <strong>
                  {p.overdue ? '‼ ' : ''}To {p.to}
                  {p.due ? ` — by ${dateShort(p.due)}` : ''}
                </strong>
                <div className="next">“{p.text}”</div>
              </span>
              {p.address && (
                <button className="ghost" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }} onClick={() => void window.inboxScout.openExternal(replyMailto(p.address, p.subject, p.to))}>
                  ✍ Follow up
                </button>
              )}
            </li>
          ))}
        </ul>
      )
    }

    for (const s of (brief.skillSections ?? []).filter((x: any) => x.lines.length > 0)) {
      card(
        `skill:${s.skillId}`,
        `${s.icon} ${s.title}`,
        s.lines.length,
        <ul>
          {s.lines.slice(0, simple ? 3 : 12).map((l: string, idx: number) => (
            <li key={idx}>{l}</li>
          ))}
        </ul>
      )
    }

    if (circleHas) {
      card(
        'circle',
        `👥 ${t('card.circle', level)}`,
        circle.goingQuiet.length + (simple ? 0 : circle.newFaces.length),
        <ul>
          {circle.goingQuiet.map((g: string, idx: number) => (
            <li key={`q${idx}`}>{g}</li>
          ))}
          {(simple ? [] : circle.newFaces).map((n: string, idx: number) => (
            <li key={`n${idx}`}>{n}</li>
          ))}
        </ul>
      )
    }

    if (!simple && brief.pulse.length) {
      card(
        'pulse',
        `📊 ${t('card.pulse', level)}`,
        brief.pulse.length,
        <ul>
          {brief.pulse.map((p: any, idx: number) => (
            <li key={idx}>
              <strong>{p.projectName}</strong> — {p.status}
              {p.whatChanged && <div className="next">{p.whatChanged}</div>}
            </li>
          ))}
        </ul>
      )
    }
    if (!simple && brief.waitingOnThem.length) {
      card(
        'waiting_on_them',
        `⏳ ${t('card.waiting_on_them', level)}`,
        brief.waitingOnThem.length,
        <ul>
          {brief.waitingOnThem.map((w: string, idx: number) => (
            <li key={idx}>{w}</li>
          ))}
        </ul>
      )
    }
    if (!simple && (brief.resolvedRecently ?? []).length) {
      card(
        'done_recently',
        `✅ ${t('card.done_recently', level)}`,
        brief.resolvedRecently.length,
        <ul>
          {brief.resolvedRecently.map((r: string, idx: number) => (
            <li key={idx}>{r}</li>
          ))}
        </ul>
      )
    }
    if (!simple && brief.personal.length) {
      card(
        'personal',
        `🏠 ${t('card.personal', level)}`,
        brief.personal.length,
        <ul>
          {brief.personal.map((p: string, idx: number) => (
            <li key={idx}>{p}</li>
          ))}
        </ul>
      )
    }
    if (!simple && brief.sensitiveNotices.length) {
      card(
        'sensitive',
        `🔒 ${t('card.sensitive', level)}`,
        brief.sensitiveNotices.length,
        <ul>
          {brief.sensitiveNotices.map((s: string, idx: number) => (
            <li key={idx}>{s}</li>
          ))}
        </ul>
      )
    }
  }

  const visibleCards = simple && !expanded ? cards.slice(0, 3) : cards
  const hiddenCount = cards.length - visibleCards.length
  const hasAnything = cards.length > 0
  const standard = !simple && !pro
  const leftCards = standard ? visibleCards.filter((c) => slotOf(c.id) === 'left') : []
  const rightCards = standard ? visibleCards.filter((c) => slotOf(c.id) === 'right') : []
  const problem = lastError && !running ? plainError(lastError, level, { nextSlot }) : null

  return (
    <div>
      <div className="today-hero">
        <div>
          <h1>Today</h1>
          <p className="today-headline">
            {brief ? brief.headline : accounts.length === 0 ? t('hero.empty.noAccount', level) : t('hero.empty.noBrief', level)}
          </p>
          {!brief && accounts.length === 0 && onGoTo && (
            <button className="primary" style={{ marginTop: 8 }} onClick={() => onGoTo('setup')}>
              Connect my email
            </button>
          )}
          {running && !progress && status && (
            <p className="hint" role="status" aria-live="polite" style={{ marginTop: 6 }}>
              ⏳ {status}
            </p>
          )}
          {running && !brief && (
            <p className="hint" role="status" style={{ marginTop: 6 }}>
              {t('hero.firstRun', level)}
            </p>
          )}
          {!running && when && (
            <p className="hint" style={{ marginTop: 6 }}>
              {lastChecked(when, level, pro && inboxes.length ? `${inboxes.reduce((n: number, i: any) => n + i.newCount, 0)} new · ${inboxes.length} inbox${inboxes.length === 1 ? '' : 'es'}` : undefined)}
            </p>
          )}
          {!running &&
            healing.map((n) => (
              <p className="hint healing" key={n} role="status" style={{ marginTop: 4 }}>
                🔧 {n}
              </p>
            ))}
          {!simple && inboxes.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} role="group" aria-label="Inboxes">
              {pro && (
                <button className="chip" aria-pressed={inboxFilter === null} onClick={() => setInboxFilter(null)}>
                  All
                </button>
              )}
              {inboxes.map((ib: any) => (
                <button
                  key={ib.accountId}
                  className="chip"
                  aria-pressed={pro ? inboxFilter === ib.accountId : undefined}
                  onClick={() => pro && setInboxFilter(inboxFilter === ib.accountId ? null : ib.accountId)}
                  title={pro ? 'Show only this inbox where possible' : undefined}
                  style={pro ? {} : { cursor: 'default' }}
                >
                  {ib.role === 'work' ? '💼' : ib.role === 'personal' ? '🏠' : '📥'} {ib.label}: {ib.newCount} new{ib.needsYou ? ` · ${ib.needsYou} need you` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {running ? (
            <RunBar progress={progress} level={level} lastSeconds={lastSeconds} />
          ) : (
            <button className="big-btn" onClick={onRun}>
              ✉ {t('hero.run', level)}
            </button>
          )}
          {brief && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className={simple ? 'big-btn' : 'ghost'} style={simple ? { fontSize: 18 } : {}} onClick={readAloud}>
                {speaking ? '⏹ Stop reading' : '🔊 Read it to me'}
              </button>
              {simple && (
                <button className="ghost" onClick={() => speak(t('explain.today', level))}>
                  ❓ Explain this screen
                </button>
              )}
              {!simple && (
                <button className="ghost" onClick={() => void exportIcs()}>
                  📅 Add dates to calendar
                </button>
              )}
              {pro && (
                <>
                  <button className="ghost" onClick={() => void exportCsv()}>
                    📄 Save as spreadsheet
                  </button>
                  <button className="ghost" onClick={() => void copyBrief()} title="Copy a plain-text brief to paste anywhere">
                    📋 Copy brief
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <HelperNotice level={level} onChange={() => onGoTo?.('setup')} />
      {brief && <AskBox level={level} onGoTo={onGoTo} />}
      {brief?.helperNotes?.length > 0 && !notesHidden && <HelperNotesCard notes={brief.helperNotes} level={level} onDone={() => setNotesHidden(true)} />}
      {problem && (
        <div className="error" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{problem.text}</span>
          {problem.kind === 'auth' && onGoTo && (
            <button className="ghost" onClick={() => onGoTo('setup')}>
              Fix it for me
            </button>
          )}
          {problem.detail && (
            <button className="ghost" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          )}
          {showDetails && problem.detail && (
            <code style={{ width: '100%', whiteSpace: 'pre-wrap', fontSize: 12 }}>{problem.detail}</code>
          )}
        </div>
      )}
      {msg && (
        <div className={msg.ok ? 'success' : 'error'} role="status">
          {msg.text}
        </div>
      )}
      {undo && (
        <div className="success" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Marked “{undo.title}” as done.</span>
          <button className="ghost" onClick={() => void undoDone()}>
            ↩ Undo
          </button>
        </div>
      )}

      {brief && !hasAnything && (
        <div className="today-card">
          <div className="all-clear">
            <div className="big">✅</div>
            {t('card.all_clear', level)}
          </div>
        </div>
      )}

      {brief && hasAnything && (
        <>
          {standard ? (
            // Fixed two-column slots at Standard (HUMAN-FACTORS 3.3): the same card order as every level, split by slot.
            <div className="today-grid two-col">
              <div className="today-col">{leftCards.map((c) => c.node)}</div>
              <div className="today-col">{rightCards.map((c) => c.node)}</div>
            </div>
          ) : (
            <div className="today-grid">{visibleCards.map((c) => c.node)}</div>
          )}
          {hiddenCount > 0 && (
            <button className="big-btn" style={{ marginTop: 12, width: '100%' }} onClick={showMore}>
              {t('more.show', level)} ({hiddenCount} more)
            </button>
          )}
        </>
      )}
      {pro && brief && <p className="hint" style={{ marginTop: 12 }}>{t('explain.today', level)}</p>}
    </div>
  )
}
