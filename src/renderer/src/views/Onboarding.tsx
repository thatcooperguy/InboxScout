import { useEffect, useRef, useState } from 'react'
import ProfilePicker from './ProfilePicker'
import { useLevel } from '../useLevel'

interface Props {
  onDone: () => void
}

type TextSize = 'normal' | 'large' | 'xlarge'

const ZOOM: Record<TextSize, string> = { normal: '1', large: '1.2', xlarge: '1.4' }
const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
  { id: 'xlarge', label: 'Extra large' }
]

const APP_PASSWORD_PROVIDERS = new Set(['gmail', 'yahoo', 'icloud'])

function providerName(provider: string): string {
  switch (provider) {
    case 'gmail':
      return 'Google'
    case 'yahoo':
      return 'Yahoo'
    case 'icloud':
      return 'Apple'
    case 'outlook':
      return 'Microsoft'
    default:
      return 'your email service'
  }
}

function cleanError(err: any): string {
  return String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, '')
}

/**
 * First-run wizard: three plain-language steps a non-technical person can
 * finish alone. Step 0 lets them make the text bigger before anything else,
 * step 1 hides the big profile picker behind "Choose myself", step 2 leads
 * with one-click sign-in and only shows the app-password form last.
 */
export default function Onboarding({ onDone }: Props): JSX.Element {
  const level = useLevel()
  const simple = level === 'simple'

  const [step, setStep] = useState(0)
  const [textSize, setTextSize] = useState<TextSize>('normal')
  const [profileId, setProfileId] = useState('general')
  const [profileAuto, setProfileAuto] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [presets, setPresets] = useState<Record<string, any>>({})
  const [setupInfo, setSetupInfo] = useState<{ google: { configured: boolean }; microsoft: { configured: boolean } } | null>(null)
  const [aiReady, setAiReady] = useState(false)
  const [provider, setProvider] = useState('gmail')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [host, setHost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState('')
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string } | null>(null)
  const [helperBusy, setHelperBusy] = useState(false)
  const [helperNote, setHelperNote] = useState('')
  const helperEmail = useRef('')

  useEffect(() => {
    void window.inboxScout.accountPresets().then(setPresets)
    void window.inboxScout.setupInfo().then(setSetupInfo).catch(() => setSetupInfo(null))
    void window.inboxScout.agentRecipes().then((r) => setAiReady(r.aiReady)).catch(() => setAiReady(false))
    void window.inboxScout.getSettings().then((s) => {
      const size = (s?.textSize ?? 'normal') as TextSize
      if (size in ZOOM) setTextSize(size)
    })
  }, [])

  useEffect(() => window.inboxScout.onOutlookDeviceCode((info) => setDeviceCode(info)), [])

  // The helper (assistant) creates the app password and connects the account in the main process;
  // we only need to notice when it has finished and check that the account is really there.
  useEffect(
    () =>
      window.inboxScout.onAgentEvent((e: any) => {
        if (!helperEmail.current) return
        if (e.message) setHelperNote(String(e.message))
        if (e.status === 'done' || e.type === 'done') {
          const wanted = helperEmail.current.toLowerCase()
          void window.inboxScout.listAccounts().then((accounts) => {
            const found = accounts.some((a) => String(a.email ?? '').toLowerCase() === wanted)
            setHelperBusy(false)
            if (found) {
              setConnectedEmail(helperEmail.current)
              setConnected(true)
              setStep(3)
            } else {
              setHelperNote('The helper finished, but the account was not connected. You can paste an app password below instead.')
            }
            helperEmail.current = ''
          })
        }
        if (e.status === 'failed' || e.status === 'stopped') {
          setHelperBusy(false)
          helperEmail.current = ''
          setHelperNote(e.message ? String(e.message) : 'The helper stopped before it finished. You can paste an app password below instead.')
        }
      }),
    []
  )

  const preset = presets[provider] ?? { host: '', port: 993, sentFolder: 'Sent', help: '' }
  const helpUrl: string = typeof preset.help === 'string' ? (preset.help.match(/https?:\/\/\S+/)?.[0] ?? '') : ''
  const googleReady = !!setupInfo?.google.configured
  const microsoftReady = !!setupInfo?.microsoft.configured

  const chooseTextSize = async (size: TextSize): Promise<void> => {
    setTextSize(size)
    ;(document.body.style as any).zoom = ZOOM[size]
    try {
      const s = await window.inboxScout.getSettings()
      await window.inboxScout.setSettings({ ...s, textSize: size })
    } catch {
      // The zoom is already applied; saving can be retried from Preferences.
    }
  }

  const saveProfile = async (): Promise<void> => {
    await window.inboxScout.chooseProfile(profileAuto ? 'auto' : profileId)
    setStep(2)
  }

  const succeed = (address: string): void => {
    setConnectedEmail(address)
    setConnected(true)
    setStep(3)
  }

  const signInGoogle = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const account = await window.inboxScout.googleSignIn()
      succeed(String(account?.email ?? email))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const signInMicrosoft = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setDeviceCode(null)
    try {
      const account = await window.inboxScout.outlookSignIn()
      succeed(String(account?.email ?? email))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
      setDeviceCode(null)
    }
  }

  const letHelper = async (): Promise<void> => {
    setError('')
    const recipeId = provider === 'gmail' ? 'gmail-app-password' : provider === 'yahoo' ? 'yahoo-app-password' : 'icloud-app-password'
    helperEmail.current = email.trim()
    setHelperBusy(true)
    setHelperNote(`Opening ${providerName(provider)}'s page in its own window. Sign in when it asks — it never sees your password.`)
    try {
      const r = await window.inboxScout.agentStart({ recipeId, params: { email: email.trim() } })
      if (!r.ok) {
        setHelperBusy(false)
        helperEmail.current = ''
        setHelperNote(r.summary ?? 'Could not start the helper. You can paste an app password below instead.')
      }
    } catch (err) {
      setHelperBusy(false)
      helperEmail.current = ''
      setHelperNote(cleanError(err))
    }
  }

  const connectAccount = async (): Promise<void> => {
    if (busy || !email || !password) return
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
      succeed(email)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const finish = (runNow: boolean): void => {
    if (runNow) void window.inboxScout.runNow()
    onDone()
  }

  const selectedStyle = { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' }
  const usesAppPassword = APP_PASSWORD_PROVIDERS.has(provider)
  const showSignInButtons = googleReady || microsoftReady

  return (
    <div style={{ maxWidth: 560, margin: '48px auto' }}>
      {step === 0 && (
        <div className="card">
          <h1>👋 Welcome to InboxScout</h1>
          {simple ? (
            <>
              <p>I read your email and tell you what needs you. I never send or delete anything.</p>
              <p>Setup takes about two minutes. Everything stays on this computer, for free.</p>
            </>
          ) : (
            <>
              <p>
                InboxScout reads your email (it can never send or delete anything), sorts personal from work, and gives
                you a short daily brief of what actually needs your attention.
              </p>
              <p>Setup takes about two minutes, and everything runs free on this computer.</p>
            </>
          )}

          <fieldset style={{ border: '1px solid var(--line, #dde2ea)', borderRadius: 8, padding: '10px 12px', margin: '12px 0 16px' }}>
            <legend style={{ fontWeight: 600, padding: '0 4px' }}>Text size</legend>
            <p className="hint" style={{ margin: '0 0 8px' }}>
              {simple ? 'Pick the size that is easiest to read. You can change it later.' : 'Pick what is easiest to read — it applies right away and you can change it later in Preferences.'}
            </p>
            <div role="group" aria-label="Text size" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TEXT_SIZES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={textSize === t.id ? 'primary' : 'ghost'}
                  aria-pressed={textSize === t.id}
                  onClick={() => void chooseTextSize(t.id)}
                >
                  {t.label}
                  {textSize === t.id ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </fieldset>

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
            {simple
              ? 'This helps me know what matters to you. Most people let me work it out.'
              : 'This tunes what your brief pays attention to. Most people let InboxScout work it out from the mail itself; you can change it any time in Preferences.'}
          </p>
          <button
            type="button"
            className="hub-btn"
            aria-pressed={profileAuto}
            style={{ width: '100%', textAlign: 'left', marginBottom: 10, ...(profileAuto ? selectedStyle : {}) }}
            onClick={() => {
              setProfileAuto(true)
              setShowPicker(false)
            }}
          >
            <span className="icon">✨</span>
            <strong>Let InboxScout figure it out{profileAuto ? ' ✓' : ''} (recommended)</strong>
            <span className="sub">
              {simple
                ? 'I look at what your email is about and pick the best fit.'
                : 'It looks at what your mail is about and picks the best fit after each check. You can lock a choice any time.'}
            </span>
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <button className="primary" onClick={() => void saveProfile()}>
              Next
            </button>
            <button className="ghost" aria-expanded={showPicker} onClick={() => setShowPicker((v) => !v)}>
              Choose myself {showPicker ? '▾' : '▸'}
            </button>
          </div>
          {showPicker && (
            <ProfilePicker
              value={profileId}
              auto={profileAuto}
              showAuto={false}
              onChoose={(id) => {
                if (id === 'auto') setProfileAuto(true)
                else {
                  setProfileAuto(false)
                  setProfileId(id)
                }
              }}
            />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h1>Step 2 of 3 — Connect your email</h1>

          {showSignInButtons && (
            <div style={{ marginBottom: 16 }}>
              <p className="hint" style={{ marginTop: 0 }}>
                {simple ? 'The easiest way: sign in with the button for your email.' : 'Easiest: sign in on your email service’s own page. No passwords to copy.'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {googleReady && (
                  <button className="primary" onClick={() => void signInGoogle()} disabled={busy || helperBusy}>
                    {busy ? 'Waiting for Google…' : 'Sign in with Google'}
                  </button>
                )}
                {microsoftReady && (
                  <button className="primary" onClick={() => void signInMicrosoft()} disabled={busy || helperBusy}>
                    {busy ? 'Waiting for Microsoft…' : 'Sign in with Microsoft'}
                  </button>
                )}
              </div>
              {deviceCode && (
                <div className="success" role="status" aria-live="polite" style={{ fontSize: 16 }}>
                  Your code: <strong style={{ fontSize: 22, letterSpacing: 2 }}>{deviceCode.userCode}</strong>
                  <div style={{ marginTop: 8 }}>
                    <button className="primary" onClick={() => void window.inboxScout.openExternal(deviceCode.verificationUri)}>
                      Open the sign-in page
                    </button>
                  </div>
                  <p className="hint">Type the code on the Microsoft page that opens. Waiting for you to finish…</p>
                </div>
              )}
              <p className="hint" style={{ margin: '12px 0 0' }}>
                {simple ? 'Not your email? Choose it below.' : 'Or connect another way:'}
              </p>
            </div>
          )}

          <label className="field">
            <span>Where is your email?</span>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setError('')
                setHelperNote('')
              }}
            >
              <option value="gmail">Gmail</option>
              <option value="yahoo">Yahoo Mail</option>
              <option value="icloud">iCloud Mail</option>
              <option value="outlook">Outlook / Hotmail / Live</option>
              <option value="imap">Another email service</option>
            </select>
          </label>

          {provider === 'outlook' ? (
            <div>
              {microsoftReady ? (
                <>
                  <p className="hint">
                    {simple
                      ? 'Press the button. Then type the short code on the Microsoft page.'
                      : 'Microsoft accounts sign in with a short code — no passwords to copy. Press the button, then type the code on the Microsoft page that opens.'}
                  </p>
                  {deviceCode && (
                    <div className="success" role="status" aria-live="polite" style={{ fontSize: 16 }}>
                      Your code: <strong style={{ fontSize: 22, letterSpacing: 2 }}>{deviceCode.userCode}</strong>
                      <div style={{ marginTop: 8 }}>
                        <button className="primary" onClick={() => void window.inboxScout.openExternal(deviceCode.verificationUri)}>
                          Open the sign-in page
                        </button>
                      </div>
                      <p className="hint">Waiting for you to finish signing in…</p>
                    </div>
                  )}
                  {error && (
                    <div className="error" role="alert">
                      {error}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="primary" onClick={() => void signInMicrosoft()} disabled={busy}>
                      {busy ? 'Waiting for Microsoft…' : 'Sign in with Microsoft'}
                    </button>
                    <button className="ghost" onClick={() => setStep(3)}>
                      Skip for now
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">
                    {simple
                      ? 'Microsoft sign-in is not ready on this computer yet. You can add your Outlook email later in Setup → Email accounts.'
                      : 'Microsoft sign-in is not set up on this computer yet. Whoever installed InboxScout can enable it in Setup → Sign-in setup; after that, add your Outlook account from Setup → Email accounts.'}
                  </p>
                  <button className="ghost" onClick={() => setStep(3)}>
                    Skip for now
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void connectAccount()
                  }}
                />
              </label>

              {usesAppPassword && (
                <div className="card" style={{ background: 'var(--good-soft)', borderColor: 'var(--good)' }}>
                  <strong>🤖 Let InboxScout get the app password for me</strong>
                  {aiReady ? (
                    <p className="hint" style={{ margin: '4px 0 10px' }}>
                      {simple
                        ? `It opens ${providerName(provider)}'s page in its own window. You sign in. It does the rest.`
                        : `It opens ${providerName(provider)}'s page in its own window; you sign in, and it creates the app password and connects the account for you.`}
                    </p>
                  ) : (
                    <p className="hint" style={{ margin: '4px 0 10px' }}>
                      {simple
                        ? 'This needs a free AI helper, which is not set up yet. You can set it up later in Setup → AI helper. For now, paste an app password below.'
                        : 'This needs a free AI helper (Gemini or Groq work), which is not connected yet. You can set it up later in Setup → AI helper. For now, paste an app password below.'}
                    </p>
                  )}
                  {helperNote && (
                    <div className="hint" role="status" aria-live="polite" style={{ marginBottom: 8 }}>
                      {helperNote}
                    </div>
                  )}
                  <button className="primary" onClick={() => void letHelper()} disabled={!aiReady || !email.trim() || busy || helperBusy}>
                    {helperBusy ? 'Helper is working…' : 'Let InboxScout get it'}
                  </button>
                  {aiReady && !email.trim() && (
                    <p className="hint" style={{ margin: '8px 0 0' }}>
                      Type your email address first.
                    </p>
                  )}
                </div>
              )}

              <label className="field">
                <span>App password</span>
                <span className="hint" style={{ fontWeight: 400, marginBottom: 6 }}>
                  {simple
                    ? 'A special password your email service makes just for apps. It is not your normal password.'
                    : 'A special 16-character password your email service makes for apps — not your normal password. It is stored encrypted on this computer.'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(provider === 'imap' ? e.target.value : e.target.value.replace(/\s+/g, ''))}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text')
                      if (text && /\s/.test(text)) {
                        e.preventDefault()
                        setPassword(provider === 'imap' ? text.trim() : text.replace(/\s+/g, ''))
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void connectAccount()
                    }}
                    placeholder={provider === 'imap' ? 'Your mail password' : '16-character app password'}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="ghost" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)} style={{ whiteSpace: 'nowrap' }}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              {helpUrl && (
                <button type="button" className="ghost" style={{ marginBottom: 12 }} onClick={() => void window.inboxScout.openExternal(helpUrl)}>
                  How do I get an app password?
                </button>
              )}
              {usesAppPassword && !simple && (
                <p className="hint" style={{ marginTop: 0 }}>
                  {providerName(provider)} only lets you make an app password after 2-Step Verification is turned on. The page above walks you through it.
                </p>
              )}

              {provider === 'imap' && (
                <label className="field">
                  <span>Incoming mail server (ask your email provider)</span>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="imap.example.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void connectAccount()
                    }}
                  />
                </label>
              )}

              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" disabled={busy || helperBusy || !email || !password || (provider === 'imap' && !host)} onClick={() => void connectAccount()}>
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
                <button className="ghost" onClick={() => setStep(3)}>
                  Skip for now
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h1>Step 3 of 3 — All set</h1>
          {connected ? (
            <p className="success" role="status">
              Connected: {connectedEmail || email} ✓
            </p>
          ) : (
            <p className="hint">
              {simple
                ? 'You have not connected an email yet. You can do it any time from Setup → Email accounts.'
                : "You haven't connected an email yet — you can do it any time from Setup → Email accounts."}
            </p>
          )}
          <p>
            {simple
              ? 'Every morning I check your email and write you a short summary of what needs you.'
              : 'Every morning at 7:30, InboxScout checks your email and writes you a short brief of what needs you.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {connected ? (
              <button className="primary" onClick={() => finish(true)}>
                Check my email now
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
