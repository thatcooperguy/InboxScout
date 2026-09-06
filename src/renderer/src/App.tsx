import { useCallback, useEffect, useState } from 'react'
import Today from './views/Today'
import Dashboard from './views/Dashboard'
import Review from './views/Review'
import Reports from './views/Reports'
import People from './views/People'
import Setup from './views/Setup'
import Onboarding from './views/Onboarding'
import Eula from './views/Eula'
import { EULA_VERSION } from '../../shared/eula'
import { LEVEL_BLURB, LEVEL_LABEL } from '../../shared/adapt'
import { t } from './copy'

type UiLevelInfo = Awaited<ReturnType<typeof window.inboxScout.uiLevel>>

type TabId = 'today' | 'reports' | 'people' | 'setup' | 'dashboard' | 'review'

const SIMPLE_TABS: { id: TabId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'reports', label: 'My briefs' },
  { id: 'people', label: 'People' },
  { id: 'setup', label: 'Setup' }
]
const ADVANCED_TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Details' },
  { id: 'review', label: 'Inbox review' }
]

const ZOOM: Record<string, string> = { normal: '1', large: '1.2', xlarge: '1.4' }

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('today')
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [onboarding, setOnboarding] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<any | null>(null)
  const [ui, setUi] = useState<UiLevelInfo | null>(null)
  const [lastNotices, setLastNotices] = useState<string[]>([])

  const loadSettings = useCallback(() => {
    void window.inboxScout.getSettings().then((s) => {
      setSettings(s)
      // Text size for all ages: zoom the whole UI rather than restyling every element.
      ;(document.body.style as any).zoom = ZOOM[s.textSize] ?? '1'
    })
    void window.inboxScout.uiLevel().then(setUi)
  }, [])

  const goTo = (id: TabId): void => {
    setTab(id)
    void window.inboxScout.track('tab', id)
  }

  // Keyboard: R checks email, 1–6 switch tabs, / focuses the first search box. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        void runNow()
      } else if (/^[1-6]$/.test(e.key)) {
        const all: TabId[] = ['today', 'reports', 'people', 'setup', 'dashboard', 'review']
        const id = all[Number(e.key) - 1]
        if (id) goTo(id)
      } else if (e.key === '/') {
        const box = document.querySelector<HTMLInputElement>('main input[placeholder^="Search"]')
        if (box) {
          e.preventDefault()
          box.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running])

  useEffect(() => {
    loadSettings()
    void Promise.all([window.inboxScout.listAccounts(), window.inboxScout.listRuns()]).then(([accounts, runs]) =>
      setOnboarding(accounts.length === 0 && runs.length === 0)
    )
  }, [loadSettings])

  useEffect(() => {
    const offProgress = window.inboxScout.onRunProgress((p) => {
      setRunning(p.phase !== 'done' && p.phase !== 'error')
      setStatus(p.detail)
    })
    const offFinished = window.inboxScout.onRunFinished((r) => {
      setRunning(false)
      setStatus(r.error ? `Problem: ${r.error}` : r.notices?.length ? `Brief ready. ${r.notices[0]}` : 'Brief ready.')
      setLastNotices(Array.isArray(r.notices) ? r.notices : [])
      setRefreshKey((k) => k + 1)
    })
    return () => {
      offProgress()
      offFinished()
    }
  }, [])

  const runNow = async (): Promise<void> => {
    setRunning(true)
    setStatus('Starting…')
    const res = await window.inboxScout.runNow()
    if (!res.started) {
      setRunning(false)
      setStatus(res.reason ?? '')
    }
  }

  if (onboarding === null || settings === null) {
    return (
      <div className="empty" style={{ padding: 80, fontSize: 18 }} role="status">
        📬 InboxScout — opening…
      </div>
    )
  }
  // The plain-language terms come first, once per version, before anything else can happen.
  if (settings.eulaAcceptedVersion !== EULA_VERSION) {
    return <Eula onAccepted={loadSettings} />
  }
  if (onboarding) {
    return (
      <Onboarding
        onDone={() => {
          setOnboarding(false)
          setRefreshKey((k) => k + 1)
          loadSettings()
        }}
      />
    )
  }

  // The level decides how much to show; an explicit "advanced tools" choice still works at Standard.
  const level = ui?.level ?? 'standard'
  const tabs =
    level === 'simple'
      ? SIMPLE_TABS.filter((t) => t.id !== 'people')
      : level === 'pro' || !settings.simpleMode
        ? [...SIMPLE_TABS, ...ADVANCED_TABS]
        : SIMPLE_TABS

  return (
    <div className={`layout level-${level}`}>
      <nav className="sidebar">
        <div className="brand">📬 InboxScout</div>
        {tabs.map((tb, i) => (
          <button key={tb.id} className={tab === tb.id ? 'active' : ''} aria-current={tab === tb.id ? 'page' : undefined} onClick={() => goTo(tb.id)} title={level === 'pro' ? `Press ${i + 1}` : undefined}>
            {tb.id === 'reports' ? t('tab.reports', level) : tb.id === 'review' ? t('tab.review', level) : tb.label}
          </button>
        ))}
        <div className="spacer" />
        {level !== 'simple' && (
          <div className="status" role="status" aria-live="polite">
            {status}
          </div>
        )}
        {level !== 'simple' && (
          <button className="run-btn" onClick={() => void runNow()} disabled={running}>
            {running ? t('hero.running', level) : `✉ ${t('hero.run', level)}`}
          </button>
        )}
      </nav>
      <main className="content">
        {ui?.announce && (
          <div className="success" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <span>
              InboxScout switched to the <strong>{LEVEL_LABEL[ui.level]}</strong> layout — {ui.reasons.slice(0, 2).join(', ')}. {LEVEL_BLURB[ui.level]}
            </span>
            <button className="primary" onClick={() => void window.inboxScout.uiAckLevel().then(setUi)}>
              Sounds good
            </button>
            <button className="ghost" onClick={() => void window.inboxScout.uiRevertLevel().then(setUi)}>
              Keep it the way it was
            </button>
          </div>
        )}
        {tab === 'today' && <Today key={`t${refreshKey}`} running={running} onRun={() => void runNow()} level={level} status={status} notices={lastNotices} onGoTo={(id) => goTo(id as TabId)} />}
        {tab === 'reports' && <Reports key={`r${refreshKey}`} />}
        {tab === 'people' && <People key={`p${refreshKey}`} />}
        {tab === 'setup' && (
          <Setup
            onSettingsChanged={() => {
              loadSettings()
              setRefreshKey((k) => k + 1)
            }}
          />
        )}
        {tab === 'dashboard' && <Dashboard key={`d${refreshKey}`} />}
        {tab === 'review' && <Review key={`v${refreshKey}`} />}
      </main>
    </div>
  )
}
