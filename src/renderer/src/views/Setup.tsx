import { useState } from 'react'
import Accounts from './Accounts'
import AiSettings from './AiSettings'
import Skills from './Skills'
import SettingsView from './Settings'

type Sub = 'hub' | 'accounts' | 'ai' | 'skills' | 'prefs'

interface Props {
  onSettingsChanged: () => void
}

/** One friendly hub instead of five tabs. */
export default function Setup({ onSettingsChanged }: Props): JSX.Element {
  const [sub, setSub] = useState<Sub>('hub')

  if (sub !== 'hub') {
    return (
      <div>
        <button className="back-link" onClick={() => setSub('hub')}>
          ← Back to Setup
        </button>
        {sub === 'accounts' && <Accounts />}
        {sub === 'ai' && <AiSettings />}
        {sub === 'skills' && <Skills />}
        {sub === 'prefs' && <SettingsView onSaved={onSettingsChanged} />}
      </div>
    )
  }

  return (
    <div>
      <h1>Setup</h1>
      <p className="sub">Everything has a sensible default. Change only what you want.</p>
      <div className="hub-grid">
        <button className="hub-btn" onClick={() => setSub('accounts')}>
          <span className="icon">📬</span>
          <strong>Email accounts</strong>
          <span className="sub">Connect Gmail, Yahoo, iCloud, or any other mailbox. Read-only, always.</span>
        </button>
        <button className="hub-btn" onClick={() => setSub('skills')}>
          <span className="icon">🔎</span>
          <strong>What to watch for</strong>
          <span className="sub">Bills, appointments, deals, deliveries, important people, and more.</span>
        </button>
        <button className="hub-btn" onClick={() => setSub('ai')}>
          <span className="icon">🧠</span>
          <strong>AI helper</strong>
          <span className="sub">Works free out of the box. Optionally connect a smarter AI.</span>
        </button>
        <button className="hub-btn" onClick={() => setSub('prefs')}>
          <span className="icon">⚙️</span>
          <strong>Preferences</strong>
          <span className="sub">Schedule, text size, your kind of work, privacy, advanced tools.</span>
        </button>
      </div>
    </div>
  )
}
