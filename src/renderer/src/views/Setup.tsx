import { useEffect, useState } from 'react'
import Accounts from './Accounts'
import AiSettings from './AiSettings'
import Skills from './Skills'
import SettingsView from './Settings'
import SetupAssistant from './SetupAssistant'
import Assistant from './Assistant'
import Phone from './Phone'
import { useLevel } from '../useLevel'

type Sub = 'hub' | 'accounts' | 'ai' | 'skills' | 'prefs' | 'helper' | 'assistant' | 'phone'

interface Props {
  onSettingsChanged: () => void
}

interface Tile {
  id: Exclude<Sub, 'hub'>
  icon: string
  label: string
  sub: string
  /** One short line of current state ("2 accounts connected"). Empty until known. */
  state: string
  /** Amber when the state line is a heads-up ("1 thing needs attention"). */
  tone?: 'amber'
}

interface HubState {
  accounts: number | null
  aiName: string | null
  aiBuiltin: boolean
  watchers: number | null
  webReady: boolean | null
  google: boolean | null
  microsoft: boolean | null
  /** Health check: number of items needing attention; null until known, 0 when everything works. */
  attention: number | null
  /** "On your phone" switched on; null until known. */
  phone: boolean | null
}

const EMPTY: HubState = { accounts: null, aiName: null, aiBuiltin: true, watchers: null, webReady: null, google: null, microsoft: null, attention: null, phone: null }

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** One friendly hub instead of five tabs. Tiles are named by outcome and carry a one-line state. */
export default function Setup({ onSettingsChanged }: Props): JSX.Element {
  const [sub, setSub] = useState<Sub>('hub')
  const [showMore, setShowMore] = useState(false)
  const [hub, setHub] = useState<HubState>(EMPTY)
  const level = useLevel()

  // Refresh the state lines every time the hub is shown (sub-pages change them).
  useEffect(() => {
    if (sub !== 'hub') return
    let alive = true
    const api = window.inboxScout
    void api.listAccounts().then((a) => alive && setHub((h) => ({ ...h, accounts: a.length }))).catch(() => undefined)
    void api
      .aiProviders()
      .then((ps) => {
        if (!alive) return
        const active = ps.find((p) => p.active)
        setHub((h) => ({ ...h, aiName: active?.name ?? null, aiBuiltin: !active || active.id === 'builtin' }))
      })
      .catch(() => undefined)
    void api
      .skillsList()
      .then((r) => alive && setHub((h) => ({ ...h, watchers: r.skills.filter((s) => s.enabled).length })))
      .catch(() => undefined)
    void api.agentRecipes().then((r) => alive && setHub((h) => ({ ...h, webReady: r.aiReady }))).catch(() => undefined)
    void api
      .setupInfo()
      .then((i) => alive && setHub((h) => ({ ...h, google: i.google.configured, microsoft: i.microsoft.configured })))
      .catch(() => undefined)
    void api
      .healthStatus()
      .then((r) => alive && setHub((h) => ({ ...h, attention: r.ok ? 0 : r.items.filter((i) => i.status === 'warn' || i.status === 'fail').length || 1 })))
      .catch(() => undefined)
    void api.phoneInfo().then((p) => alive && setHub((h) => ({ ...h, phone: p.enabled }))).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [sub])

  const simple = level === 'simple'
  const providerMissing = hub.google === false || hub.microsoft === false
  const showSignin = level === 'pro' || providerMissing

  const accountsState =
    hub.accounts === null ? '' : hub.accounts === 0 ? 'No email connected yet' : `${plural(hub.accounts, 'account', 'accounts')} connected`
  const aiState = hub.aiBuiltin ? 'Built-in engine' : hub.aiName ? `${hub.aiName} connected` : ''
  const watchState = hub.watchers === null ? '' : simple ? `Watching for ${plural(hub.watchers, 'thing', 'things')}` : `${plural(hub.watchers, 'watcher', 'watchers')} on`
  const webState = hub.webReady === null ? '' : hub.webReady ? 'Ready' : simple ? 'Needs Smarter sorting first' : 'Needs Smarter sorting (AI) first'
  const signinState =
    hub.google === null ? '' : `Google ${hub.google ? 'ready' : 'not set up'} · Microsoft ${hub.microsoft ? 'ready' : 'not set up'}`
  const levelState = level === 'simple' ? 'Simple view' : level === 'pro' ? 'Pro view' : 'Standard view'
  const needsAttention = hub.attention !== null && hub.attention > 0
  const prefsState = needsAttention ? `${plural(hub.attention!, 'thing needs', 'things need')} attention` : levelState
  const phoneState = hub.phone === null ? '' : hub.phone ? 'On · scan the code' : 'Off — tap to show a code'

  // Order is fixed at every level: Email accounts first, then What to watch for, Preferences, then the helpers.
  const allTiles: Tile[] = [
    {
      id: 'accounts',
      icon: '📬',
      label: 'Email accounts',
      sub: simple ? 'Tell me where your email is. I only read it, never send.' : 'Connect Gmail, Yahoo, iCloud, Outlook, or any other mailbox. Read-only, always.',
      state: accountsState
    },
    {
      id: 'skills',
      icon: '🔎',
      label: 'What to watch for',
      sub: 'Bills, appointments, deals, deliveries, important people, and more.',
      state: watchState
    },
    {
      id: 'prefs',
      icon: simple ? '🔊' : '⚙️',
      label: simple ? 'Text & voice' : 'Preferences',
      sub: simple ? 'Bigger text, read aloud, and how much to show.' : 'Schedule, text size, your kind of work, privacy, advanced tools.',
      state: prefsState,
      tone: needsAttention ? 'amber' : undefined
    },
    {
      id: 'phone',
      icon: '📱',
      label: 'On your phone',
      sub: simple ? 'See your brief on your phone. Scan a code, no app store.' : 'Your brief on your phone over home Wi‑Fi: scan a code, add it to your home screen. No app store.',
      state: phoneState
    },
    {
      id: 'ai',
      icon: '🧠',
      label: simple ? 'Smarter sorting' : 'Smarter sorting (AI)',
      sub: simple ? 'Works already. You can add a free smart helper.' : 'Works free out of the box. Optionally add a free AI for smarter sorting and briefs.',
      state: aiState
    },
    {
      id: 'assistant',
      icon: '🤖',
      label: simple ? 'Help me with a website' : 'Web chores',
      sub: simple ? 'I open the website and do the steps for you.' : 'InboxScout drives a browser for you — app passwords, sign-in setup, and more — in its own window.',
      state: webState
    },
    {
      id: 'helper',
      icon: '🧑‍💻',
      label: 'Sign-in setup',
      sub: 'One-time Google & Microsoft registration for whoever installed InboxScout from source. Official builds have it built in.',
      state: signinState
    }
  ]
  const tiles = allTiles.filter((t) => t.id !== 'helper' || showSignin)

  const frontIds: Tile['id'][] = simple ? ['accounts', 'prefs', 'phone', 'assistant'] : tiles.map((t) => t.id)
  const front = frontIds.map((id) => tiles.find((t) => t.id === id)).filter((t): t is Tile => !!t)
  const more = tiles.filter((t) => !frontIds.includes(t.id))

  if (sub !== 'hub') {
    return (
      <div>
        <button className="back-link" style={{ minHeight: 36, padding: '6px 0' }} onClick={() => setSub('hub')}>
          ← Back to Setup
        </button>
        {sub === 'accounts' && <Accounts />}
        {sub === 'ai' && <AiSettings />}
        {sub === 'skills' && <Skills />}
        {sub === 'prefs' && <SettingsView onSaved={onSettingsChanged} />}
        {sub === 'helper' && <SetupAssistant onConnectAccount={() => setSub('accounts')} />}
        {sub === 'assistant' && <Assistant />}
        {sub === 'phone' && <Phone />}
      </div>
    )
  }

  const renderTile = (t: Tile): JSX.Element => (
    <button key={t.id} className="hub-btn" onClick={() => setSub(t.id)}>
      <span className="icon" aria-hidden="true">
        {t.icon}
      </span>
      <strong>{t.label}</strong>
      <span className="sub">{t.sub}</span>
      {t.state && (
        <span className="sub" style={{ display: 'block', marginTop: 8, color: t.tone === 'amber' ? 'var(--amber, #a6641b)' : 'var(--ink-soft)', fontWeight: 600 }}>
          {t.tone === 'amber' ? '⚠ ' : ''}
          {t.state}
        </span>
      )}
    </button>
  )

  return (
    <div>
      <h1>Setup</h1>
      <p className="sub">{simple ? 'Everything already works. Change only what you want.' : 'Everything has a sensible default. Change only what you want.'}</p>
      <div className="hub-grid">{front.map(renderTile)}</div>
      {more.length > 0 && !showMore && (
        <button className="ghost" style={{ marginTop: 16, minHeight: 40 }} aria-expanded={false} onClick={() => setShowMore(true)}>
          Show more setup
        </button>
      )}
      {more.length > 0 && showMore && (
        <>
          <h3 style={{ margin: '20px 0 10px', fontSize: 15 }}>More setup</h3>
          <div className="hub-grid">{more.map(renderTile)}</div>
        </>
      )}
    </div>
  )
}
