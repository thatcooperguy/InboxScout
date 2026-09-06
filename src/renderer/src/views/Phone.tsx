import { useEffect, useState } from 'react'

type PhoneInfo = Awaited<ReturnType<typeof window.inboxScout.phoneInfo>>

/**
 * "On your phone": one tap turns on a small page on the home Wi‑Fi, a QR code opens it on the phone,
 * and "Add to Home Screen" keeps it like an app. No app store, nothing leaves the house.
 */
export default function Phone(): JSX.Element {
  const [info, setInfo] = useState<PhoneInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [note, setNote] = useState('')

  const refresh = async (): Promise<void> => {
    try {
      setInfo(await window.inboxScout.phoneInfo())
    } catch {
      /* the hub shows the state line; nothing to add here */
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  // The server needs a moment to start listening; check again so "Starting…" turns into "On".
  useEffect(() => {
    if (!info?.enabled || info.running || info.error) return
    const t = window.setTimeout(() => void refresh(), 700)
    return () => window.clearTimeout(t)
  }, [info])

  const setOn = async (on: boolean): Promise<void> => {
    setBusy(true)
    setNote('')
    try {
      setInfo(await window.inboxScout.phoneSet(on))
      void window.inboxScout.track('feature', on ? 'phone:on' : 'phone:off')
    } finally {
      setBusy(false)
    }
  }
  const newCode = async (): Promise<void> => {
    setBusy(true)
    try {
      setInfo(await window.inboxScout.phoneRegenerate())
      setConfirmNew(false)
      setNote('New code made. Phones with the old link are cut off — scan again to reconnect.')
      window.setTimeout(() => setNote(''), 6000)
    } finally {
      setBusy(false)
    }
  }

  if (!info) return <div className="empty">Loading…</div>

  const status = !info.enabled ? 'Off' : info.error ? 'Not working' : info.running ? 'On' : 'Starting…'

  return (
    <div>
      <h1>On your phone</h1>
      <p className="sub">See your brief on your phone over your home Wi‑Fi, check email, and tick things off. No app store, nothing leaves the house.</p>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span role="status" aria-live="polite" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                display: 'inline-block',
                background: !info.enabled ? 'var(--ink-faint)' : info.error ? 'var(--red, #c0392f)' : info.running ? 'var(--good, #2e7d4f)' : 'var(--amber, #a6641b)'
              }}
            />
            {status}
          </span>
          {!info.enabled ? (
            <button className="primary" style={{ minHeight: 44, fontSize: 15 }} onClick={() => void setOn(true)} disabled={busy}>
              📱 Show on my phone
            </button>
          ) : (
            <button className="ghost" style={{ minHeight: 40 }} onClick={() => void setOn(false)} disabled={busy}>
              Turn off
            </button>
          )}
        </div>
        {info.error && (
          <div className="error" role="alert">
            {info.error}
          </div>
        )}
        {note && (
          <div className="success" role="status">
            {note}
          </div>
        )}
      </div>

      {info.enabled && (
        <div className="card">
          {info.qrDataUrl && info.url ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
              <div style={{ textAlign: 'center' }}>
                <img
                  src={info.qrDataUrl}
                  alt="Code to scan with your phone's camera"
                  width={240}
                  height={240}
                  style={{ display: 'block', width: 240, height: 240, borderRadius: 12, border: '1px solid var(--line)', background: '#fff' }}
                />
                <div className="hint" style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12.5, wordBreak: 'break-all', maxWidth: 240 }}>{info.url.replace(/#t=.*$/, '')}</div>
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>How to</h3>
                <ol style={{ margin: '0 0 12px', paddingLeft: 22, lineHeight: 1.7 }}>
                  <li>Scan the code with your phone&apos;s camera.</li>
                  <li>Tap the link that pops up.</li>
                  <li>
                    Share <span aria-hidden="true">→</span> <strong>Add to Home Screen</strong> to keep it like an app.
                  </li>
                </ol>
                <p className="hint" style={{ margin: '0 0 6px' }}>
                  <strong>Same Wi‑Fi as this computer. Your computer has to be on.</strong>
                </p>
                <p className="hint" style={{ margin: '0 0 12px' }}>
                  Windows may ask whether InboxScout can use the network the first time — choose <strong>Allow</strong> (private networks).
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {confirmNew ? (
                    <>
                      <span className="hint">Every phone will need to scan again.</span>
                      <button className="primary" onClick={() => void newCode()} disabled={busy}>
                        Yes, new code
                      </button>
                      <button className="ghost" onClick={() => setConfirmNew(false)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button className="ghost" onClick={() => setConfirmNew(true)} disabled={busy}>
                      New code
                    </button>
                  )}
                  <button className="ghost" onClick={() => void setOn(false)} disabled={busy}>
                    Turn off
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
                  Anyone who has this code can read your brief. <strong>New code</strong> cuts them off.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ marginTop: 0 }}>
                <strong>I can&apos;t find this computer&apos;s Wi‑Fi address.</strong>
              </p>
              <p className="hint">Connect this computer to your home Wi‑Fi (or plug in a network cable), then come back here.</p>
              <button className="ghost" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {!info.enabled && (
        <div className="card">
          <h3>What your phone can do</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Read your latest brief and past briefs.</li>
            <li>Press <strong>Check my email</strong> — your computer does the checking.</li>
            <li>Mark things done.</li>
          </ul>
          <p className="hint" style={{ marginBottom: 0 }}>
            It cannot change settings, connect accounts, or see passwords. Only phones on your home Wi‑Fi with the code can open it.
          </p>
        </div>
      )}
    </div>
  )
}
