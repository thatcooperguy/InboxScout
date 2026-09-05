import { useEffect, useState } from 'react'

export default function AiSettings(): JSX.Element {
  const [providers, setProviders] = useState<any[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = (): void => {
    void window.inboxIntel.aiProviders().then(setProviders)
  }
  useEffect(load, [])

  const needsKey = (p: any): boolean => !p.local && p.id !== 'custom'

  const startConnect = (p: any): void => {
    setConnecting(p.id)
    setApiKey('')
    setBaseUrl('')
    setError('')
    setOk('')
    if (needsKey(p) && p.keyUrl) void window.inboxIntel.aiOpenKeyPage(p.id)
  }

  const connect = async (p: any): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const res = await window.inboxIntel.aiConnect({ provider: p.id, apiKey, baseUrl })
      if (res.ok) {
        setOk(`Connected ✓ — ${p.name} is now doing the thinking.`)
        setConnecting(null)
      } else {
        setError(res.error ?? 'That key did not work.')
      }
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Connect AI</h1>
      <p className="sub">
        Inbox Intel works out of the box with its free built-in engine — no account needed. Connect any AI backend for
        smarter sorting and briefs; keys are encrypted on this computer and used only for your own scans.
      </p>
      {ok && <div className="success">{ok}</div>}
      <div className="provider-grid">
        {providers.map((p) => (
          <div key={p.id} className={`provider-card ${p.active ? 'active' : ''}`}>
            <h4>
              {p.name} {p.active && '· active'}
            </h4>
            <p>{p.note}</p>
            <p className="hint">Model: {p.defaultModel}</p>
            {connecting === p.id ? (
              <div>
                {needsKey(p) && (
                  <>
                    <p className="hint">
                      A sign-in page just opened in your browser. Sign in, create a key, and paste it here:
                    </p>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste your API key"
                      style={{ marginBottom: 8 }}
                    />
                  </>
                )}
                {p.id === 'custom' && (
                  <>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://your-server/v1"
                      style={{ marginBottom: 8 }}
                    />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="API key (if your server needs one)"
                      style={{ marginBottom: 8 }}
                    />
                  </>
                )}
                {error && <div className="error">{error}</div>}
                <div className="row">
                  <button
                    className="primary"
                    disabled={busy || (needsKey(p) && !apiKey) || (p.id === 'custom' && !baseUrl)}
                    onClick={() => void connect(p)}
                  >
                    {busy ? 'Testing…' : p.local ? 'Use this' : 'Connect'}
                  </button>
                  <button className="ghost" onClick={() => setConnecting(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="row">
                <button className="primary" onClick={() => startConnect(p)}>
                  {p.connected ? (p.active ? 'Reconnect' : 'Use this') : 'Connect'}
                </button>
                {p.connected && !p.local && p.id !== 'custom' && (
                  <button
                    className="ghost"
                    onClick={() => {
                      void window.inboxIntel.aiDisconnect(p.id).then(load)
                    }}
                  >
                    Forget key
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
