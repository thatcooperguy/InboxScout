import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'
import type { AttachmentInfo } from '../../../shared/types'

const CATEGORIES = ['work', 'personal', 'promotions_noise'] as const

/** Plain words for every value the sorter can produce (UX-AUDIT §3.13). */
const CATEGORY_LABEL: Record<string, string> = {
  work: 'Work',
  personal: 'Personal',
  promotions_noise: 'Ads & newsletters'
}
const SCREENING_LABEL: Record<string, string> = {
  needs_reply: 'Needs a reply',
  fyi: 'Just so you know',
  newsletter: 'Newsletter',
  transactional: 'Receipt or notice',
  cold_pitch: 'Sales pitch',
  other: 'Something else'
}
const categoryLabel = (c: string): string => CATEGORY_LABEL[c] ?? c.replace(/_/g, ' ')

interface LastFix {
  messageId: string
  subject: string
  previous: string | null
  next: string
}

export default function Review(): JSX.Element {
  const level = useLevel()
  const [messages, setMessages] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [searchedFor, setSearchedFor] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [screenFilter, setScreenFilter] = useState<string>('all')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [accounts, setAccounts] = useState<any[]>([])
  const [lastFix, setLastFix] = useState<LastFix | null>(null)
  // Reads attachments (v1.5): messageId → the files that were read, for the 📎 lines under each message.
  const [attachments, setAttachments] = useState<Map<string, AttachmentInfo[]>>(new Map())
  const [openNote, setOpenNote] = useState('')

  const load = (): void => {
    void window.inboxScout.recentMessages(120).then(setMessages)
    void window.inboxScout.listAccounts().then(setAccounts)
  }
  useEffect(load, [])

  // One call for every visible message, not one per row.
  useEffect(() => {
    const ids = (results ?? messages).map((m) => m.id).filter((id) => !attachments.has(id))
    if (ids.length === 0) return
    let alive = true
    void window.inboxScout
      .listAttachments(ids)
      .then((list) => {
        if (!alive) return
        setAttachments((prev) => {
          const next = new Map(prev)
          for (const id of ids) if (!next.has(id)) next.set(id, [])
          for (const a of list) next.set(a.messageId, [...(next.get(a.messageId) ?? []), a])
          return next
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [messages, results]) // `attachments` is deliberately not a dependency: it is what this effect fills in

  const openAttachment = async (a: AttachmentInfo): Promise<void> => {
    void window.inboxScout.track('feature', 'attachment')
    const problem = await window.inboxScout.openAttachment(a.id)
    setOpenNote(problem || `Opened ${a.filename}.`)
    window.setTimeout(() => setOpenNote(''), 5000)
  }
  const attachmentLine = (a: AttachmentInfo): string => {
    if (a.status === 'done') return a.summary || 'Read, nothing notable.'
    if (a.status === 'pending') return 'Not read yet.'
    if (a.status === 'skipped') return a.error || 'Too large to read.'
    return a.error ? `Could not read it (${a.error}).` : 'Could not read it.'
  }

  const correct = async (m: any, category: string): Promise<void> => {
    void window.inboxScout.track('feature', 'correct')
    await window.inboxScout.correctMessage({ messageId: m.id, category })
    setLastFix({ messageId: m.id, subject: m.subject, previous: m.category ?? null, next: category })
    load()
    if (results) setResults(results.map((r) => (r.id === m.id ? { ...r, category } : r)))
  }

  const undoFix = async (): Promise<void> => {
    if (!lastFix?.previous) return
    await window.inboxScout.correctMessage({ messageId: lastFix.messageId, category: lastFix.previous })
    const back = lastFix.previous
    if (results) setResults(results.map((r) => (r.id === lastFix.messageId ? { ...r, category: back } : r)))
    setLastFix(null)
    load()
  }

  const search = async (): Promise<void> => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearchedFor('')
      return
    }
    void window.inboxScout.track('feature', 'search')
    setResults(await window.inboxScout.searchMessages(q))
    setSearchedFor(q)
  }

  const clearSearch = (): void => {
    setResults(null)
    setSearchedFor('')
    setQuery('')
  }

  const source = results ?? messages
  const rows = source.filter(
    (m) =>
      (catFilter === 'all' || m.category === catFilter) &&
      (screenFilter === 'all' || m.screening === screenFilter) &&
      (accountFilter === 'all' || !m.account_id || m.account_id === accountFilter)
  )
  const filtered = catFilter !== 'all' || screenFilter !== 'all' || accountFilter !== 'all'

  const when = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return level === 'pro'
      ? d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const chip = (value: string, current: string, set: (v: string) => void, label: string): JSX.Element => {
    const active = current === value
    return (
      <button
        key={value}
        type="button"
        className="ghost"
        aria-pressed={active}
        style={{
          minHeight: 36,
          padding: '6px 12px',
          ...(active ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 } : {})
        }}
        onClick={() => set(value)}
      >
        {active ? '✓ ' : ''}
        {label}
      </button>
    )
  }

  const countLine = (): string => {
    const shown = rows.length
    const total = source.length
    if (results) {
      const base = `${total} ${total === 1 ? 'match' : 'matches'} for “${searchedFor}”`
      return filtered ? `Showing ${shown} of ${base}` : base
    }
    return filtered ? `Showing ${shown} of ${total} most recent` : `Showing the ${total} most recent`
  }

  return (
    <div>
      <h1>Inbox review</h1>
      <p className="sub">
        See where each email was filed and fix anything that landed in the wrong place — every fix teaches InboxScout your
        preferences.
      </p>
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <label htmlFor="review-search" className="hint" style={{ position: 'absolute', left: -9999 }}>
            Search your mail
          </label>
          <input
            id="review-search"
            type="search"
            placeholder="Search your mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
          />
          <button className="ghost" style={{ minHeight: 40 }} onClick={() => void search()}>
            Search
          </button>
          {results && (
            <button className="ghost" style={{ minHeight: 40 }} onClick={clearSearch}>
              Clear search
            </button>
          )}
        </div>
      </div>
      <div className="card" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="hint" style={{ marginRight: 4 }}>Filed under:</span>
        {chip('all', catFilter, setCatFilter, 'All')}
        {chip('work', catFilter, setCatFilter, 'Work')}
        {chip('personal', catFilter, setCatFilter, 'Personal')}
        {chip('promotions_noise', catFilter, setCatFilter, 'Ads & newsletters')}
        {accounts.length > 1 && (
          <>
            <span className="hint" style={{ marginLeft: 12, marginRight: 4 }}>Inbox:</span>
            {chip('all', accountFilter, setAccountFilter, 'All')}
            {accounts.map((a) => chip(a.id, accountFilter, setAccountFilter, a.label))}
          </>
        )}
        <span className="hint" style={{ marginLeft: 12, marginRight: 4 }}>Kind of email:</span>
        {chip('all', screenFilter, setScreenFilter, 'All')}
        {chip('needs_reply', screenFilter, setScreenFilter, SCREENING_LABEL.needs_reply)}
        {chip('fyi', screenFilter, setScreenFilter, SCREENING_LABEL.fyi)}
        {chip('newsletter', screenFilter, setScreenFilter, SCREENING_LABEL.newsletter)}
        {chip('transactional', screenFilter, setScreenFilter, SCREENING_LABEL.transactional)}
        {chip('cold_pitch', screenFilter, setScreenFilter, SCREENING_LABEL.cold_pitch)}
      </div>
      <div role="status" aria-live="polite">
        {openNote && <div className="hint">{openNote}</div>}
        {lastFix && (
          <div className="success" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              Moved “{lastFix.subject || 'this email'}” to {categoryLabel(lastFix.next)} ✓
            </span>
            {lastFix.previous && (
              <button className="ghost" style={{ minHeight: 36 }} onClick={() => void undoFix()}>
                Undo
              </button>
            )}
            <button className="ghost" style={{ minHeight: 36 }} onClick={() => setLastFix(null)}>
              OK
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <p className="hint" style={{ margin: '0 0 8px' }} aria-live="polite">
          {countLine()}
        </p>
        {rows.length === 0 && (
          <div className="empty">
            {source.length === 0 && !results
              ? 'No email here yet — press Check my email first.'
              : 'Nothing matches — try another filter or search.'}
          </div>
        )}
        {rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>From / subject</th>
                <th>Filed under</th>
                <th>Wrong? Move to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.subject}</strong>
                    <div className="hint">
                      {m.from_name || m.from_address} · {when(m.date)}
                      {accounts.length > 1 && m.account_id && (
                        <> · {accounts.find((a) => a.id === m.account_id)?.label ?? ''}</>
                      )}
                    </div>
                    <div className="hint">{m.snippet?.slice(0, 140)}</div>
                    {(attachments.get(m.id) ?? []).map((a) => (
                      <div key={a.id} className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }} data-attachment>
                        <span>
                          <span aria-hidden="true">📎 </span>
                          <strong>{a.filename}</strong> — {attachmentLine(a)}
                        </span>
                        {a.hasFile && (
                          <button className="ghost" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => void openAttachment(a)} title={`Open ${a.filename} with the app for it`}>
                            Open
                          </button>
                        )}
                      </div>
                    ))}
                  </td>
                  <td>
                    {m.category ? (
                      <span className={`pill ${m.category}`}>{categoryLabel(m.category)}</span>
                    ) : (
                      <span className="hint">Not sorted yet</span>
                    )}
                    {m.screening && SCREENING_LABEL[m.screening] && (
                      <div className="hint">{SCREENING_LABEL[m.screening]}</div>
                    )}
                    {m.sensitivity && m.sensitivity !== '[]' && (
                      <div>
                        <span className="pill sensitive" title="Looks private or confidential — kept out of shared summaries">
                          Private
                        </span>
                      </div>
                    )}
                    {m.action_summary && <div className="hint">{m.action_summary}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {CATEGORIES.filter((c) => c !== m.category).map((c) => (
                        <button key={c} className="ghost" style={{ minHeight: 36 }} onClick={() => void correct(m, c)}>
                          Move to {categoryLabel(c)}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
