import { useEffect, useRef, useState } from 'react'
import type { Answer, AskAction } from '../../../shared/types'
import { t } from '../copy'
import { speak } from '../useLevel'

type Level = 'simple' | 'standard' | 'pro'

interface Props {
  level: Level
  /** Switch tab for `go_to` actions (Today passes its own onGoTo through). */
  onGoTo?: (tab: string) => void
}

interface Exchange {
  id: string
  q: string
  answer: Answer | null
  /** An AI answer is on its way; the row says "thinking…" under the local answer meanwhile. */
  thinking: boolean
  /** An `auto` action already ran for this exchange (never open two drafts for one question). */
  autoRan: boolean
}

const MAX_EXCHANGES = 5

/**
 * Conversation (v1.4, Part B): one line under the Today hero — "Ask about your mail…". The local answer
 * appears at once; when an AI helper is connected its answer replaces it a few seconds later. The
 * transcript (last 5 exchanges) lives in this component only; nothing is stored.
 */
export default function AskBox({ level, onGoTo }: Props): JSX.Element {
  const simple = level === 'simple'
  const pro = level === 'pro'
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<Exchange[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const runActions = (a: Answer, ex: Exchange): boolean => {
    const auto = a.actions.find((x) => x.auto && (x.kind === 'open_draft' || x.kind === 'speak'))
    if (!auto || ex.autoRan) return ex.autoRan
    void act(auto)
    return true
  }

  const act = async (a: AskAction): Promise<void> => {
    if (a.kind === 'open_draft' && a.mailto) {
      void window.inboxScout.track('feature', 'ask_draft')
      await window.inboxScout.openExternal(a.mailto)
    } else if (a.kind === 'go_to' && a.tab) onGoTo?.(a.tab)
    else if (a.kind === 'speak') speak(a.text ?? '')
    else if (a.kind === 'ask' && a.question) await submit(a.question)
  }

  // AI answers arrive later on their own channel, matched by id.
  useEffect(() => {
    return window.inboxScout.onAskAnswer(({ id, answer }) => {
      setLog((prev) =>
        prev.map((ex) => {
          if (ex.id !== id) return ex
          const next = { ...ex, answer, thinking: false }
          next.autoRan = runActions(answer, next)
          if (simple && !answer.actions.some((x) => x.kind === 'speak')) speak(answer.text)
          return next
        })
      )
    })
  }, [simple])

  const submit = async (question: string): Promise<void> => {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setQ('')
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
    setLog((prev) => [{ id, q: text, answer: null, thinking: false, autoRan: false }, ...prev].slice(0, MAX_EXCHANGES))
    try {
      const r = await window.inboxScout.ask(text, id)
      setLog((prev) =>
        prev.map((ex) => {
          if (ex.id !== id) return ex
          const next = { ...ex, answer: r.answer, thinking: r.aiPending }
          next.autoRan = runActions(r.answer, next)
          return next
        })
      )
      // At Simple every answer is spoken; "read it to me" already carries its own speak action.
      if (simple && !r.answer.actions.some((a) => a.kind === 'speak')) speak(r.answer.text)
    } catch {
      setLog((prev) => prev.map((ex) => (ex.id === id ? { ...ex, answer: { text: t('ask.nothing', level), sources: [], actions: [], engine: 'local', unsure: true }, thinking: false } : ex)))
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="today-card ask-box" style={{ marginBottom: 14 }}>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        onSubmit={(e) => {
          e.preventDefault()
          void submit(q)
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ask.placeholder', level)}
          aria-label={t('ask.placeholder', level)}
          maxLength={500}
          style={{ flex: 1, fontSize: simple ? 18 : 15, minHeight: simple ? 48 : 40 }}
        />
        <button className={simple ? 'big-btn' : 'primary'} type="submit" disabled={busy || !q.trim()} style={simple ? { fontSize: 18 } : {}}>
          {t('ask.button', level)}
        </button>
      </form>
      {simple && (
        <p className="hint" style={{ marginTop: 6 }}>
          {t('ask.voiceHint', level)}
        </p>
      )}
      {!simple && log.length === 0 && (
        <p className="hint" style={{ marginTop: 6 }}>
          {t('ask.help', level)}
        </p>
      )}
      {log.length > 0 && (
        <div role="log" aria-live="polite" style={{ marginTop: 10 }}>
          {log.map((ex) => (
            <div key={ex.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <div className="hint">You: {ex.q}</div>
              {!ex.answer && <div className="hint">…</div>}
              {ex.answer && (
                <>
                  <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4, fontSize: simple ? 17 : 15 }}>{ex.answer.text}</div>
                  {ex.thinking && (
                    <div className="hint" role="status" style={{ marginTop: 4 }}>
                      ⏳ {t('ask.thinking', level)}
                    </div>
                  )}
                  {ex.answer.sources.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} aria-label="Sources">
                      {ex.answer.sources.map((s, i) => (
                        <span key={i} className="chip" title={s.label} style={{ cursor: 'default' }}>
                          {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                    <button className="ghost tiny" onClick={() => speak(ex.answer!.text)} aria-label="Read this answer aloud" title="Read it to me">
                      🔊
                    </button>
                    {ex.answer.actions
                      .filter((a) => a.kind !== 'speak' && a.kind !== 'open_message' && (a.kind !== 'go_to' || onGoTo))
                      .map((a, i) => (
                        <button key={i} className={a.kind === 'ask' ? 'chip' : 'ghost tiny'} onClick={() => void act(a)}>
                          {a.kind === 'open_draft' ? `✍ ${a.label ?? 'Open the draft'}` : a.kind === 'go_to' ? `→ ${a.label ?? a.tab}` : a.label ?? a.question}
                        </button>
                      ))}
                    {pro && ex.answer.unsure && <span className="hint">{t('ask.unsure', level)}</span>}
                    {pro && <span className="hint">· {ex.answer.engine === 'ai' ? 'AI' : 'local'}</span>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
