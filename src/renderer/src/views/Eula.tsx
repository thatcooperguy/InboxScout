import { useState } from 'react'
import { EULA_ACCEPT_LINE, EULA_SECTIONS, EULA_VERSION } from '../../../shared/eula'
import { speak } from '../useLevel'

const LICENSE_URL = 'https://github.com/thatcooperguy/InboxScout/blob/main/LICENSE.md'

interface Props {
  /** Called after the acceptance has been saved to settings. */
  onAccepted: () => void
}

/**
 * The plain-language terms, shown once at first launch (and again from
 * Settings → "Read the terms again"). Big calm cards, a checkbox, one button.
 */
export default function Eula({ onAccepted }: Props): JSX.Element {
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const accept = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      const current = await window.inboxScout.getSettings()
      await window.inboxScout.setSettings({ ...current, eulaAcceptedVersion: EULA_VERSION })
      onAccepted()
    } catch (err: any) {
      setError(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
      setSaving(false)
    }
  }

  const readAloud = (): void => {
    const text = EULA_SECTIONS.map((s) => `${s.title}. ${s.body}`).join(' ')
    speak(`${text} ${EULA_ACCEPT_LINE}`)
  }

  const btn: React.CSSProperties = { minHeight: 44, fontSize: 16 }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 28px' }} aria-labelledby="eula-title">
      <div className="brand" style={{ fontSize: 22, marginBottom: 6 }}>📬 InboxScout</div>
      <h1 id="eula-title" style={{ fontSize: 26, margin: '0 0 6px' }}>Before we start</h1>
      <p className="sub" style={{ fontSize: 16, lineHeight: 1.5 }}>
        A few things you should know, in plain words. Read them, tick the box, and you are in.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="ghost" style={btn} onClick={readAloud}>
          🔊 Read it to me
        </button>
        <button className="ghost" style={btn} onClick={() => window.speechSynthesis?.cancel()}>
          Stop reading
        </button>
      </div>

      <div
        role="region"
        aria-label="The terms"
        tabIndex={0}
        style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: 6, marginBottom: 16 }}
      >
        {EULA_SECTIONS.map((s) => (
          <div className="card" key={s.title} style={{ padding: '18px 20px', borderRadius: 12 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>{s.title}</h3>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{s.body}</p>
          </div>
        ))}
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Version {EULA_VERSION}.{' '}
          <button
            className="ghost tiny"
            style={{ border: 'none', padding: 0, textDecoration: 'underline', color: 'var(--blue)', minHeight: 0, background: 'transparent' }}
            onClick={() => void window.inboxScout.openExternal(LICENSE_URL)}
          >
            Full license
          </button>
        </p>
      </div>

      <div className="card" style={{ borderRadius: 12 }}>
        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', fontSize: 16, lineHeight: 1.45 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ width: 24, height: 24, margin: '1px 0 0', flex: '0 0 auto' }}
          />
          <span>{EULA_ACCEPT_LINE}</span>
        </label>
        {error && (
          <div className="error" role="alert">
            Could not save that: {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <button className="big-btn" disabled={!checked || saving} onClick={() => void accept()}>
            {saving ? 'Saving…' : 'Agree and continue'}
          </button>
          {!checked && <span className="hint">Tick the box first.</span>}
        </div>
      </div>
    </div>
  )
}
