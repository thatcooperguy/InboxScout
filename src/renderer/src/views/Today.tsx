import { useEffect, useState } from 'react'

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

  useEffect(() => {
    void window.inboxScout.latestBrief().then(setLatest)
    void window.inboxScout.listAccounts().then(setAccounts)
  }, [])

  if (latest === undefined) return <div />

  const brief = latest?.brief
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
        <button className="big-btn" onClick={onRun} disabled={running}>
          {running ? 'Checking…' : '✉ Check my email now'}
        </button>
      </div>

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
                  <li key={idx}>
                    <strong>{i.title}</strong>
                    <div className="next">→ {i.nextStep}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.waitingOnYou.length > 0 && (
            <div className="today-card">
              <h3>✉ Waiting for your reply</h3>
              <ul>
                {brief.waitingOnYou.map((t: string, idx: number) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
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
