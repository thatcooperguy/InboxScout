import { useEffect, useState } from 'react'

type Kind = 'google' | 'microsoft'

interface Props {
  /** Jump to Email accounts once the IDs are saved (so the page is not a dead end). */
  onConnectAccount?: () => void
}

/**
 * "Sign-in setup": the one-time "register an app" chore, done with a helper
 * watching over your shoulder: we open the right page, you click through, we
 * capture the IDs. Only needed by whoever installed InboxScout from source.
 */
export default function SetupAssistant({ onConnectAccount }: Props): JSX.Element {
  const [info, setInfo] = useState<any | null>(null)
  const [kind, setKind] = useState<Kind>('google')
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [captured, setCaptured] = useState<any>({})

  const load = (): void => {
    void window.inboxScout.setupInfo().then(setInfo)
  }
  useEffect(() => {
    load()
    return window.inboxScout.onSetupEvent((p) => {
      if (p.type === 'captured') {
        setCaptured(p.captured)
        load()
      }
      if (p.type === 'closed') setRunning(false)
      if (p.type === 'step') setStep(p.index)
    })
  }, [])

  if (!info) {
    return (
      <div>
        <h1>Sign-in setup</h1>
        <p className="hint">Checking what this copy already includes…</p>
      </div>
    )
  }
  const current = info[kind]
  const steps: any[] = current.steps

  const start = (): void => {
    setCaptured({})
    setRunning(true)
    setStep(0)
    void window.inboxScout.setupStart(kind, 0)
  }
  const go = (i: number): void => {
    setStep(i)
    void window.inboxScout.setupGoto(kind, i)
  }

  const done = kind === 'google' ? !!captured.googleClientId && !!captured.googleClientSecret : !!captured.microsoftClientId
  const providerName = kind === 'google' ? 'Google' : 'Microsoft'

  return (
    <div>
      <h1>Sign-in setup</h1>
      <p className="sub">
        Only whoever installed InboxScout from source needs this — official builds already have it built in. Google and
        Microsoft each need a free, one-time registration so their sign-in buttons work; you do it once per computer.
        If a provider shows <strong>Ready</strong> below, there is nothing to do.
      </p>

      <div className="hub-grid" style={{ marginBottom: 16 }}>
        {(['google', 'microsoft'] as Kind[]).map((k) => (
          <button
            key={k}
            className="hub-btn"
            aria-pressed={kind === k}
            style={kind === k ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}}
            onClick={() => setKind(k)}
          >
            <span className="icon" aria-hidden="true">
              {k === 'google' ? '🔵' : '🟦'}
            </span>
            <strong>
              {k === 'google' ? 'Google (Gmail sign-in)' : 'Microsoft (Outlook sign-in)'}
              {kind === k && <span className="badge muted" style={{ marginLeft: 8 }}>Selected</span>}
            </strong>
            <span className="sub">
              {info[k].configured ? (info[k].baked ? '✅ Ready (included in this build)' : '✅ Ready') : '⚪ Not set up yet'}
            </span>
          </button>
        ))}
      </div>

      <div className="card">
        <h3>{kind === 'google' ? 'Google Cloud — 4 steps, about 10 minutes' : 'Microsoft Entra — 3 steps, about 5 minutes'}</h3>
        <p className="hint">
          Press <strong>Start</strong>. A helper window opens on the exact page for each step. You click through the
          provider's own screens; InboxScout watches the page and saves the ID the moment it appears. Use the step
          buttons to jump around if the site moves you elsewhere.
        </p>
        <ol style={{ paddingLeft: 20 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 10, opacity: running && i !== step ? 0.7 : 1 }}>
              <strong>{s.title}</strong>
              {running && (
                <button className="ghost" style={{ marginLeft: 8 }} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
                  {i === step ? 'Open this step again' : 'Go to this step'}
                </button>
              )}
              <div className="hint">{s.detail}</div>
            </li>
          ))}
        </ol>
        <div role="status" aria-live="polite">
          {running && (
            <div className={done ? 'success' : 'hint'}>
              {kind === 'google' ? (
                <>
                  Client ID: {captured.googleClientId ? '✅ captured' : '… watching'} · Client secret:{' '}
                  {captured.googleClientSecret ? '✅ captured' : '… watching'}
                </>
              ) : (
                <>Application (client) ID: {captured.microsoftClientId ? '✅ captured' : '… watching'}</>
              )}
              {done && ' — saved. You can close the helper window.'}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {!running ? (
            <button className="primary" onClick={start}>
              {current.configured ? 'Redo setup (replaces the saved IDs)' : 'Start'}
            </button>
          ) : (
            <button className="ghost" style={{ minHeight: 40 }} onClick={() => void window.inboxScout.setupStop().then(() => setRunning(false))}>
              Close helper window
            </button>
          )}
          {(done || (current.configured && !running)) && onConnectAccount && (
            <button className="ghost" style={{ minHeight: 40 }} onClick={onConnectAccount}>
              {kind === 'google' ? 'Now connect your Gmail' : 'Now connect your Outlook'}
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Prefer to do it yourself? The {providerName} values also go in Setup → Preferences → Advanced. Step-by-step
          text: {kind === 'google' ? 'docs/GOOGLE.md' : 'docs/OUTLOOK.md'}.
        </p>
      </div>
    </div>
  )
}
