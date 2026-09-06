import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'

/** Plain words for every value the pipeline records (UX-AUDIT §3.12). */
const TRIGGER_LABEL: Record<string, string> = {
  manual: 'You pressed the button',
  scheduled: 'On schedule',
  catchup: 'Caught up after sleep',
  cli: 'Command line'
}
const STATUS_LABEL: Record<string, string> = {
  succeeded: 'Finished',
  failed: 'Didn’t finish',
  running: 'Checking…'
}
const SEVERITY_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  high: 'Important',
  medium: 'Medium',
  low: 'Low'
}
const TREND_LABEL: Record<string, { mark: string; word: string }> = {
  up: { mark: '▲', word: 'More activity' },
  down: { mark: '▼', word: 'Quieting down' },
  steady: { mark: '▬', word: 'Steady' }
}

const ROWS_ISSUES = 10
const ROWS_TOPICS = 10
const ROWS_RUNS = 8

export default function Dashboard(): JSX.Element {
  const level = useLevel()
  const [issues, setIssues] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([
      window.inboxScout.listIssues().then(setIssues),
      window.inboxScout.listProjects().then(setProjects),
      window.inboxScout.listRuns().then(setRuns)
    ]).finally(() => setLoaded(true))
  }, [])

  const openIssues = issues.filter((i) => i.state !== 'resolved')
  const activeTopics = projects.filter((p) => p.state === 'active').length
  const lastRun = runs[0]

  const dateTime = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return level === 'pro'
      ? d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  const dateOnly = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const emails = (n: number): string => `${n} ${n === 1 ? 'email' : 'emails'}`
  const showing = (shown: number, total: number): JSX.Element | null =>
    total > shown ? (
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Showing {shown} of {total}
      </p>
    ) : null

  return (
    <div>
      <h1>Details</h1>
      <p className="sub" role="status">
        {!loaded
          ? 'Opening…'
          : lastRun
            ? `Last checked ${dateTime(lastRun.startedAt)} — ${STATUS_LABEL[lastRun.status] ?? lastRun.status}, ${emails(lastRun.messagesScanned)} looked at.`
            : 'No checks yet. Connect an email account, then press Check my email.'}
      </p>
      <div className="grid2">
        <div className="card">
          <h3>⚠ Open issues ({openIssues.length})</h3>
          {loaded && openIssues.length === 0 && <div className="empty">Nothing needs your attention right now.</div>}
          {openIssues.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>How urgent</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {openIssues.slice(0, ROWS_ISSUES).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className={`pill ${i.severity}`}>{SEVERITY_LABEL[i.severity] ?? i.severity}</span>
                    </td>
                    <td>
                      <strong>{i.title}</strong>
                      {i.ownerAction && <div className="hint">Next step: {i.ownerAction}</div>}
                      {i.deadline && <div className="hint">Due: {dateOnly(i.deadline)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {showing(Math.min(openIssues.length, ROWS_ISSUES), openIssues.length)}
        </div>
        <div className="card">
          <h3>📊 Topics ({activeTopics} active)</h3>
          {loaded && projects.length === 0 && (
            <div className="empty">The topics your mail keeps coming back to appear here after the first check.</div>
          )}
          {projects.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Where it stands</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, ROWS_TOPICS).map((p) => {
                  const trend = TREND_LABEL[p.trend] ?? TREND_LABEL.steady
                  return (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span title={trend.word} aria-label={trend.word}>
                          {trend.mark}
                        </span>{' '}
                        <strong>{p.name}</strong>
                        {level === 'pro' && <div className="hint">{trend.word}</div>}
                      </td>
                      <td>
                        {p.statusSummary}
                        {p.lastChange && <div className="hint">{p.lastChange}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {projects.length > 0 && (
            <p className="hint" style={{ margin: '8px 0 0' }}>
              ▲ more activity · ▬ steady · ▼ quieting down
            </p>
          )}
          {showing(Math.min(projects.length, ROWS_TOPICS), projects.length)}
        </div>
      </div>
      <div className="card">
        <h3>Recent checks ({runs.length})</h3>
        {loaded && runs.length === 0 && <div className="empty">No checks yet.</div>}
        {runs.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Started by</th>
                <th>Result</th>
                <th>Looked at</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, ROWS_RUNS).map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.startedAt)}</td>
                  <td>{TRIGGER_LABEL[r.trigger] ?? r.trigger}</td>
                  <td>
                    <span className={`pill ${r.status === 'failed' ? 'urgent' : r.status === 'running' ? 'medium' : 'personal'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>{emails(r.messagesScanned ?? 0)}</td>
                  <td className="hint">{r.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {showing(Math.min(runs.length, ROWS_RUNS), runs.length)}
      </div>
    </div>
  )
}
