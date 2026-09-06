import { useEffect, useState } from 'react'
import { replyMailto } from '../../../shared/mailto'
import { briefToSpeech } from '../../../shared/speech'

/** "Why am I seeing this?" — one calm sentence per card, on request. */
function Why({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ marginLeft: 'auto', fontWeight: 400 }}>
      <button className="ghost tiny" aria-label="Why am I seeing this?" title="Why am I seeing this?" onClick={() => setOpen(!open)}>
        {open ? '✕' : 'ⓘ'}
      </button>
      {open && <div className="hint" style={{ fontSize: 13, marginTop: 4, width: '100%' }}>{text}</div>}
    </span>
  )
}

interface Props {
  running: boolean
  onRun: () => void
  /** Simple: one button and only what needs you. Pro: everything at a glance. */
  level?: 'simple' | 'standard' | 'pro'
}

/**
 * The one screen most people need: what needs you, what you're waiting on,
 * what's coming up - and one big button.
 */
export default function Today({ running, onRun, level = 'standard' }: Props): JSX.Element {
  const simple = level === 'simple'
  const pro = level === 'pro'
  const [latest, setLatest] = useState<any | null | undefined>(undefined)
  const [accounts, setAccounts] = useState<any[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    void window.inboxScout.latestBrief().then(setLatest)
    void window.inboxScout.listAccounts().then(setAccounts)
    void window.inboxScout
      .listIssues()
      .then((issues) => setDoneIds(new Set(issues.filter((i) => i.state === 'resolved').map((i) => i.id))))
  }, [])

  const [speaking, setSpeaking] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  const readAloud = (): void => {
    if (!('speechSynthesis' in window) || !brief) return
    if (speaking) {
      window.speechSynthesis.cancel()
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
    setExportMsg(r.ok ? `Saved ${r.filePath}` : r.error ?? '')
  }
  const exportIcs = async (): Promise<void> => {
    void window.inboxScout.track('feature', 'export')
    const r = await window.inboxScout.exportIcs()
    setExportMsg(r.ok ? `Saved ${r.count} date${r.count === 1 ? '' : 's'} to ${r.filePath} — open it to add them to your calendar.` : r.error ?? '')
  }
  /** Pro: a plain-text version of the brief for handing to an assistant or pasting into a note. */
  const copyBrief = async (): Promise<void> => {
    if (!brief) return
    void window.inboxScout.track('feature', 'export')
    const lines: string[] = [brief.headline, '']
    if (brief.topIssues.length) lines.push('Needs you:', ...brief.topIssues.map((i: any) => `- ${i.title} → ${i.nextStep}`), '')
    if (brief.waitingOnYou.length) lines.push('Waiting for my reply:', ...brief.waitingOnYou.map((w: string) => `- ${w}`), '')
    for (const d of brief.schedule?.days ?? []) if (d.events.length) lines.push(`${d.label}:`, ...d.events.map((e: any) => `- ${e.time ? `${e.time} ` : ''}${e.title}`), '')
    if (promises.length) lines.push('Promises I made:', ...promises.map((p: any) => `- To ${p.to}: ${p.text}${p.due ? ` (by ${new Date(p.due).toDateString()})` : ''}`), '')
    try {
      await navigator.clipboard.writeText(lines.join('\n').trim())
      setExportMsg('Copied — paste it into a note, a message, or hand it to your assistant.')
    } catch {
      setExportMsg('Could not copy.')
    }
  }

  const markDone = async (id: string): Promise<void> => {
    void window.inboxScout.track('feature', 'done')
    await window.inboxScout.resolveIssue(id)
    setDoneIds((prev) => new Set([...prev, id]))
  }

  if (latest === undefined) return <div />

  const rawBrief = latest?.brief
  const brief = rawBrief
    ? { ...rawBrief, topIssues: rawBrief.topIssues.filter((i: any) => !i.issueId || !doneIds.has(i.issueId)) }
    : null
  const when = latest ? new Date(latest.createdAt) : null
  const schedule = brief?.schedule
  const scheduleHas = !!schedule && (schedule.days.some((d: any) => d.events.length) || schedule.overdue.length > 0)
  const circle = brief?.people
  const circleHas = !!circle && (circle.goingQuiet.length > 0 || circle.newFaces.length > 0)
  const promises = brief?.promises ?? []
  const inboxes = brief?.inboxes ?? []
  const hasAnything =
    brief &&
    (brief.topIssues.length ||
      brief.waitingOnYou.length ||
      brief.deadlines.length ||
      scheduleHas ||
      circleHas ||
      promises.length ||
      (brief.skillSections ?? []).some((s: any) => s.lines.length))

  return (
    <div>
      <div className="today-hero">
        <div>
          <h1>Today</h1>
          <p className="today-headline">
            {brief
              ? brief.headline
              : accounts.length === 0
                ? 'Connect an email account in Setup, then check your email to get your first brief.'
                : 'Press the button to check your email and get your first brief.'}
          </p>
          {when && (
            <p className="hint" style={{ marginTop: 6 }}>
              Last checked {when.toLocaleString()}
            </p>
          )}
          {!simple && inboxes.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {inboxes.map((ib: any) => (
                <span key={ib.accountId} className="hint" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '2px 10px', fontSize: 12.5 }}>
                  {ib.role === 'work' ? '💼' : ib.role === 'personal' ? '🏠' : '📥'} {ib.label}: {ib.newCount} new{ib.needsYou ? ` · ${ib.needsYou} need you` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <button className="big-btn" onClick={onRun} disabled={running}>
            {running ? 'Checking…' : '✉ Check my email now'}
          </button>
          {brief && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className={simple ? 'big-btn' : 'ghost'} style={simple ? { fontSize: 18 } : {}} onClick={readAloud}>
                {speaking ? '⏹ Stop reading' : '🔊 Read it to me'}
              </button>
              {!simple && (
                <button className="ghost" onClick={() => void exportIcs()}>
                  📅 Add dates to calendar
                </button>
              )}
              {pro && (
                <>
                  <button className="ghost" onClick={() => void exportCsv()}>
                    📄 Export list (CSV)
                  </button>
                  <button className="ghost" onClick={() => void copyBrief()} title="Copy a plain-text brief to paste anywhere">
                    📋 Copy for my assistant
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {exportMsg && <div className="success">{exportMsg}</div>}

      {brief && !hasAnything && (
        <div className="today-card">
          <div className="all-clear">
            <div className="big">✅</div>
            You're all caught up. Nothing needs your attention right now.
          </div>
        </div>
      )}

      {brief && hasAnything && (
        <div className="today-grid">
          {brief.topIssues.length > 0 && (
            <div className="today-card attention">
              <h3>⚠ Needs you<Why text="Open items InboxScout found in your mail that seem to need a decision or action from you, most urgent first. Press Done when it is handled." /></h3>
              <ul>
                {(simple ? brief.topIssues.slice(0, 3) : brief.topIssues).map((i: any, idx: number) => (
                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>
                      <strong>{i.title}</strong>
                      <div className="next">→ {i.nextStep}</div>
                    </span>
                    {i.issueId && (
                      <button className="ghost" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }} onClick={() => void markDone(i.issueId)}>
                        Done ✓
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.waitingOnYou.length > 0 && (
            <div className="today-card">
              <h3>✉ Waiting for your reply<Why text="Threads where the other person spoke last and it looks like they expect an answer from you." /></h3>
              <ul>
                {(brief.waitingOnYouDetails?.length ? brief.waitingOnYouDetails : brief.waitingOnYou.map((t: string) => ({ subject: t, counterpart: '', address: '' })))
                  .slice(0, simple ? 3 : 50)
                  .map(
                  (t: any, idx: number) => (
                    <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>
                        <strong>{t.subject}</strong>
                        {t.counterpart && <div className="next">{t.counterpart}</div>}
                      </span>
                      {t.address && (
                        <button
                          className="ghost"
                          style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
                          onClick={() => void window.inboxScout.openExternal(replyMailto(t.address, t.subject, t.counterpart))}
                        >
                          ✍ Draft reply
                        </button>
                      )}
                    </li>
                  )
                )}
              </ul>
              <p className="hint">Draft reply opens your own mail app with a starter message — you review and send.</p>
            </div>
          )}
          {(simple ? promises.filter((p: any) => p.overdue) : promises).length > 0 && (
            <div className="today-card">
              <h3>🤝 Promises you made<Why text="Sentences in your own sent mail that read like a commitment, with the date you gave. They disappear once you write again in that thread." /></h3>
              <ul>
                {(simple ? promises.filter((p: any) => p.overdue) : promises).slice(0, simple ? 2 : 6).map((p: any, idx: number) => (
                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>
                      <strong>
                        {p.overdue ? '‼ ' : ''}To {p.to}
                        {p.due ? ` — by ${new Date(p.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
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
            </div>
          )}
          {scheduleHas ? (
            <div className="today-card">
              <h3>🗓 This week<Why text="Every dated thing across all your inboxes: deadlines, appointments, travel, bills, shifts, and promises — with overlaps and overdue items flagged." /></h3>
              <ul>
                {schedule.overdue.slice(0, 3).map((o: string, idx: number) => (
                  <li key={`o${idx}`} style={{ color: 'var(--red, #c0392f)' }}>
                    {o}
                  </li>
                ))}
                {schedule.days
                  .filter((d: any) => d.events.length && (!simple || d.label === 'Today' || d.label === 'Tomorrow'))
                  .map((d: any) => (
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
                    <span className="hint">Regulars: {schedule.recurring.slice(0, 3).join(' · ')}</span>
                  </li>
                )}
              </ul>
            </div>
          ) : (
            brief.deadlines.length > 0 && (
              <div className="today-card">
                <h3>📅 Coming up<Why text="Dates and deadlines InboxScout found in recent mail." /></h3>
                <ul>
                  {brief.deadlines.map((d: string, idx: number) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              </div>
            )
          )}
          {circleHas && (
            <div className="today-card">
              <h3>👥 Your circle<Why text="Learned from who you exchange mail with. Someone going quiet means the silence is well past their usual rhythm." /></h3>
              <ul>
                {circle.goingQuiet.map((g: string, idx: number) => (
                  <li key={`q${idx}`}>{g}</li>
                ))}
                {(simple ? [] : circle.newFaces).map((n: string, idx: number) => (
                  <li key={`n${idx}`}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {(brief.skillSections ?? [])
            .filter((s: any) => s.lines.length > 0)
            .slice(0, simple ? 2 : 20)
            .map((s: any) => (
              <div className="today-card" key={s.skillId}>
                <h3>
                  {s.icon} {s.title}
                </h3>
                <ul>
                  {s.lines.map((l: string, idx: number) => (
                    <li key={idx}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          {!simple && brief.pulse.length > 0 && (
            <div className="today-card">
              <h3>📊 How things are going<Why text="The projects, deals, jobs, or cases InboxScout is tracking across runs, with what changed most recently." /></h3>
              <ul>
                {brief.pulse.map((p: any, idx: number) => (
                  <li key={idx}>
                    <strong>{p.projectName}</strong> — {p.status}
                    {p.whatChanged && <div className="next">{p.whatChanged}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!simple && brief.waitingOnThem.length > 0 && (
            <div className="today-card">
              <h3>⏳ Others owe you a reply<Why text="Threads where you spoke last and nobody has answered for a couple of days." /></h3>
              <ul>
                {brief.waitingOnThem.map((t: string, idx: number) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {!simple && (brief.resolvedRecently ?? []).length > 0 && (
            <div className="today-card">
              <h3>✅ Done recently<Why text="Items you marked Done since the last brief." /></h3>
              <ul>
                {brief.resolvedRecently.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {!simple && brief.personal.length > 0 && (
            <div className="today-card">
              <h3>🏠 Personal<Why text="Personal items worth noticing — family, home, health — kept separate from work." /></h3>
              <ul>
                {brief.personal.map((p: string, idx: number) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.sensitiveNotices.length > 0 && (
            <div className="today-card">
              <h3>🔒 Sensitive items noticed<Why text="A heads-up that a message contains private or company-confidential details. Nothing is hidden or redacted." /></h3>
              <p className="hint">A heads-up only — nothing is hidden.</p>
              <ul>
                {brief.sensitiveNotices.map((s: string, idx: number) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
