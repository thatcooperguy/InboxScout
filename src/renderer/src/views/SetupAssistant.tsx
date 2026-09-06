import { useEffect, useState } from 'react'

type Kind = 'google' | 'microsoft'

/**
 * The one-time "register an app" chore, done with a helper watching over
 * your shoulder: we open the right page, you click through, we capture the IDs.
 */
export default function SetupAssistant(): JSX.Element {
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

  if (!info) return <div />
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

  return (
    <div>
      <h1>Connect helper</h1>
      <p className="sub">
        Google and Microsoft each require a free, one-time "app registration" by whoever installs InboxScout. Official
        builds may already include it — if a provider shows <strong>Ready</strong> below, there is nothing to do.
      </p>

      <div className="hub-grid" style={{ marginBottom: 16 }}>
        {(['google', 'microsoft'] as Kind[]).map((k) => (
          <button key={k} className="hub-btn" style={kind === k ? { borderColor: 'var(--blue)' } : {}} onClick={() => setKind(k)}>
            <span className="icon">{k === 'google' ? '🔵' : '🟦'}</span>
            <strong>{k === 'google' ? 'Google (Gmail sign-in)' : 'Microsoft (Outlook sign-in)'}</strong>
            <span className="sub">
              {info[k].configured ? (info[k].baked ? '✅ Ready (included in this build)' : '✅ Ready') : '⚪ Not set up yet'}
            </span>
          </button>
        ))}
      </div>

      <div className="card">
        <h3>{kind === 'google' ? 'Google Cloud — 4 steps, about 10 minutes' : 'Microsoft Entra — 3 steps, about 5 minutes'}</h3>
        <p className="hint">
          Press <strong>Start</strong>. A companion window opens on the exact page for each step. You click through the
          provider's own screens; InboxScout watches the page and saves the ID the moment it appears. Use the step
          buttons to jump around if the site moves you elsewhere.
        </p>
        <ol style={{ paddingLeft: 20 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 10, opacity: running && i !== step ? 0.7 : 1 }}>
              <strong>{s.title}</strong>
              {running && (
                <button className="ghost tiny" style={{ marginLeft: 8 }} onClick={() => go(i)}>
                  {i === step ? 'Open again' : 'Go to this step'}
                </button>
              )}
              <div className="hint">{s.detail}</div>
            </li>
          ))}
        </ol>
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
            {done && ' — saved. You can close the companion window.'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {!running ? (
            <button className="primary" onClick={start}>
              {current.configured ? 'Redo setup' : 'Start'}
            </button>
          ) : (
            <button className="ghost" onClick={() => void window.inboxScout.setupStop().then(() => setRunning(false))}>
              Close helper window
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Prefer to do it yourself? The values also go in Setup → Preferences → Advanced. Step-by-step text:{' '}
          {kind === 'google' ? 'docs/GOOGLE.md' : 'docs/OUTLOOK.md'}.
        </p>
      </div>
    </div>
  )
}
