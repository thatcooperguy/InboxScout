import { useEffect, useState } from 'react'
import { replyMailto } from '../../../shared/mailto'
import { briefToSpeech } from '../../../shared/speech'

interface Props {
  running: boolean
  onRun: () => void
}

/**
 * The one screen most people need: what needs you, what you're waiting on,
 * what's coming up - and one big button.
 */
export default function Today({ running, onRun }: Props): JSX.Element {
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
    const utter = new SpeechSynthesisUtterance(briefToSpeech(brief))
    utter.rate = 0.95
    utter.onend = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
    setSpeaking(true)
  }

  const exportCsv = async (): Promise<void> => {
    const r = await window.inboxScout.exportCsv()
    setExportMsg(r.ok ? `Saved ${r.filePath}` : r.error ?? '')
  }
  const exportIcs = async (): Promise<void> => {
    const r = await window.inboxScout.exportIcs()
    setExportMsg(r.ok ? `Saved ${r.count} date${r.count === 1 ? '' : 's'} to ${r.filePath} — open it to add them to your calendar.` : r.error ?? '')
  }

  const markDone = async (id: string): Promise<void> => {
    await window.inboxScout.resolveIssue(id)
    setDoneIds((prev) => new Set([...prev, id]))
  }

  if (latest === undefined) return <div />

  const rawBrief = latest?.brief
  const brief = rawBrief
    ? { ...rawBrief, topIssues: rawBrief.topIssues.filter((i: any) => !i.issueId || !doneIds.has(i.issueId)) }
    : null
  const when = latest ? new Date(latest.createdAt) : null
  const hasAnything =
    brief &&
    (brief.topIssues.length ||
      brief.waitingOnYou.length ||
      brief.deadlines.length ||
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
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <button className="big-btn" onClick={onRun} disabled={running}>
            {running ? 'Checking…' : '✉ Check my email now'}
          </button>
          {brief && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={readAloud}>
                {speaking ? '⏹ Stop reading' : '🔊 Read it to me'}
              </button>
              <button className="ghost" onClick={() => void exportIcs()}>
                📅 Add dates to calendar
              </button>
              <button className="ghost" onClick={() => void exportCsv()}>
                📄 Export list (CSV)
              </button>
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
              <h3>⚠ Needs you</h3>
              <ul>
                {brief.topIssues.map((i: any, idx: number) => (
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
              <h3>✉ Waiting for your reply</h3>
              <ul>
                {(brief.waitingOnYouDetails?.length ? brief.waitingOnYouDetails : brief.waitingOnYou.map((t: string) => ({ subject: t, counterpart: '', address: '' }))).map(
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
          {brief.deadlines.length > 0 && (
            <div className="today-card">
              <h3>📅 Coming up</h3>
              <ul>
                {brief.deadlines.map((d: string, idx: number) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {(brief.skillSections ?? [])
            .filter((s: any) => s.lines.length > 0)
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
          {brief.pulse.length > 0 && (
            <div className="today-card">
              <h3>📊 How things are going</h3>
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
          {brief.waitingOnThem.length > 0 && (
            <div className="today-card">
              <h3>⏳ Others owe you a reply</h3>
              <ul>
                {brief.waitingOnThem.map((t: string, idx: number) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {(brief.resolvedRecently ?? []).length > 0 && (
            <div className="today-card">
              <h3>✅ Done recently</h3>
              <ul>
                {brief.resolvedRecently.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.personal.length > 0 && (
            <div className="today-card">
              <h3>🏠 Personal</h3>
              <ul>
                {brief.personal.map((p: string, idx: number) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.sensitiveNotices.length > 0 && (
            <div className="today-card">
              <h3>🔒 Sensitive items noticed</h3>
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
