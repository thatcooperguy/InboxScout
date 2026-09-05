import { useEffect, useState } from 'react'
import Dashboard from './views/Dashboard'
import Review from './views/Review'
import Accounts from './views/Accounts'
import AiSettings from './views/AiSettings'
import Reports from './views/Reports'
import SettingsView from './views/Settings'

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

  useEffect(() => {
    const offProgress = window.inboxIntel.onRunProgress((p) => {
      setRunning(p.phase !== 'done' && p.phase !== 'error')
      setStatus(p.detail)
    })
    const offFinished = window.inboxIntel.onRunFinished((r) => {
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
    const res = await window.inboxIntel.runNow()
    if (!res.started) {
      setRunning(false)
      setStatus(res.reason ?? '')
    }
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">📬 Inbox Intel</div>
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
