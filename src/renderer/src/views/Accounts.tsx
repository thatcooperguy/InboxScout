import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'

type SetupInfo = { google: { configured: boolean }; microsoft: { configured: boolean } }

/** Where each service hands out app passwords. Used when the preset's help text has no address in it. */
const APP_PASSWORD_PAGES: Record<string, string> = {
  gmail: 'https://myaccount.google.com/apppasswords',
  yahoo: 'https://login.yahoo.com/myaccount/security/app-password',
  icloud: 'https://account.apple.com/account/manage'
}

/** Pull a web address out of the preset help sentence ("… at myaccount.google.com/apppasswords."). */
function helpUrl(provider: string, help: string): string {
  const m = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[\w/-]*)?/i.exec(help ?? '')
  if (m) return `https://${m[1]}${m[2] ?? ''}`
  return APP_PASSWORD_PAGES[provider] ?? ''
}

const SERVICE_NAMES: Record<string, string> = {
  gmail: 'Gmail',
  gmailapi: 'Gmail (signed in with Google)',
  yahoo: 'Yahoo Mail',
  icloud: 'iCloud Mail',
  outlook: 'Outlook (signed in with Microsoft)',
  outlookapi: 'Outlook (signed in with Microsoft)',
  imap: 'Another email service'
}

function serviceName(a: { provider?: string; host?: string }): string {
  const name = SERVICE_NAMES[a.provider ?? '']
  if (name && a.provider !== 'imap') return name
  return a.host ? `Email at ${a.host}` : (name ?? 'Email')
}

function friendlyError(err: unknown): string {
  return String((err as any)?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, '')
}

export default function Accounts(): JSX.Element {
  const level = useLevel()
  const [accounts, setAccounts] = useState<any[]>([])
  const [presets, setPresets] = useState<Record<string, any>>({})
  const [setup, setSetup] = useState<SetupInfo | null>(null)
  const [adding, setAdding] = useState(false)
  const [provider, setProvider] = useState('gmail')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [host, setHost] = useState('')
  const [port, setPort] = useState(993)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string } | null>(null)
  const [assistantNote, setAssistantNote] = useState('')
  const [signinOpen, setSigninOpen] = useState(false)
  const [signinPassword, setSigninPassword] = useState('')
  const [showSigninPassword, setShowSigninPassword] = useState(false)
  const [autonomy, setAutonomy] = useState<'careful' | 'signin' | 'full'>('signin')
  const [aiReady, setAiReady] = useState(true)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const load = (): void => {
    void window.inboxScout.listAccounts().then(setAccounts)
  }

  useEffect(() => {
    load()
    void window.inboxScout.accountPresets().then(setPresets)
    void window.inboxScout.setupInfo().then((i) => setSetup(i))
    void window.inboxScout.agentRecipes().then((r) => {
      setAutonomy(r.autonomy)
      setAiReady(r.aiReady)
    })
    return window.inboxScout.onAgentEvent((e: any) => {
      if (e.message) setAssistantNote(e.message)
      if (e.status === 'done') load()
    })
  }, [])

  useEffect(() => window.inboxScout.onOutlookDeviceCode((info: any) => setDeviceCode(info)), [])

  const googleReady = setup?.google.configured === true
  const microsoftReady = setup?.microsoft.configured === true
  const serviceOwner = provider === 'gmail' ? 'Google' : provider === 'yahoo' ? 'Yahoo' : provider === 'icloud' ? 'Apple' : ''
  const preset = presets[provider] ?? { host: '', port: 993, sentFolder: 'Sent', help: '' }
  const appPasswordUrl = helpUrl(provider, preset.help)

  const letAssistant = async (): Promise<void> => {
    setError('')
    const willSignIn = autonomy !== 'careful' && signinPassword.trim()
    if (willSignIn) {
      try {
        await window.inboxScout.signinsSave(email, signinPassword)
      } catch (err) {
        setError(friendlyError(err))
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

  const signInGoogle = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const account = await window.inboxScout.googleSignIn()
      setOk(`Connected ${account.email} ✓ (better sorting from Gmail's own labels). Now press "Check my email" on Today.`)
      setAdding(false)
      load()
    } catch (err) {
      setError(friendlyError(err))
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
      setOk(`Connected ${account.email} ✓. Now press "Check my email" on Today.`)
      setAdding(false)
      load()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
      setDeviceCode(null)
    }
  }

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
      setOk(`Connected ${email} ✓. Now press "Check my email" on Today.`)
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setAdding(false)
      load()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    await window.inboxScout.removeAccount(id)
    setConfirmRemove(null)
    setOk('Removed. Nothing was changed in your mailbox.')
    load()
  }

  const cancelAdd = (): void => {
    setAdding(false)
    setError('')
    setAssistantNote('')
    setSigninPassword('')
    setSigninOpen(false)
  }

  const btn: React.CSSProperties = { minHeight: 40 }
  const canAdd = !busy && !!email && !!password && (provider !== 'imap' || !!host.trim())

  return (
    <div>
      <h1>Email accounts</h1>
      <p className="sub">Read-only access — InboxScout can never send, delete, or change your mail.</p>
      {ok && (
        <div className="success" role="status">
          {ok}
        </div>
      )}
      <div className="card">
        <h3>Connected accounts</h3>
        {accounts.length === 0 && <div className="empty">No accounts yet.</div>}
        <table>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.email}</strong>
                  <div className="hint">{serviceName(a)}</div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {confirmRemove === a.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span className="hint">Remove {a.email}? InboxScout will forget its password and stop reading this inbox. Your emails are not affected.</span>
                      <button className="primary" style={btn} onClick={() => void remove(a.id)}>
                        Remove
                      </button>
                      <button className="ghost" style={btn} onClick={() => setConfirmRemove(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button className="ghost" style={btn} onClick={() => setConfirmRemove(a.id)}>
                      Remove…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!adding && (
        <button className="primary" style={btn} onClick={() => setAdding(true)}>
          + Connect an account
        </button>
      )}
      {adding && (
        <div className="card">
          <h3>Connect an account</h3>
          <label className="field">
            <span>Where is your email?</span>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setError('')
                setAssistantNote('')
              }}
            >
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook, Hotmail, or Live (Microsoft)</option>
              <option value="yahoo">Yahoo Mail</option>
              <option value="icloud">iCloud Mail</option>
              <option value="imap">Another email service</option>
            </select>
          </label>

          {provider === 'gmail' &&
            (googleReady ? (
              <div className="card" style={{ background: 'var(--blue-soft)', borderColor: 'var(--blue)' }}>
                <strong>Easiest: Sign in with Google</strong>
                <p className="hint" style={{ margin: '4px 0 10px' }}>
                  Sign in on Google's page — no app password, and better sorting.
                </p>
                <button className="primary" style={btn} onClick={() => void signInGoogle()} disabled={busy}>
                  {busy ? 'Waiting for Google…' : 'Sign in with Google'}
                </button>
              </div>
            ) : (
              setup && <p className="hint">Sign in with Google isn't set up in this copy — use an app password, or ask whoever set up InboxScout.</p>
            ))}

          {provider === 'outlook' ? (
            <div>
              {microsoftReady ? (
                <>
                  <p className="hint">
                    Microsoft accounts sign in with a short code — no passwords to copy. Press the button, then type the code
                    on the Microsoft page that opens.
                  </p>
                  {deviceCode && (
                    <div className="success" role="status" style={{ fontSize: 16 }}>
                      Your code: <strong style={{ fontSize: 22, letterSpacing: 2 }}>{deviceCode.userCode}</strong>
                      <div style={{ marginTop: 8 }}>
                        <button className="primary" style={btn} onClick={() => void window.inboxScout.openExternal(deviceCode.verificationUri)}>
                          Open the Microsoft sign-in page
                        </button>
                      </div>
                      <p className="hint">Waiting for you to finish signing in…</p>
                    </div>
                  )}
                </>
              ) : (
                setup && (
                  <p className="hint">
                    Sign in with Microsoft isn't set up in this copy — ask whoever set up InboxScout. (Outlook and Hotmail don't offer app
                    passwords, so this is the only way to connect them.)
                  </p>
                )
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {microsoftReady && (
                  <button className="primary" style={btn} onClick={() => void signInOutlook()} disabled={busy}>
                    {busy ? 'Waiting for Microsoft…' : 'Sign in with Microsoft'}
                  </button>
                )}
                <button className="ghost" style={btn} onClick={cancelAdd}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="field">
                <span>Email address</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="off" />
              </label>

              {serviceOwner && (
                <div className="card" style={{ background: 'var(--good-soft)', borderColor: 'var(--good)' }}>
                  <strong>🤖 Don't want to hunt for an app password? Let the assistant do it.</strong>
                  <p className="hint" style={{ margin: '4px 0 10px' }}>
                    It opens {serviceOwner}'s page in its own window — you sign in yourself there — and it creates the app password and
                    connects the account for you.
                  </p>
                  {!aiReady && (
                    <p className="hint" style={{ margin: '0 0 10px', color: 'var(--ink)' }}>
                      Not available yet: the assistant needs an AI helper to think. First connect a free one in{' '}
                      <strong>Setup → Smarter sorting</strong>, or use an app password below.
                    </p>
                  )}
                  {aiReady && autonomy !== 'careful' && (
                    <div style={{ marginBottom: 10 }}>
                      <button
                        className="ghost"
                        style={{ ...btn, textAlign: 'left' }}
                        aria-expanded={signinOpen}
                        aria-controls="account-assistant-signin"
                        onClick={() => setSigninOpen((v) => !v)}
                      >
                        Let it sign in for me {signinOpen ? '▾' : '▸'}
                      </button>
                      {signinOpen && (
                        <div id="account-assistant-signin" style={{ marginTop: 8 }}>
                          <p className="hint" style={{ marginTop: 0 }}>
                            Optional. If you give it your {serviceOwner} password, the assistant can sign in for you and only ask if a code is
                            needed. The password is stored encrypted on this computer and the AI never sees it — InboxScout types it in for you.
                            Leave it blank to sign in yourself in its window.
                          </p>
                          <label className="field" style={{ marginBottom: 6 }}>
                            <span>Your {serviceOwner} password (optional)</span>
                            <span style={{ display: 'flex', gap: 8, fontWeight: 400 }}>
                              <input
                                type={showSigninPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={signinPassword}
                                onChange={(e) => setSigninPassword(e.target.value)}
                                placeholder="Leave blank to sign in yourself"
                              />
                              <button className="ghost" style={btn} type="button" aria-pressed={showSigninPassword} onClick={() => setShowSigninPassword((v) => !v)}>
                                {showSigninPassword ? 'Hide' : 'Show'}
                              </button>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                  {assistantNote && (
                    <div className="hint" role="status" aria-live="polite" style={{ marginBottom: 8 }}>
                      {assistantNote}
                    </div>
                  )}
                  <button className="primary" style={btn} onClick={() => void letAssistant()} disabled={!email || busy || !aiReady}>
                    Let the assistant do it
                  </button>
                  <p className="hint" style={{ margin: '10px 0 0' }}>Or paste an app password yourself below.</p>
                </div>
              )}

              <p className="hint" style={{ margin: '0 0 6px' }}>
                An <strong>app password</strong> is a separate password your email service makes just for apps like InboxScout. Your normal
                password keeps working and is never typed in here.
                {provider === 'imap' && ' Most email services need one.'}
              </p>
              {appPasswordUrl && (
                <p style={{ margin: '0 0 12px' }}>
                  <button className="ghost" style={btn} onClick={() => void window.inboxScout.openExternal(appPasswordUrl)}>
                    How do I get an app password? — opens {serviceOwner ? `${serviceOwner}'s page` : 'the page'} in your browser
                  </button>
                </p>
              )}
              {level === 'pro' && preset.help && <p className="hint">{preset.help}</p>}

              <label className="field">
                <span>App password</span>
                <span style={{ display: 'flex', gap: 8, fontWeight: 400 }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canAdd && void add()}
                    placeholder="16-character app password"
                  />
                  <button className="ghost" style={btn} type="button" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
              {provider === 'imap' && (
                <>
                  <label className="field">
                    <span>Incoming mail server</span>
                    <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.example.com" />
                  </label>
                  <label className="field">
                    <span>Port (usually 993)</span>
                    <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
                  </label>
                </>
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="primary" style={btn} onClick={() => void add()} disabled={!canAdd}>
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
                <button className="ghost" style={btn} onClick={cancelAdd}>
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
