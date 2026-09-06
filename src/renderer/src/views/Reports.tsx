import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'
import type { UiLevel } from '../useLevel'

type PeriodFilter = 'all' | 'daily' | 'weekly'

function timeOf(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** "Today, 7:31 am" · "Yesterday, 7:31 am" · "Monday" · "Sep 1" (Pro: "Tue Sep 1, 7:31 am"). */
function whenLabel(iso: string, level: UiLevel): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  if (level === 'pro') {
    return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeOf(d)}`
  }
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days === 0) return `Today, ${timeOf(d)}`
  if (days === 1) return `Yesterday, ${timeOf(d)}`
  if (days > 1 && days < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  })
}

function briefTitle(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Your brief'
  return `Your brief for ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

export default function Reports(): JSX.Element {
  const level = useLevel()
  const [reports, setReports] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>('all')

  const savePdf = async (): Promise<void> => {
    if (!selected) return
    const res = await window.inboxScout.exportReportPdf(selected.id)
    if (res.ok) {
      setMsg({
        ok: true,
        text: level === 'pro' && res.filePath ? `Saved PDF: ${res.filePath}` : 'Saved the PDF in your Reports folder ✓'
      })
    } else {
      setMsg({ ok: false, text: `Couldn’t save the PDF. ${res.error ?? 'Please try again.'}` })
    }
  }

  const copyMarkdown = async (): Promise<void> => {
    if (!selected?.markdown) return
    try {
      await navigator.clipboard.writeText(selected.markdown)
      setMsg({ ok: true, text: 'Copied the brief as Markdown ✓' })
    } catch {
      setMsg({ ok: false, text: 'Couldn’t copy to the clipboard.' })
    }
  }

  // Success banners go away on their own; errors stay until dismissed.
  useEffect(() => {
    if (!msg?.ok) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  useEffect(() => {
    void window.inboxScout
      .listReports()
      .then((list) => {
        setReports(list)
        if (list.length > 0) void window.inboxScout.getReport(list[0].id).then(setSelected)
      })
      .finally(() => setLoaded(true))
  }, [])

  const shown = reports.filter((r) => period === 'all' || (r.periodType === 'weekly' ? 'weekly' : 'daily') === period)
  const chip = (value: PeriodFilter, label: string): JSX.Element => {
    const active = period === value
    return (
      <button
        key={value}
        type="button"
        className="ghost"
        aria-pressed={active}
        style={{
          minHeight: 36,
          ...(active ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 } : {})
        }}
        onClick={() => setPeriod(value)}
      >
        {active ? '✓ ' : ''}
        {label}
      </button>
    )
  }

  return (
    <div>
      <h1>My briefs</h1>
      <p className="sub">Every brief is kept here and saved in your Reports folder.</p>
      {msg && (
        <div className={msg.ok ? 'success' : 'error'} role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{msg.text}</span>
          {!msg.ok && (
            <button className="ghost" style={{ minHeight: 36 }} onClick={() => setMsg(null)}>
              OK
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 260, flexShrink: 0 }}>
          {level === 'pro' && reports.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }} aria-label="Show which briefs">
              {chip('all', 'All')}
              {chip('daily', 'Daily')}
              {chip('weekly', 'Weekly')}
            </div>
          )}
          {!loaded && <div className="empty">Opening your briefs…</div>}
          {loaded && reports.length === 0 && (
            <div className="empty">
              No briefs yet.
              <div className="hint" style={{ marginTop: 6 }}>Press Check my email to get your first brief.</div>
            </div>
          )}
          {loaded && reports.length > 0 && shown.length === 0 && <div className="empty">No {period} briefs yet.</div>}
          {shown.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {shown.map((r) => {
                const active = selected?.id === r.id
                return (
                  <li key={r.id} style={{ marginBottom: 6 }}>
                    <button
                      className="ghost"
                      aria-current={active ? 'true' : undefined}
                      style={{
                        width: '100%',
                        minHeight: 40,
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: active ? 700 : 400,
                        color: active ? 'var(--ink)' : undefined,
                        background: active ? 'var(--blue-soft)' : undefined,
                        borderColor: active ? 'var(--blue)' : undefined,
                        borderLeftWidth: active ? 4 : 1
                      }}
                      onClick={() => void window.inboxScout.getReport(r.id).then(setSelected)}
                    >
                      <span>{whenLabel(r.createdAt, level)}</span>
                      {r.periodType === 'weekly' && <span className="pill work">Weekly</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {level === 'pro' && reports.length > 0 && (
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Showing {shown.length} of {reports.length}
            </p>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <>
              <div className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="primary" style={{ minHeight: 40 }} onClick={() => void savePdf()}>
                  Save as PDF
                </button>
                {level === 'pro' && selected.markdown && (
                  <button className="ghost" style={{ minHeight: 40 }} onClick={() => void copyMarkdown()}>
                    Copy Markdown
                  </button>
                )}
                {level !== 'simple' && selected.filePath && (
                  <>
                    <span title={selected.filePath}>Saved in your Reports folder</span>
                    <button
                      className="ghost"
                      style={{ minHeight: 40 }}
                      title={selected.filePath}
                      onClick={() => void window.inboxScout.openReportFile(selected.filePath)}
                    >
                      Open
                    </button>
                  </>
                )}
              </div>
              <iframe
                className="report-frame"
                title={briefTitle(selected.createdAt)}
                srcDoc={selected.html}
                sandbox=""
                style={level === 'pro' ? { height: 'calc(100vh - 150px)' } : undefined}
              />
            </>
          ) : (
            <div className="empty">
              {!loaded ? 'Opening…' : 'Press Check my email to get your first brief.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
