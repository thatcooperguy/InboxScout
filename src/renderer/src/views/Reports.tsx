import { useEffect, useState } from 'react'

export default function Reports(): JSX.Element {
  const [reports, setReports] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)

  useEffect(() => {
    void window.inboxIntel.listReports().then((list) => {
      setReports(list)
      if (list.length > 0) void window.inboxIntel.getReport(list[0].id).then(setSelected)
    })
  }, [])

  return (
    <div>
      <h1>Reports</h1>
      <p className="sub">Every brief is kept here and saved to your Reports folder.</p>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 260, flexShrink: 0 }}>
          {reports.length === 0 && <div className="empty">No reports yet.</div>}
          {reports.map((r) => (
            <div key={r.id} style={{ marginBottom: 8 }}>
              <button
                className="ghost"
                style={{ width: '100%', textAlign: 'left', fontWeight: selected?.id === r.id ? 700 : 400 }}
                onClick={() => void window.inboxIntel.getReport(r.id).then(setSelected)}
              >
                {r.periodType === 'weekly' ? 'Weekly' : 'Daily'} — {new Date(r.createdAt).toLocaleString()}
              </button>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {selected ? (
            <>
              {selected.filePath && (
                <p className="hint">
                  Saved to {selected.filePath}{' '}
                  <button className="ghost tiny" onClick={() => void window.inboxIntel.openReportFile(selected.filePath)}>
                    Open file
                  </button>
                </p>
              )}
              <iframe className="report-frame" title="report" srcDoc={selected.html} sandbox="" />
            </>
          ) : (
            <div className="empty">Run a scan to generate your first brief.</div>
          )}
        </div>
      </div>
    </div>
  )
}
