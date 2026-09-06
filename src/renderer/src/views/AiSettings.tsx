import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'

const RECOMMENDED = 'gemini'

/**
 * "Smarter sorting (AI)": one recommended path up front, anything found on this
 * computer, and every other provider behind a disclosure. The built-in engine
 * already works, so nothing here is required.
 */
export default function AiSettings(): JSX.Element {
  const level = useLevel()
  const simple = level === 'simple'
  const [providers, setProviders] = useState<any[]>([])
  const [detections, setDetections] = useState<any[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showOthers, setShowOthers] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const load = (): void => {
    void window.inboxScout.aiProviders().then(setProviders)
    void window.inboxScout.aiDetect().then(setDetections)
  }
  useEffect(load, [])

  const active = providers.find((p) => p.active)
  const usingBuiltin = !active || active.id === 'builtin'
  const recommended = providers.find((p) => p.id === RECOMMENDED)
  const others = providers.filter((p) => p.id !== RECOMMENDED)
  const needsKey = (p: any): boolean => !p.local && p.id !== 'custom'

  const connectDetected = async (d: any): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const res = await window.inboxScout.aiConnectDetected(d.provider)
      if (res.ok) setOk(`Connected ✓ — ${d.detail.replace(/^Found /, '').replace(/ on this computer$/, '')} is now sorting your email.`)
      else setError(res.error ?? 'Could not connect. Check it is still running, then try again.')
      load()
    } finally {
      setBusy(false)
    }
  }

  /** Open the inline key form. `openBrowser` also opens the provider's key page in the default browser. */
  const startConnect = (p: any, openBrowser: boolean): void => {
    setConnecting(p.id)
    setConfirmRemove(null)
    setApiKey('')
    setBaseUrl('')
    setError('')
    setOk('')
    if (openBrowser && needsKey(p) && p.keyUrl) void window.inboxScout.aiOpenKeyPage(p.id)
  }

  const connect = async (p: any, key = apiKey, url = baseUrl): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const res = await window.inboxScout.aiConnect({ provider: p.id, apiKey: key, baseUrl: url })
      if (res.ok) {
        setOk(p.id === 'builtin' ? 'Back to the built-in engine ✓ — no account needed.' : `Connected ✓ — ${p.name} is now sorting your email.`)
        setConnecting(null)
      } else {
        setError(
          needsKey(p)
            ? `That key didn't work. Check it was copied completely, then try again.${level === 'pro' && res.error ? ` (${res.error})` : ''}`
            : (res.error ?? 'Could not connect. Check the address, then try again.')
        )
      }
      load()
    } finally {
      setBusy(false)
    }
  }

  const removeKey = async (p: any): Promise<void> => {
    setBusy(true)
    setConfirmRemove(null)
    setError('')
    try {
      await window.inboxScout.aiDisconnect(p.id)
      if (p.active) await window.inboxScout.aiConnect({ provider: 'builtin', apiKey: '', baseUrl: '' })
      setOk(p.active ? `Removed the ${p.name} key. Back to the built-in engine.` : `Removed the ${p.name} key.`)
      load()
    } finally {
      setBusy(false)
    }
  }

  const useLabel = 'Use'
  const getKeyLabel = (p: any): string => (p.free ? 'Get a free key — opens your browser' : 'Get a key — opens your browser')

  const keyForm = (p: any): JSX.Element => (
    <div>
      {needsKey(p) && (
        <>
          <p className="hint">
            {connecting === p.id && 'Sign in on the page that opened in your browser, make a key, and paste it here.'}{' '}
            {!simple && "A key is a long code the website gives you — it's like a password just for InboxScout."}
          </p>
          <label className="field">
            <span>Paste the key here</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste the key" autoFocus />
          </label>
          {p.keyUrl && (
            <button className="ghost" style={{ marginBottom: 8 }} onClick={() => void window.inboxScout.aiOpenKeyPage(p.id)}>
              Open the key page again
            </button>
          )}
        </>
      )}
      {p.id === 'custom' && (
        <>
          <label className="field">
            <span>Server address</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-server/v1" />
          </label>
          <label className="field">
            <span>Key (only if your server needs one)</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Optional" />
          </label>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button
          className="primary"
          disabled={busy || (needsKey(p) && !apiKey.trim()) || (p.id === 'custom' && !baseUrl.trim())}
          onClick={() => void connect(p, apiKey.trim(), baseUrl.trim())}
        >
          {busy ? 'Testing connection…' : p.id === 'custom' ? 'Use this server' : 'Use this key'}
        </button>
        <button className="ghost" disabled={busy} onClick={() => setConnecting(null)}>
          Cancel
        </button>
      </div>
    </div>
  )

  const card = (p: any, recommendedCard = false): JSX.Element => {
    const keyed = p.connected && needsKey(p)
    const customReady = p.id === 'custom' && p.connected
    return (
      <div key={p.id} className={`provider-card ${p.active ? 'active' : ''}`}>
        <h4>
          {p.name}
          {recommendedCard && (
            <span className="badge" style={{ marginLeft: 8 }}>
              Recommended · free
            </span>
          )}
        </h4>
        <p>{recommendedCard ? 'Free to use, no credit card. Takes about a minute: get a key from Google, paste it here.' : p.note}</p>
        {level === 'pro' && <p className="hint">Uses: {p.defaultModel}</p>}
        {connecting === p.id ? (
          keyForm(p)
        ) : (
          <>
            {(p.active || keyed || customReady) && (
              <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--good)' }}>
                {p.active ? 'Connected ✓ · in use' : 'Connected ✓'}
              </p>
            )}
            {confirmRemove === p.id ? (
              <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>
                  Remove the {p.name} key?{p.active ? ' InboxScout goes back to the built-in engine.' : ''}
                </span>
                <button className="primary" style={{ minHeight: 40 }} disabled={busy} onClick={() => void removeKey(p)}>
                  Remove
                </button>
                <button className="ghost" style={{ minHeight: 40 }} onClick={() => setConfirmRemove(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {p.local && !p.active && (
                  <button className="primary" disabled={busy} onClick={() => void connect(p, '', '')}>
                    {busy ? 'Testing connection…' : useLabel}
                  </button>
                )}
                {p.id === 'custom' && (
                  <button className="primary" disabled={busy} onClick={() => startConnect(p, false)}>
                    {customReady ? 'Change server' : 'Set up'}
                  </button>
                )}
                {needsKey(p) && !keyed && (
                  <>
                    <button className="primary" disabled={busy} onClick={() => startConnect(p, true)}>
                      {getKeyLabel(p)}
                    </button>
                    {!simple && (
                      <button className="ghost" disabled={busy} onClick={() => startConnect(p, false)}>
                        I already have a key
                      </button>
                    )}
                  </>
                )}
                {keyed && (
                  <>
                    {!p.active && (
                      <button className="primary" disabled={busy} onClick={() => void connect(p, '', '')}>
                        {busy ? 'Testing connection…' : useLabel}
                      </button>
                    )}
                    <button className="ghost" style={{ minHeight: 40 }} disabled={busy} onClick={() => startConnect(p, false)}>
                      Change key
                    </button>
                    <button className="ghost" style={{ minHeight: 40 }} disabled={busy} onClick={() => setConfirmRemove(p.id)}>
                      Remove key
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <h1>{simple ? 'Smarter sorting' : 'Smarter sorting (AI)'}</h1>
      <p className="sub">
        {simple
          ? 'InboxScout sorts your email and writes your summary. This already works with no account. A free smart helper makes it better.'
          : 'InboxScout sorts your email and writes your brief. The built-in engine already does this with no account. Add a free AI and the sorting gets smarter and the brief reads better. Keys are encrypted on this computer and used only for your own email.'}
      </p>
      <p style={{ margin: '0 0 16px', fontWeight: 600 }} role="status" aria-live="polite">
        Right now: {usingBuiltin ? 'Built-in engine (no account)' : `${active.name} ✓`}
      </p>
      {ok && (
        <div className="success" role="status">
          {ok}
        </div>
      )}
      {error && !connecting && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {detections.length > 0 && (
        <div className="card">
          <h3>✨ Found on this computer</h3>
          <p className="hint">{simple ? 'A smart helper is already here. You can use it for free.' : 'Free and private — nothing leaves this computer.'}</p>
          {detections.map((d) => (
            <div key={d.provider} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span>{d.detail}</span>
              <button className="primary" disabled={busy} onClick={() => void connectDetected(d)}>
                {busy ? 'Testing connection…' : useLabel}
              </button>
            </div>
          ))}
        </div>
      )}

      {recommended && (
        <div className="provider-grid" style={{ marginBottom: 16 }}>
          {card(recommended, true)}
        </div>
      )}

      {providers.length > 0 && (
        <>
          <button className="ghost" style={{ minHeight: 40 }} aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}>
            {showOthers ? '▾ ' : '▸ '}
            {simple ? 'More choices' : 'Other providers'}
          </button>
          {showOthers && (
            <div className="provider-grid" style={{ marginTop: 12 }}>
              {others.map((p) => card(p))}
            </div>
          )}
        </>
      )}
      {providers.length === 0 && <p className="hint">Loading…</p>}
    </div>
  )
}
