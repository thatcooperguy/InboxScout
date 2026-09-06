import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'

const ROLE_LABEL: Record<string, string> = {
  family: '👪 Family',
  friend: '🙂 Friend',
  colleague: '💼 Colleague',
  client: '🤝 Client',
  vendor: '🏷 Vendor',
  service: '🛎 Service',
  automated: '🤖 Automated',
  unknown: '👤 Someone'
}
const ROLE_ORDER = ['family', 'friend', 'colleague', 'client', 'vendor', 'service', 'automated', 'unknown']
const TIER_LABEL: Record<string, string> = { inner: 'Inner circle', regular: 'Regular', occasional: 'Occasional' }
const TIER_HINT: Record<string, string> = {
  inner: 'The people you write to most. Their mail is always treated as important.',
  regular: 'People you hear from often.',
  occasional: 'People who write now and then.'
}

type ListKey = 'vipSenders' | 'mutedSenders'

const shortDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

/**
 * Your circle, learned from mail across every inbox. Nothing to set up;
 * two quiet buttons let you correct it. This screen also owns the two
 * hand-written lists: "Important people" and "Never bother me about".
 */
export default function People(): JSX.Element {
  const level = useLevel()
  const [people, setPeople] = useState<any[]>([])
  const [settings, setSettings] = useState<any | null>(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [draft, setDraft] = useState<Record<ListKey, string>>({ vipSenders: '', mutedSenders: '' })
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  const load = (): void => {
    void window.inboxScout.listPeople().then(setPeople)
    void window.inboxScout.getSettings().then(setSettings)
  }
  useEffect(load, [])

  useEffect(() => {
    if (!status?.ok) return
    const t = setTimeout(() => setStatus(null), 6000)
    return () => clearTimeout(t)
  }, [status])

  const mark = async (address: string, how: 'important' | 'quiet' | 'clear'): Promise<void> => {
    await window.inboxScout.markPerson(address, how)
    load()
  }

  /** Write one list. Re-reads settings first so a change made on another screen is never overwritten. */
  const writeList = async (key: ListKey, next: string[]): Promise<void> => {
    try {
      const fresh = await window.inboxScout.getSettings()
      const saved = await window.inboxScout.setSettings({ ...fresh, [key]: next })
      setSettings(saved ?? { ...fresh, [key]: next })
      setStatus({ ok: true, text: 'Saved ✓' })
    } catch (e) {
      setStatus({ ok: false, text: `Couldn’t save that. ${e instanceof Error ? e.message : ''}`.trim() })
    }
  }

  const addToList = async (key: ListKey): Promise<void> => {
    const value = draft[key].trim()
    if (!value || !settings) return
    const current: string[] = settings[key] ?? []
    if (current.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setDraft({ ...draft, [key]: '' })
      return
    }
    setDraft({ ...draft, [key]: '' })
    await writeList(key, [...current, value])
  }

  const removeFromList = async (key: ListKey, value: string): Promise<void> => {
    if (!settings) return
    const current: string[] = settings[key] ?? []
    await writeList(
      key,
      current.filter((s) => s !== value)
    )
  }

  if (!settings) return <div className="empty">📬 Opening your people…</div>

  const vip = new Set((settings.vipSenders ?? []).map((s: string) => s.toLowerCase()))
  const quiet = new Set((settings.quietPeople ?? []).map((s: string) => s.toLowerCase()))
  const q = query.trim().toLowerCase()
  const rows = people.filter(
    (p) =>
      (roleFilter === 'all' || p.role === roleFilter) &&
      (!q || `${p.name} ${p.addresses.join(' ')} ${p.role}`.toLowerCase().includes(q))
  )
  const tiers: ('inner' | 'regular' | 'occasional')[] = ['inner', 'regular', 'occasional']
  const rolesPresent = ROLE_ORDER.filter((r) => people.some((p) => p.role === r))
  const filtered = q !== '' || roleFilter !== 'all'

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
          ...(active ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 } : {})
        }}
        onClick={() => set(value)}
      >
        {active ? '✓ ' : ''}
        {label}
      </button>
    )
  }

  const listEditor = (key: ListKey, title: string, hint: string, placeholder: string, addLabel: string): JSX.Element => {
    const items: string[] = settings[key] ?? []
    const inputId = `people-add-${key}`
    return (
      <div className="card">
        <h3 id={`people-list-${key}`}>{title}</h3>
        <p className="hint" style={{ marginTop: 0 }}>{hint}</p>
        <ul aria-labelledby={`people-list-${key}`} style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.length === 0 && <li className="hint">Nobody yet.</li>}
          {items.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="ghost"
                aria-label={`Remove ${s} from ${title}`}
                title={`Remove ${s}`}
                style={{ minHeight: 36, borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => void removeFromList(key, s)}
              >
                <span>{s}</span>
                <span aria-hidden="true" style={{ fontWeight: 700 }}>×</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault()
            void addToList(key)
          }}
        >
          <label htmlFor={inputId} className="field" style={{ flex: 1, margin: 0 }}>
            <span>Name or email address</span>
            <input
              id={inputId}
              value={draft[key]}
              placeholder={placeholder}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
          <button type="submit" className="ghost" style={{ minHeight: 40 }} disabled={!draft[key].trim()}>
            {addLabel}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div>
      <h1>People</h1>
      <p className="sub">
        Who is in your life, learned from your mail across every inbox — family, friends, clients, and the services that write to
        you. Inner-circle mail is always treated as important. Correct anything with the two buttons.
      </p>
      <div role="status" aria-live="polite">
        {status && <div className={status.ok ? 'success' : 'error'}>{status.text}</div>}
      </div>
      <label htmlFor="people-search" className="hint" style={{ position: 'absolute', left: -9999 }}>
        Search people
      </label>
      <input
        id="people-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people…"
        style={{ marginBottom: 12 }}
      />
      {level === 'pro' && rolesPresent.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span className="hint" style={{ marginRight: 4 }}>Role:</span>
          {chip('all', roleFilter, setRoleFilter, 'All')}
          {rolesPresent.map((r) => chip(r, roleFilter, setRoleFilter, ROLE_LABEL[r].replace(/^\S+\s/, '')))}
        </div>
      )}
      {people.length === 0 && (
        <div className="empty">
          Nobody here yet.
          <div className="hint" style={{ marginTop: 6 }}>Press Check my email once and your circle appears here.</div>
        </div>
      )}
      {people.length > 0 && (
        <p className="hint" aria-live="polite" style={{ margin: '0 0 10px' }}>
          {filtered ? `Showing ${rows.length} of ${people.length} people` : `${people.length} people`}
        </p>
      )}
      {people.length > 0 && rows.length === 0 && <div className="empty">Nobody matches — try another name.</div>}
      {tiers.map((tier) => {
        const items = rows.filter((p) => p.tier === tier)
        if (items.length === 0) return null
        return (
          <div className="card" key={tier}>
            <h3 style={{ marginBottom: 2 }}>
              {TIER_LABEL[tier]} ({items.length})
            </h3>
            <p className="hint" style={{ margin: '0 0 8px' }}>{TIER_HINT[tier]}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((p) => {
                const addr = String(p.addresses[0] ?? p.key).toLowerCase()
                const isVip = p.addresses.some((a: string) => vip.has(a.toLowerCase()))
                const isQuiet = p.addresses.some((a: string) => quiet.has(a.toLowerCase()))
                const counts = `${p.received} received · ${p.sent} sent${p.accounts.length > 1 ? ` · ${p.accounts.length} inboxes` : ''}`
                return (
                  <li
                    key={p.key}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <strong>{p.name || addr}</strong>{' '}
                      <span className="hint" title={counts}>
                        {ROLE_LABEL[p.role] ?? p.role}
                        {p.lastSeen ? ` · last heard ${shortDate(p.lastSeen)}` : ''}
                        {p.goingQuiet ? ` · quiet for ${p.quietDays} days` : ''}
                        {p.isNew ? ' · new' : ''}
                        {level === 'pro' ? ` · ${counts}` : ''}
                      </span>
                      <div className="hint" style={{ fontSize: 12.5 }}>{p.addresses.join(', ')}</div>
                    </span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      {isVip || isQuiet ? (
                        <>
                          <span className={`badge ${isVip ? 'you' : 'muted'}`}>{isVip ? '⭐ Always important' : '🔕 Lower priority'}</span>
                          <button className="ghost" style={{ minHeight: 40 }} onClick={() => void mark(addr, 'clear')}>
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="ghost" style={{ minHeight: 40 }} onClick={() => void mark(addr, 'important')}>
                            ⭐ Always important
                          </button>
                          <button
                            className="ghost"
                            style={{ minHeight: 40 }}
                            title="Their mail still arrives; it just won’t be flagged as needing you."
                            onClick={() => void mark(addr, 'quiet')}
                          >
                            🔕 Lower priority
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <h2 style={{ fontSize: 17, margin: '22px 0 4px' }}>Your own lists</h2>
      <p className="hint" style={{ margin: '0 0 12px' }}>
        Add anyone InboxScout hasn’t met yet. A name matches loosely; an email address matches exactly.
      </p>
      <div className="grid2">
        {listEditor(
          'vipSenders',
          '⭐ Important people',
          'Anything from these people is always treated as important — the same as pressing “Always important” above.',
          'Mom or boss@company.com',
          'Add person'
        )}
        {listEditor(
          'mutedSenders',
          '🔇 Never bother me about',
          'Mail from these senders is filed under Ads & newsletters and kept out of your brief.',
          'deals@store.com',
          'Add sender'
        )}
      </div>
    </div>
  )
}
