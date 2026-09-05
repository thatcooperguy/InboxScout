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

  const load = (): void => {
    void window.inboxIntel.listAccounts().then(setAccounts)
  }
  useEffect(() => {
    load()
    void window.inboxIntel.accountPresets().then(setPresets)
  }, [])

  const preset = presets[provider] ?? { host: '', port: 993, sentFolder: 'Sent', help: '' }

  const add = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      await window.inboxIntel.addAccount({
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
    await window.inboxIntel.removeAccount(id)
    load()
  }

  return (
    <div>
      <h1>Email accounts</h1>
      <p className="sub">Read-only access — Inbox Intel can never send, delete, or change your mail.</p>
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
              <option value="imap">Other (IMAP)</option>
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
        </div>
      )}
    </div>
  )
}
