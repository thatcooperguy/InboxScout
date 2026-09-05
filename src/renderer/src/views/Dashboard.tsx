import { useEffect, useState } from 'react'

export default function Dashboard(): JSX.Element {
  const [issues, setIssues] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])

  useEffect(() => {
    void window.inboxScout.listIssues().then(setIssues)
    void window.inboxScout.listProjects().then(setProjects)
    void window.inboxScout.listRuns().then(setRuns)
  }, [])

  const openIssues = issues.filter((i) => i.state !== 'resolved')
  const lastRun = runs[0]
  const trendMark = (t: string): string => (t === 'up' ? '▲' : t === 'down' ? '▼' : '▬')

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="sub">
        {lastRun
          ? `Last run ${new Date(lastRun.startedAt).toLocaleString()} — ${lastRun.status}, ${lastRun.messagesScanned} messages scanned.`
          : 'No runs yet. Connect an email account and an AI provider, then press Run now.'}
      </p>
      <div className="grid2">
        <div className="card">
          <h3>⚠ Open issues ({openIssues.length})</h3>
          {openIssues.length === 0 && <div className="empty">Nothing needs your attention right now.</div>}
          <table>
            <tbody>
              {openIssues.slice(0, 10).map((i) => (
                <tr key={i.id}>
                  <td>
                    <span className={`pill ${i.severity}`}>{i.severity}</span>
                  </td>
                  <td>
                    <strong>{i.title}</strong>
                    {i.ownerAction && <div className="hint">Next: {i.ownerAction}</div>}
                    {i.deadline && <div className="hint">Deadline: {i.deadline}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>📊 Pulse ({projects.filter((p) => p.state === 'active').length} active)</h3>
          {projects.length === 0 && <div className="empty">Tracked projects will appear after the first run.</div>}
          <table>
            <tbody>
              {projects.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {trendMark(p.trend)} <strong>{p.name}</strong>
                  </td>
                  <td>
                    {p.statusSummary}
                    {p.lastChange && <div className="hint">{p.lastChange}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Recent runs</h3>
        {runs.length === 0 && <div className="empty">No runs yet.</div>}
        <table>
          <tbody>
            {runs.slice(0, 8).map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.startedAt).toLocaleString()}</td>
                <td>{r.trigger}</td>
                <td>
                  <span className={`pill ${r.status === 'failed' ? 'urgent' : 'work'}`}>{r.status}</span>
                </td>
                <td>{r.messagesScanned} msgs</td>
                <td className="hint">{r.error ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
