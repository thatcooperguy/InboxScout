import { useEffect, useMemo, useState } from 'react'

interface Props {
  /** Currently chosen profile id. */
  value: string
  /** True when InboxScout picks the profile from the mail. */
  auto: boolean
  /** Called with a profile id, or 'auto'. */
  onChoose: (id: string | 'auto') => void
  /** Show the "choose for me" card first (default true). */
  showAuto?: boolean
}

/**
 * Grouped, searchable picker for the 50+ profiles. Big cards, plain words,
 * and a "Let InboxScout figure it out" option up front.
 */
export default function ProfilePicker({ value, auto, onChoose, showAuto = true }: Props): JSX.Element {
  const [profiles, setProfiles] = useState<any[]>([])
  const [groups, setGroups] = useState<{ id: string; name: string; icon: string }[]>([])
  const [query, setQuery] = useState('')
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  useEffect(() => {
    void window.inboxScout.listProfiles().then(setProfiles)
    void window.inboxScout.profileGroups().then(setGroups)
  }, [])

  const current = profiles.find((p) => p.id === value)
  useEffect(() => {
    if (current && openGroup === null) setOpenGroup(current.group)
  }, [current, openGroup])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? profiles.filter((p) => `${p.name} ${p.tagline} ${p.pulseName}`.toLowerCase().includes(q)) : profiles),
    [profiles, q]
  )

  const selectedStyle = { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' }

  return (
    <div>
      {showAuto && (
        <button className="hub-btn" style={{ width: '100%', textAlign: 'left', marginBottom: 10, ...(auto ? selectedStyle : {}) }} onClick={() => onChoose('auto')}>
          <span className="icon">✨</span>
          <strong>Let InboxScout figure it out{auto ? ' ✓' : ''} (recommended)</strong>
          <span className="sub">
            It reads what your mail looks like and picks the best fit after each scan.
            {auto && current ? ` Right now: ${current.icon} ${current.name}.` : ''} You can lock a choice below any time.
          </span>
        </button>
      )}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: nurse, landlord, retiree, developer…" style={{ marginBottom: 10 }} />
      {groups.map((g) => {
        const items = filtered.filter((p) => p.group === g.id)
        if (items.length === 0) return null
        const open = !!q || openGroup === g.id
        return (
          <div key={g.id} style={{ marginBottom: 8 }}>
            <button className="ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 600 }} onClick={() => setOpenGroup(open && !q ? null : g.id)}>
              {g.icon} {g.name} <span className="hint">({items.length}){open ? ' ▾' : ' ▸'}</span>
            </button>
            {open && (
              <div className="hub-grid" style={{ marginTop: 6 }}>
                {items.map((p) => (
                  <button key={p.id} className="hub-btn" style={!auto && value === p.id ? selectedStyle : {}} onClick={() => onChoose(p.id)}>
                    <span className="icon">{p.icon}</span>
                    <strong>{p.name}</strong>
                    <span className="sub">{p.tagline}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {q && filtered.length === 0 && <p className="hint">Nothing matches — pick the closest group, or "Let InboxScout figure it out".</p>}
    </div>
  )
}
