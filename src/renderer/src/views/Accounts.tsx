import { useEffect, useState } from 'react'

export default function Accounts(): JSX.Element {
  const [accounts, setAccounts] = useState<any[]>([])
  const [presets, setPresets] = useState<Record<string, any>>({})
  const [adding, setAdding] = useState(false)
  const [provider, setProvider] = useState('gmail')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(993)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string } | null>(null)
  const [assistantNote, setAssistantNote] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [autonomy, setAutonomy] = useState<'careful' | 'signin' | 'full'>('signin')

  useEffect(() => {
    void window.inboxScout.agentRecipes().then((r) => setAutonomy(r.autonomy))
    return window.inboxScout.onAgentEvent((e: any) => {
      if (e.message) setAssistantNote(e.message)
      if (e.status === 'done') load()
    })
  }, [])

  const letAssistant = async (): Promise<void> => {
    setError('')
    const willSignIn = autonomy !== 'careful' && signinPassword.trim()
    if (willSignIn) {
      try {
        await window.inboxScout.signinsSave(email, signinPassword)
      } catch (err: any) {
        setError(String(err?.message ?? err))
        return
      }
    }
    setAssistantNote(
      willSignIn
        ? 'Starting the assistant… it will sign in for you and only ask if a code is needed.'
        : 'Starting the assistant… a browser window will open. Sign in when it asks; it never sees your password.'
    )
    const recipeId = provider === 'gmail' ? 'gmail-app-password' : provider === 'yahoo' ? 'yahoo-app-password' : 'icloud-app-password'
    const r = await window.inboxScout.agentStart({ recipeId, params: { email } })
    if (!r.ok) setAssistantNote(r.summary ?? 'Could not start the assistant.')
  }

  useEffect(() => window.inboxScout.onOutlookDeviceCode((info: any) => setDeviceCode(info)), [])

  const signInGoogle = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const account = await window.inboxScout.googleSignIn()
      setOk(`Connected ${account.email} ✓ (Gmail signals on)`)
      setAdding(false)
      load()
    } catch (err: any) {
      setError(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  const signInOutlook = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    setDeviceCode(null)
    try {
      const account = await window.inboxScout.outlookSignIn()
      setOk(`Connected ${account.email} ✓`)
      setAdding(false)
      load()
    } catch (err: any) {
      setError(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
    } finally {
      setBusy(false)
      setDeviceCode(null)
    }
  }

  const load = (): void => {
    void window.inboxScout.listAccounts().then(setAccounts)
  }
  useEffect(() => {
    load()
    void window.inboxScout.accountPresets().then(setPresets)
  }, [])

  const preset = presets[provider] ?? { host: '', port: 993, sentFolder: 'Sent', help: '' }

  const add = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      await window.inboxScout.addAccount({
        label: email,
        email,
        provider,
        host: provider === 'imap' ? host : preset.host,
        port: provider === 'imap' ? port : preset.port,
        password,
        sentFolder: preset.sentFolder
      })
      setOk(`Connected ${email} ✓`)
      setEmail('')
      setPassword('')
      setAdding(false)
      load()
    } catch (err: any) {
      setError(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    await window.inboxScout.removeAccount(id)
    load()
  }

  return (
    <div>
      <h1>Email accounts</h1>
      <p className="sub">Read-only access — InboxScout can never send, delete, or change your mail.</p>
      {ok && <div className="success">{ok}</div>}
      <div className="card">
        <h3>Connected accounts</h3>
        {accounts.length === 0 && <div className="empty">No accounts yet.</div>}
        <table>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.email}</strong>
                  <div className="hint">
                    {a.provider} · {a.host}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="ghost tiny" onClick={() => void remove(a.id)}>
                    Disconnect & forget password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!adding && (
        <button className="primary" onClick={() => setAdding(true)}>
          + Connect an account
        </button>
      )}
      {adding && (
        <div className="card">
          <h3>Connect an account</h3>
          <label className="field">
            <span>Email provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="gmail">Gmail</option>
              <option value="yahoo">Yahoo Mail</option>
              <option value="icloud">iCloud Mail</option>
              <option value="outlook">Outlook.com / Hotmail / Live</option>
              <option value="imap">Other (IMAP)</option>
            </select>
          </label>
          {provider === 'gmail' && (
            <div className="card" style={{ background: 'var(--blue-soft)', borderColor: 'var(--blue)' }}>
              <strong>Best for Gmail: Sign in with Google</strong>
              <p className="hint" style={{ margin: '4px 0 10px' }}>
                Uses Google's own sign-in page (no app password) and gives InboxScout Gmail's Promotions/Social/Updates
                labels and Important markers for much better sorting. Needs a one-time Google app setup by whoever
                installed InboxScout (docs/GOOGLE.md). Otherwise use an app password below.
              </p>
              {error && <div className="error">{error}</div>}
              <button className="primary" onClick={() => void signInGoogle()} disabled={busy}>
                {busy ? 'Waiting for Google…' : 'Sign in with Google'}
              </button>
            </div>
          )}
          {provider === 'outlook' ? (
            <div>
              <p className="hint">
                Microsoft accounts sign in with a short code — no passwords to copy. Press the button, then type the code
                on the Microsoft page that opens.
              </p>
              {deviceCode && (
                <div className="success" style={{ fontSize: 16 }}>
                  Your code: <strong style={{ fontSize: 22, letterSpacing: 2 }}>{deviceCode.userCode}</strong>
                  <div style={{ marginTop: 8 }}>
                    <button className="primary" onClick={() => void window.inboxScout.openExternal(deviceCode.verificationUri)}>
                      Open the Microsoft sign-in page
                    </button>
                  </div>
                  <p className="hint">Waiting for you to finish signing in…</p>
                </div>
              )}
              {error && <div className="error">{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={() => void signInOutlook()} disabled={busy}>
                  {busy ? 'Waiting for Microsoft…' : 'Sign in with Microsoft'}
                </button>
                <button className="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
          <>
          {preset.help && <p className="hint">{preset.help}</p>}
          <label className="field">
            <span>Email address</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {(provider === 'gmail' || provider === 'yahoo' || provider === 'icloud') && (
            <div className="card" style={{ background: 'var(--good-soft)', borderColor: 'var(--good)' }}>
              <strong>🤖 Don't want to hunt for an app password? Let the assistant do it.</strong>
              <p className="hint" style={{ margin: '4px 0 10px' }}>
                It opens {provider === 'gmail' ? "Google's" : provider === 'yahoo' ? "Yahoo's" : "Apple's"} page in its own window, you sign in, and it creates the
                app password and connects the account for you. (Needs an AI helper — free Gemini or Groq works.)
              </p>
              {autonomy !== 'careful' && (
                <label className="field">
                  <span>Your {provider === 'gmail' ? 'Google' : provider === 'yahoo' ? 'Yahoo' : 'Apple'} password (optional — lets it sign in for you; saved encrypted on this computer, never shown to the AI)</span>
                  <input type="password" value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} placeholder="Leave blank to sign in yourself" />
                </label>
              )}
              {assistantNote && <div className="hint" style={{ marginBottom: 8 }}>{assistantNote}</div>}
              <button className="primary" onClick={() => void letAssistant()} disabled={!email || busy}>
                Let the assistant do it
              </button>
              <p className="hint" style={{ margin: '10px 0 0' }}>Or paste an app password yourself below.</p>
            </div>
          )}
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
            <>
              <label className="field">
                <span>IMAP server</span>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" />
              </label>
              <label className="field">
                <span>Port</span>
                <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
              </label>
            </>
          )}
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={() => void add()} disabled={busy || !email || !password}>
              {busy ? 'Testing connection…' : 'Connect'}
            </button>
            <button className="ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  )
}
