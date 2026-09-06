import { useEffect, useState } from 'react'

const ROLE_LABEL: Record<string, string> = {
  family: '👪 Family',
  friend: '🙂 Friend',
  colleague: '💼 Colleague',
  client: '🤝 Client',
  vendor: '🏷 Vendor',
  service: '🛎 Service',
  automated: '🤖 Automated',
  unknown: '👤'
}
const TIER_LABEL: Record<string, string> = { inner: 'Inner circle', regular: 'Regular', occasional: 'Occasional' }

/**
 * Your circle, learned from mail across every inbox. Nothing to set up;
 * two quiet buttons let you correct it.
 */
export default function People(): JSX.Element {
  const [people, setPeople] = useState<any[]>([])
  const [settings, setSettings] = useState<any | null>(null)
  const [query, setQuery] = useState('')

  const load = (): void => {
    void window.inboxScout.listPeople().then(setPeople)
    void window.inboxScout.getSettings().then(setSettings)
  }
  useEffect(load, [])

  const mark = async (address: string, how: 'important' | 'quiet' | 'clear'): Promise<void> => {
    await window.inboxScout.markPerson(address, how)
    load()
  }

  if (!settings) return <div className="empty">Loading…</div>
  const vip = new Set((settings.vipSenders ?? []).map((s: string) => s.toLowerCase()))
  const quiet = new Set((settings.quietPeople ?? []).map((s: string) => s.toLowerCase()))
  const q = query.trim().toLowerCase()
  const rows = people.filter((p) => !q || `${p.name} ${p.addresses.join(' ')} ${p.role}`.toLowerCase().includes(q))
  const tiers: ('inner' | 'regular' | 'occasional')[] = ['inner', 'regular', 'occasional']

  return (
    <div>
      <h1>People</h1>
      <p className="sub">
        Who is in your life, learned from your mail across every inbox — family, friends, clients, and the services that write to you.
        Inner-circle mail is always treated as important. Correct anything with the two buttons.
      </p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" style={{ marginBottom: 12 }} />
      {people.length === 0 && <div className="empty">Check your email once and your circle appears here.</div>}
      {tiers.map((tier) => {
        const items = rows.filter((p) => p.tier === tier)
        if (items.length === 0) return null
        return (
          <div className="card" key={tier}>
            <h3>{TIER_LABEL[tier]}</h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((p) => {
                const addr = String(p.addresses[0] ?? p.key).toLowerCase()
                const isVip = p.addresses.some((a: string) => vip.has(a.toLowerCase()))
                const isQuiet = p.addresses.some((a: string) => quiet.has(a.toLowerCase()))
                return (
                  <li key={p.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                    <span>
                      <strong>{p.name || addr}</strong>{' '}
                      <span className="hint">
                        {ROLE_LABEL[p.role] ?? p.role} · {p.received} received · {p.sent} sent · last {new Date(p.lastSeen).toLocaleDateString()}
                        {p.goingQuiet ? ` · quiet for ${p.quietDays} days` : ''}
                        {p.isNew ? ' · new' : ''}
                        {p.accounts.length > 1 ? ` · ${p.accounts.length} inboxes` : ''}
                      </span>
                      <div className="hint" style={{ fontSize: 12.5 }}>{p.addresses.join(', ')}</div>
                    </span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      {isVip || isQuiet ? (
                        <button className="ghost tiny" onClick={() => void mark(addr, 'clear')}>
                          {isVip ? '⭐ Always important ✓' : '🔕 Not important ✓'} · undo
                        </button>
                      ) : (
                        <>
                          <button className="ghost tiny" onClick={() => void mark(addr, 'important')}>
                            ⭐ Always important
                          </button>
                          <button className="ghost tiny" onClick={() => void mark(addr, 'quiet')}>
                            🔕 Not important
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
    </div>
  )
}
