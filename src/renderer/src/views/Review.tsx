import { useEffect, useState } from 'react'

const CATEGORIES = ['work', 'personal', 'promotions_noise'] as const

export default function Review(): JSX.Element {
  const [messages, setMessages] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [catFilter, setCatFilter] = useState<string>('all')
  const [screenFilter, setScreenFilter] = useState<string>('all')

  const load = (): void => {
    void window.inboxScout.recentMessages(80).then(setMessages)
  }
  useEffect(load, [])

  const correct = async (messageId: string, category: string): Promise<void> => {
    await window.inboxScout.correctMessage({ messageId, category })
    load()
  }

  const search = async (): Promise<void> => {
    if (!query.trim()) {
      setResults(null)
      return
    }
    setResults(await window.inboxScout.searchMessages(query.trim()))
  }

  const rows = (results ?? messages).filter(
    (m) => (catFilter === 'all' || m.category === catFilter) && (screenFilter === 'all' || m.screening === screenFilter)
  )
  const chip = (value: string, current: string, set: (v: string) => void, label: string): JSX.Element => (
    <button
      key={value}
      className={`ghost tiny ${current === value ? 'active-chip' : ''}`}
      style={current === value ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : {}}
      onClick={() => set(value)}
    >
      {label}
    </button>
  )

  return (
    <div>
      <h1>Inbox review</h1>
      <p className="sub">
        Check how mail was sorted and fix anything the AI got wrong — corrections teach it your preferences.
      </p>
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search all synced mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
          />
          <button className="ghost" onClick={() => void search()}>
            Search
          </button>
          {results && (
            <button className="ghost" onClick={() => setResults(null)}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="card" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="hint">Show:</span>
        {chip('all', catFilter, setCatFilter, 'All')}
        {chip('work', catFilter, setCatFilter, 'Work')}
        {chip('personal', catFilter, setCatFilter, 'Personal')}
        {chip('promotions_noise', catFilter, setCatFilter, 'Noise')}
        <span className="hint" style={{ marginLeft: 12 }}>Type:</span>
        {chip('all', screenFilter, setScreenFilter, 'Any')}
        {chip('needs_reply', screenFilter, setScreenFilter, 'Needs reply')}
        {chip('fyi', screenFilter, setScreenFilter, 'FYI')}
        {chip('newsletter', screenFilter, setScreenFilter, 'Newsletter')}
        {chip('transactional', screenFilter, setScreenFilter, 'Receipts & orders')}
        {chip('cold_pitch', screenFilter, setScreenFilter, 'Cold pitch')}
      </div>
      <div className="card">
        {rows.length === 0 && <div className="empty">Nothing here — try another filter or run a scan first.</div>}
        <table>
          <thead>
            <tr>
              <th>From / subject</th>
              <th>Sorted as</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.subject}</strong>
                  <div className="hint">
                    {m.from_name || m.from_address} · {new Date(m.date).toLocaleString()}
                  </div>
                  <div className="hint">{m.snippet?.slice(0, 140)}</div>
                </td>
                <td>
                  {m.category ? <span className={`pill ${m.category}`}>{m.category.replace('_', ' / ')}</span> : <span className="hint">—</span>}
                  {m.sensitivity && m.sensitivity !== '[]' && <div><span className="pill sensitive">sensitive</span></div>}
                  {m.action_summary && <div className="hint">{m.action_summary}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {CATEGORIES.filter((c) => c !== m.category).map((c) => (
                    <div key={c}>
                      <button className="ghost tiny" onClick={() => void correct(m.id, c)}>
                        → {c.replace('_', '/')}
                      </button>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
