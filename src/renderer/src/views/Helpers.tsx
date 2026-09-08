import { useEffect, useState } from 'react'
import { cleanIpcError } from '../../../shared/appPassword'
import type { Helper, HelperCadence, HelperLevel, HelperSend } from '../../../shared/types'
import { useLevel } from '../useLevel'

/**
 * Setup → Trusted helpers (v1.4, Part A): the people who get a short, plain-words note when
 * something needs you. Add, edit, pause, delete; pick a sharing level; read every message
 * ever sent, verbatim; and Pause all in one press.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Level picker copy (spec A6). */
export const LEVEL_COPY: { id: HelperLevel; label: string; blurb: string }[] = [
  { id: 'ask', label: 'Ask only', blurb: 'only when I press Ask for help' },
  { id: 'schedule', label: 'Appointments only', blurb: 'good for a friend' },
  { id: 'needs', label: 'What needs me', blurb: 'plus a heads-up about scams, a broken account, or someone gone quiet' },
  { id: 'all', label: 'Everything', blurb: 'the same brief I get' }
]

const CADENCES: { id: HelperCadence; label: string }[] = [
  { id: 'each_brief', label: 'After every check' },
  { id: 'weekly', label: 'Once a week' },
  { id: 'off', label: 'No regular note (Ask for help and heads-ups only)' }
]

const KIND_WORDS: Record<HelperSend['kind'], string> = { hello: 'Hello', ask: 'Ask for help', digest: 'Digest', headsup: 'Heads-up' }

interface Form {
  name: string
  relationship: string
  email: string
  phone: string
  carrier: string
  level: HelperLevel
  cadence: HelperCadence
  weekday: number
}

const EMPTY: Form = { name: '', relationship: '', email: '', phone: '', carrier: '', level: 'needs', cadence: 'each_brief', weekday: 1 }

const cleanError = cleanIpcError

const OUTBOX_PROVIDERS = new Set(['gmail', 'yahoo', 'icloud'])

export default function Helpers(): JSX.Element {
  const level = useLevel()
  const simple = level === 'simple'
  const [helpers, setHelpers] = useState<Helper[]>([])
  const [paused, setPaused] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([])
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [log, setLog] = useState<HelperSend[]>([])
  const [showLog, setShowLog] = useState(false)
  const [outboxOk, setOutboxOk] = useState<boolean | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const r = await window.inboxScout.helpersList()
      setHelpers(r.helpers)
      setPaused(r.paused)
      setLog(await window.inboxScout.helpersLog(100))
    } finally {
      setLoaded(true)
    }
  }
  useEffect(() => {
    void refresh()
    void window.inboxScout.deliveryCarriers().then(setCarriers).catch(() => setCarriers([]))
    void window.inboxScout
      .listAccounts()
      .then((a) => setOutboxOk(a.some((x) => OUTBOX_PROVIDERS.has(String(x.provider)))))
      .catch(() => setOutboxOk(null))
  }, [])

  const startAdd = (): void => {
    setForm(EMPTY)
    setEditing('new')
    setError('')
  }
  const startEdit = (h: Helper): void => {
    setForm({ name: h.name, relationship: h.relationship, email: h.email, phone: h.phone, carrier: h.carrier, level: h.level, cadence: h.cadence, weekday: h.weekday })
    setEditing(h.id)
    setError('')
  }
  const save = async (): Promise<void> => {
    if (busy || !editing) return
    setBusy(true)
    setError('')
    try {
      if (editing === 'new') {
        const h = await window.inboxScout.helpersAdd({ ...form, addedBy: 'person' })
        setNote(`${h.name} is added. ${h.email || h.phone ? 'A hello message is on its way, saying what they will get and that you can stop it.' : ''}`)
        void window.inboxScout.track('feature', 'helper:add')
      } else {
        await window.inboxScout.helpersUpdate(editing, form)
        setNote('Saved.')
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await window.inboxScout.helpersRemove(id)
      setConfirmRemove(null)
      setNote('Removed. They get nothing further.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  const togglePause = async (h: Helper): Promise<void> => {
    await window.inboxScout.helpersUpdate(h.id, { paused: !h.paused })
    await refresh()
  }
  const pauseAll = async (): Promise<void> => {
    const r = await window.inboxScout.helpersPauseAll(!paused)
    setPaused(r.paused)
    setNote(r.paused ? 'Paused. Nothing goes to any helper until you turn this back on.' : 'Your helpers hear from InboxScout again.')
    void window.inboxScout.track('feature', r.paused ? 'helper:pauseAll' : 'helper:resumeAll')
  }

  useEffect(() => {
    if (!note) return
    const id = window.setTimeout(() => setNote(''), 8000)
    return () => window.clearTimeout(id)
  }, [note])

  const levelLabel = (l: HelperLevel): string => LEVEL_COPY.find((x) => x.id === l)?.label ?? l
  const nameOf = (id: string): string => helpers.find((h) => h.id === id)?.name ?? 'a former helper'
  const set = (patch: Partial<Form>): void => setForm((f) => ({ ...f, ...patch }))
  const canSave = form.name.trim() && (form.email.trim() || (form.phone.trim() && form.carrier))

  return (
    <div>
      <h1>Trusted helpers</h1>
      <p className="sub">
        {simple
          ? 'A family member or friend who gets a short note when something needs you. Never your emails, never passwords.'
          : 'People who get a short, plain-words note when something needs you — a daughter, a neighbour, a friend. They need no app: it arrives by email or text. Never your emails themselves, never passwords, never attachments.'}
      </p>

      {outboxOk === false && helpers.length > 0 && (
        <div className="error" role="alert">
          No account on this computer can send mail yet. Add a Gmail, Yahoo, or iCloud account with an app password (Setup → Email accounts) or your helpers will not hear from InboxScout.
        </div>
      )}
      {note && (
        <div className="success" role="status">
          {note}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, display: 'inline-block', background: paused ? 'var(--amber, #a6641b)' : helpers.length ? 'var(--good, #2e7d4f)' : 'var(--ink-faint)' }} />
            {!loaded ? 'Loading…' : paused ? 'Paused — nothing is sent' : helpers.length === 0 ? 'Nobody yet' : `${helpers.length} helper${helpers.length === 1 ? '' : 's'}`}
          </span>
          <button className="primary" onClick={startAdd} disabled={editing === 'new'}>
            + Add a helper
          </button>
          {helpers.length > 0 && (
            <button className={paused ? 'primary' : 'ghost'} onClick={() => void pauseAll()}>
              {paused ? '▶ Turn helpers back on' : '⏸ Pause all helpers'}
            </button>
          )}
        </div>
        {helpers.length === 0 && loaded && editing !== 'new' && (
          <p className="hint" style={{ marginBottom: 0 }}>
            {simple ? 'Press Add a helper. You choose how much they get.' : 'Add someone and choose how much they get: nothing until you ask, appointments only, what needs you, or everything.'}
          </p>
        )}
      </div>

      {editing && (
        <div className="card">
          <h3>{editing === 'new' ? 'New helper' : `Edit ${form.name || 'helper'}`}</h3>
          <div className="grid2">
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Sarah" autoFocus />
            </label>
            <label className="field">
              <span>Who they are to you</span>
              <input value={form.relationship} onChange={(e) => set({ relationship: e.target.value })} placeholder="daughter, neighbour, friend" />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="sarah@example.com" />
            </label>
            <label className="field">
              <span>Mobile number (for texts, optional)</span>
              <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(555) 123-4567" />
            </label>
            {form.phone.trim() && (
              <label className="field">
                <span>Their mobile carrier</span>
                <select value={form.carrier} onChange={(e) => set({ carrier: e.target.value })}>
                  <option value="">Choose…</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <fieldset style={{ border: '1px solid var(--line, #dde2ea)', borderRadius: 8, padding: '10px 12px', margin: '8px 0 12px' }}>
            <legend style={{ fontWeight: 600, padding: '0 4px' }}>What they get</legend>
            <div role="radiogroup" aria-label="Sharing level" style={{ display: 'grid', gap: 8 }}>
              {LEVEL_COPY.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={form.level === l.id}
                  className="hub-btn"
                  style={{ width: '100%', textAlign: 'left', ...(form.level === l.id ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}) }}
                  onClick={() => set({ level: l.id })}
                >
                  <strong>
                    {l.label}
                    {form.level === l.id ? ' ✓' : ''}
                  </strong>
                  <span className="sub">— {l.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {form.level !== 'ask' && (
            <div className="grid2">
              <label className="field">
                <span>How often</span>
                <select value={form.cadence} onChange={(e) => set({ cadence: e.target.value as HelperCadence })}>
                  {CADENCES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.cadence === 'weekly' && (
                <label className="field">
                  <span>Which day</span>
                  <select value={String(form.weekday)} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={String(i)}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <p className="hint">
            {editing === 'new'
              ? 'They get one hello message saying what they will get and that you can stop it any time. Manual "Check my email" runs never send anything.'
              : 'Changes apply from the next check.'}
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={busy || !canSave} onClick={() => void save()}>
              {busy ? 'Saving…' : editing === 'new' ? 'Add and send hello' : 'Save'}
            </button>
            <button className="ghost" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {helpers.map((h) => (
        <div className="card" key={h.id} style={h.paused || paused ? { opacity: 0.7 } : undefined}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong style={{ fontSize: 16 }}>
                {h.name}
                {h.relationship ? <span className="hint" style={{ fontWeight: 400 }}> · {h.relationship}</span> : null}
                {h.paused ? <span className="pill" style={{ marginLeft: 8 }}>paused</span> : null}
              </strong>
              <div className="hint" style={{ marginTop: 4 }}>
                {[h.email, h.phone ? `${h.phone}${h.carrier ? ` (${carriers.find((c) => c.id === h.carrier)?.name ?? h.carrier})` : ''}` : ''].filter(Boolean).join(' · ')}
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>{levelLabel(h.level)}</strong>
                {h.level !== 'ask' && (
                  <span className="hint">
                    {' '}
                    · {h.cadence === 'each_brief' ? 'after every check' : h.cadence === 'weekly' ? `every ${WEEKDAYS[h.weekday] ?? 'Monday'}` : 'no regular note'}
                  </span>
                )}
                {h.addedBy !== 'person' && <span className="hint"> · added {h.addedBy === 'bridge' ? 'by a connected agent' : 'during setup'}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="ghost" onClick={() => startEdit(h)}>
                Edit
              </button>
              <button className="ghost" onClick={() => void togglePause(h)}>
                {h.paused ? 'Resume' : 'Pause'}
              </button>
              {confirmRemove === h.id ? (
                <>
                  <button className="primary" onClick={() => void remove(h.id)} disabled={busy}>
                    Yes, remove
                  </button>
                  <button className="ghost" onClick={() => setConfirmRemove(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button className="ghost" onClick={() => setConfirmRemove(h.id)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="card">
        <h3>
          Everything sent to your helpers
          {log.length > 0 && <span className="hint" style={{ fontWeight: 400 }}> · {log.length} message{log.length === 1 ? '' : 's'}</span>}
        </h3>
        <p className="hint">Every message, word for word, so you always know what they saw.</p>
        {log.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Nothing sent yet.
          </p>
        ) : (
          <>
            {(showLog ? log : log.slice(0, 5)).map((s) => (
              <details key={s.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <summary style={{ cursor: 'pointer' }}>
                  <strong>{nameOf(s.helperId)}</strong> · {KIND_WORDS[s.kind] ?? s.kind} · {s.channel === 'sms' ? 'text' : 'email'} ·{' '}
                  {new Date(s.sentAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {s.status !== 'sent' && (
                    <span className={s.status === 'failed' ? 'pill urgent' : 'pill'} style={{ marginLeft: 8, color: s.status === 'failed' ? 'var(--red, #c0392f)' : undefined }}>
                      {s.status === 'failed' ? `not sent: ${s.error ?? 'unknown error'}` : 'cancelled'}
                    </span>
                  )}
                  {s.subject && <div className="hint">{s.subject}</div>}
                </summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, margin: '6px 0 0', color: 'var(--ink-soft)' }}>{s.text}</pre>
              </details>
            ))}
            {log.length > 5 && (
              <button className="ghost" style={{ marginTop: 8 }} onClick={() => setShowLog((v) => !v)}>
                {showLog ? 'Show fewer' : `Show all ${log.length}`}
              </button>
            )}
          </>
        )}
      </div>

      {!simple && (
        <div className="card">
          <h3>What helpers never see</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>The emails themselves, attachments, or your People list.</li>
            <li>Passwords, sign-ins, or anything from a message flagged private beyond its subject and sender.</li>
            <li>Anything at all while helpers are paused, or from a manual “Check my email”.</li>
          </ul>
          <p className="hint" style={{ marginBottom: 0 }}>
            Messages go out from your own email account, so a helper can simply reply — their note lands in your inbox and on Today. Texts cannot be replied to; the text says so.
          </p>
        </div>
      )}
    </div>
  )
}
