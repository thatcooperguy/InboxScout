import { useEffect, useState } from 'react'
import Dashboard from './views/Dashboard'
import Review from './views/Review'
import Accounts from './views/Accounts'
import AiSettings from './views/AiSettings'
import Reports from './views/Reports'
import SettingsView from './views/Settings'
import Onboarding from './views/Onboarding'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'review', label: 'Inbox review' },
  { id: 'reports', label: 'Reports' },
  { id: 'accounts', label: 'Email accounts' },
  { id: 'ai', label: 'Connect AI' },
  { id: 'settings', label: 'Settings' }
] as const

type TabId = (typeof TABS)[number]['id']

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('dashboard')
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [onboarding, setOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    // First run = no accounts and no runs yet: show the Simple Mode wizard.
    void Promise.all([window.inboxScout.listAccounts(), window.inboxScout.listRuns()]).then(([accounts, runs]) =>
      setOnboarding(accounts.length === 0 && runs.length === 0)
    )
  }, [])

  useEffect(() => {
    const offProgress = window.inboxScout.onRunProgress((p) => {
      setRunning(p.phase !== 'done' && p.phase !== 'error')
      setStatus(p.detail)
    })
    const offFinished = window.inboxScout.onRunFinished((r) => {
      setRunning(false)
      setStatus(r.error ? `Failed: ${r.error}` : 'Brief ready.')
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

  if (onboarding === null) return <div />
  if (onboarding) {
    return (
      <Onboarding
        onDone={() => {
          setOnboarding(false)
          setRefreshKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">📬 InboxScout</div>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="status">{status}</div>
        <button className="run-btn" onClick={runNow} disabled={running}>
          {running ? 'Running…' : '▶ Run now'}
        </button>
      </nav>
      <main className="content">
        {tab === 'dashboard' && <Dashboard key={`d${refreshKey}`} />}
        {tab === 'review' && <Review key={`v${refreshKey}`} />}
        {tab === 'reports' && <Reports key={`r${refreshKey}`} />}
        {tab === 'accounts' && <Accounts />}
        {tab === 'ai' && <AiSettings />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
