import { useEffect, useState } from 'react'
import ProfilePicker from './ProfilePicker'

interface Props {
  onDone: () => void
}

/**
 * Simple Mode first-run wizard: three plain-language steps a
 * non-technical user can finish alone. Everything else is preset.
 */
export default function Onboarding({ onDone }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [profiles, setProfiles] = useState<any[]>([])
  const [profileId, setProfileId] = useState('general')
  const [profileAuto, setProfileAuto] = useState(true)
  const [presets, setPresets] = useState<Record<string, any>>({})
  const [provider, setProvider] = useState('gmail')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [host, setHost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    void window.inboxScout.listProfiles().then(setProfiles)
    void window.inboxScout.accountPresets().then(setPresets)
  }, [])

  const preset = presets[provider] ?? { host: '', port: 993, sentFolder: 'Sent', help: '' }

  const saveProfile = async (): Promise<void> => {
    await window.inboxScout.chooseProfile(profileAuto ? 'auto' : profileId)
    setStep(2)
  }

  const connectAccount = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.inboxScout.addAccount({
        label: email,
        email,
        provider,
        host: provider === 'imap' ? host : preset.host,
        port: preset.port ?? 993,
        password,
        sentFolder: preset.sentFolder
      })
      setConnected(true)
      setStep(3)
    } catch (err: any) {
      setError(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  const finish = (runNow: boolean): void => {
    if (runNow) void window.inboxScout.runNow()
    onDone()
  }

  return (
    <div style={{ maxWidth: 560, margin: '48px auto' }}>
      {step === 0 && (
        <div className="card">
          <h1>👋 Welcome to InboxScout</h1>
          <p>
            InboxScout reads your email (it can never send or delete anything), separates personal from work, and
            gives you a short daily brief of what actually needs your attention.
          </p>
          <p>Setup takes about two minutes, and everything runs free on this computer.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={() => setStep(1)}>
              Get started
            </button>
            <button className="ghost" onClick={onDone}>
              Set up later
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h1>Step 1 of 3 — Who is this inbox for?</h1>
          <p className="hint">
            This tunes what your brief pays attention to. Not sure? Let InboxScout figure it out — it looks at what your mail is
            about and picks from {profiles.length || '50+'} kinds of people. You can change it anytime in Settings.
          </p>
          <ProfilePicker
            value={profileId}
            auto={profileAuto}
            onChoose={(id) => {
              if (id === 'auto') setProfileAuto(true)
              else {
                setProfileAuto(false)
                setProfileId(id)
              }
            }}
          />
          <button className="primary" style={{ marginTop: 12 }} onClick={() => void saveProfile()}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h1>Step 2 of 3 — Connect your email</h1>
          <label className="field">
            <span>Where is your email?</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="gmail">Gmail</option>
              <option value="yahoo">Yahoo Mail</option>
              <option value="icloud">iCloud Mail</option>
              <option value="imap">Somewhere else (IMAP)</option>
            </select>
          </label>
          {preset.help && <p className="hint">{preset.help}</p>}
          <label className="field">
            <span>Email address</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>App password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="16-character app password"
            />
          </label>
          {provider === 'imap' && (
            <label className="field">
              <span>IMAP server</span>
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={busy || !email || !password} onClick={() => void connectAccount()}>
              {busy ? 'Testing connection…' : 'Connect'}
            </button>
            <button className="ghost" onClick={() => setStep(3)}>
              Skip for now
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h1>Step 3 of 3 — You're set{connected ? ' ✓' : ''}</h1>
          <p>
            InboxScout will scan every morning at 7:30 and save your brief to Documents. The free built-in engine is
            active — visit <strong>Setup → AI helper</strong> anytime to add a smarter (still free) AI, which also
            unlocks the <strong>Assistant</strong> that can do web chores like creating app passwords for you.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {connected ? (
              <button className="primary" onClick={() => finish(true)}>
                Run my first scan
              </button>
            ) : (
              <button className="primary" onClick={() => finish(false)}>
                Open InboxScout
              </button>
            )}
            <button className="ghost" onClick={() => finish(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
