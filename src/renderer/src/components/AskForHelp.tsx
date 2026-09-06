import { useEffect, useRef, useState } from 'react'
import type { Helper } from '../../../shared/types'
import { fill, t } from '../copy'
import { speak } from '../useLevel'

type Level = 'simple' | 'standard' | 'pro'

interface Props {
  title: string
  nextStep?: string
  whyNow?: string
  level: Level
}

interface HelperState {
  helpers: Helper[]
  paused: boolean
}

// One fetch shared by every row on the screen; refreshed after a few seconds so Setup changes show up.
let cache: { at: number; promise: Promise<HelperState> } | null = null
function loadHelpers(): Promise<HelperState> {
  if (cache && Date.now() - cache.at < 5000) return cache.promise
  const promise = window.inboxScout
    .helpersList()
    .then((r) => ({ helpers: r.helpers.filter((h) => !h.paused), paused: r.paused }))
    .catch(() => ({ helpers: [], paused: false }))
  cache = { at: Date.now(), promise }
  return promise
}

const timeOf = (iso: string): string => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Trusted helpers (v1.4, A2a): "Ask for help" on a Today row. Button → inline form (helper picker,
 * one-line note, Send / Cancel) → a ten-second pending bar with Cancel → "Sent to Sarah".
 * Drop it into any row: <AskForHelp title={i.title} nextStep={i.nextStep} whyNow={i.whyNow} level={level} />
 */
export default function AskForHelp({ title, nextStep, whyNow, level }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<HelperState | null>(null)
  const [helperId, setHelperId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ sendId: string; sendsAt: string; name: string; outboxMissing: boolean; mailto: string | null } | null>(null)
  const [left, setLeft] = useState(0)
  const [done, setDone] = useState<{ name: string; at: string; failed: boolean } | null>(null)
  const timer = useRef<number | null>(null)

  const openForm = async (): Promise<void> => {
    setOpen(true)
    setError('')
    const s = await loadHelpers()
    setState(s)
    if (!helperId && s.helpers[0]) setHelperId(s.helpers[0].id)
    if (level === 'simple' && s.helpers[0]) speak(fill(t('help.prompt', level), { name: s.helpers[0].name, title }))
  }

  useEffect(() => {
    if (!pending) return
    const tick = (): void => {
      const n = Math.max(0, Math.ceil((new Date(pending.sendsAt).getTime() - Date.now()) / 1000))
      setLeft(n)
      if (n === 0) {
        setDone({ name: pending.name, at: pending.sendsAt, failed: pending.outboxMissing })
        setPending(null)
        if (level === 'simple') speak(fill(t('help.sent', level), { name: pending.name, time: timeOf(pending.sendsAt) }))
      }
    }
    tick()
    timer.current = window.setInterval(tick, 500)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [pending, level])

  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setDone(null), done.failed ? 20000 : 8000)
    return () => window.clearTimeout(id)
  }, [done])

  const send = async (): Promise<void> => {
    if (!helperId || busy) return
    setBusy(true)
    setError('')
    try {
      void window.inboxScout.track('feature', 'askHelp')
      const r = await window.inboxScout.helpersAsk({ helperId, title, nextStep, whyNow, note: note.trim() || undefined })
      setPending({ sendId: r.sendId, sendsAt: r.sendsAt, name: r.helperName, outboxMissing: r.outboxMissing, mailto: r.mailto })
      setOpen(false)
      setNote('')
    } catch (err: any) {
      setError(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (!pending) return
    const p = pending
    setPending(null)
    await window.inboxScout.helpersCancel(p.sendId).catch(() => undefined)
  }

  if (pending) {
    return (
      <span role="status" aria-live="polite" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontWeight: 600 }}>
        {fill(t('help.sending', level), { name: pending.name, n: left })}
        <button className="ghost" onClick={() => void cancel()}>
          {t('help.cancel', level)}
        </button>
      </span>
    )
  }

  if (done) {
    return (
      <span role="status" aria-live="polite" className={done.failed ? 'error' : 'success'} style={{ display: 'inline-block', margin: 0 }}>
        {done.failed ? 'Not sent: no account on this computer can send mail. See Setup → Health.' : fill(t('help.sent', level), { name: done.name, time: timeOf(done.at) })}
      </span>
    )
  }

  if (!open) {
    return (
      <button className="ghost" title={t('help.button', 'standard')} onClick={() => void openForm()}>
        🙋 {t('help.button', level)}
      </button>
    )
  }

  const helpers = state?.helpers ?? []
  const chosen = helpers.find((h) => h.id === helperId) ?? helpers[0]
  return (
    <div className="card" style={{ margin: '6px 0 0', padding: 12, maxWidth: 520 }}>
      {!state ? (
        <span className="hint">Loading…</span>
      ) : state.paused ? (
        <p className="hint" style={{ margin: 0 }}>
          {t('help.paused', level)}
        </p>
      ) : helpers.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t('help.none', level)}
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 8px' }}>{fill(t('help.prompt', level), { name: chosen?.name ?? '', title })}</p>
          {helpers.length > 1 && (
            <label className="field">
              <span>Who</span>
              <select value={helperId} onChange={(e) => setHelperId(e.target.value)}>
                {helpers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.relationship ? ` (${h.relationship})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t('help.note', level)}</span>
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
            />
          </label>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            They get the title, the next step, and your note — not the email itself.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {state && !state.paused && helpers.length > 0 && (
          <button className="primary" disabled={busy || !helperId} onClick={() => void send()}>
            {t('help.send', level)}
          </button>
        )}
        <button className="ghost" onClick={() => setOpen(false)}>
          {t('help.cancel', level)}
        </button>
      </div>
    </div>
  )
}
