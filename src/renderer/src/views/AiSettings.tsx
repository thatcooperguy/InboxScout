import { useEffect, useState } from 'react'

export default function AiSettings(): JSX.Element {
  const [providers, setProviders] = useState<any[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = (): void => {
    void window.inboxIntel.aiProviders().then(setProviders)
  }
  useEffect(load, [])

  const startConnect = (id: string): void => {
    setConnecting(id)
    setApiKey('')
    setError('')
    setOk('')
    if (id !== 'ollama') void window.inboxIntel.aiOpenKeyPage(id)
  }

  const connect = async (id: string): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const res = await window.inboxIntel.aiConnect({ provider: id, apiKey })
      if (res.ok) {
        setOk(`Connected ✓ — ${id} is now your active AI.`)
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
        Pick who does the thinking. Your key is encrypted on this computer and used only for your own scans.
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
                {p.id !== 'ollama' && (
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
                {error && <div className="error">{error}</div>}
                <div className="row">
                  <button
                    className="primary"
                    disabled={busy || (p.id !== 'ollama' && !apiKey)}
                    onClick={() => void connect(p.id)}
                  >
                    {busy ? 'Testing…' : p.id === 'ollama' ? 'Use local Ollama' : 'Connect'}
                  </button>
                  <button className="ghost" onClick={() => setConnecting(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="row">
                <button className="primary" onClick={() => startConnect(p.id)}>
                  {p.connected ? (p.active ? 'Reconnect' : 'Use this') : 'Connect'}
                </button>
                {p.connected && p.id !== 'ollama' && (
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
