import { useEffect, useRef, useState } from 'react'
import { cleanIpcError } from '../../../shared/appPassword'
import { useLevel } from '../useLevel'

interface Props {
  /** Pre-select a recipe and params (e.g. from the account wizard). */
  preset?: { recipeId: string; params: Record<string, string> } | null
}

type Autonomy = 'careful' | 'signin' | 'full'

/** The three ways the assistant may work, in the order shown. Full stays first and recommended (owner decision). */
const AUTONOMY_OPTIONS: { value: Autonomy; title: string; line: string; recommended?: boolean }[] = [
  { value: 'full', title: 'Do it all', line: 'Signs in for me and keeps going. Only asks me for verification codes.', recommended: true },
  { value: 'signin', title: 'Sign in, but ask first', line: 'Signs in for me. Stops and asks before paying, deleting, or leaving the site.' },
  { value: 'careful', title: "I'll do the sign-ins", line: 'Opens the page; I sign in and approve anything risky myself.' }
]

/** Plain names for the things a recipe can capture (raw keys are internal). */
const CAPTURED_NAMES: Record<string, string> = {
  googleClientId: 'Google app ID',
  googleClientSecret: 'Google app secret',
  microsoftClientId: 'Microsoft app ID',
  appPassword: 'App password'
}

/** Accept "amazon.com" as well as "https://amazon.com". Returns '' when it is not a web address. */
function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^https?:\/\/\S+$/i.test(s)) return s
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(s)) return `https://${s}`
  return ''
}

/**
 * The Assistant: pick a job, watch it work in its own browser window,
 * answer a question or take over for a sign-in when asked, press Stop any time.
 */
export default function Assistant({ preset }: Props): JSX.Element {
  const level = useLevel()
  const [recipes, setRecipes] = useState<any[]>([])
  const [aiReady, setAiReady] = useState(true)
  const [selected, setSelected] = useState<string>(preset?.recipeId ?? '')
  const [params, setParams] = useState<Record<string, string>>(preset?.params ?? {})
  const [custom, setCustom] = useState({ goal: '', startUrl: '' })
  const [status, setStatus] = useState<string>('idle')
  const [banner, setBanner] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [captured, setCaptured] = useState<Record<string, string>>({})
  const [autonomy, setAutonomy] = useState<Autonomy>('signin')
  const [signins, setSignins] = useState<string[]>([])
  const [newSignin, setNewSignin] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [signinMsg, setSigninMsg] = useState('')
  const [signinAs, setSigninAs] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [confirmForget, setConfirmForget] = useState<string | null>(null)
  const [systemEnabled, setSystemEnabled] = useState(false)
  const logBox = useRef<HTMLDivElement>(null)
  /** True while the person is reading the newest lines; false once they scroll up to read older ones. */
  const followLog = useRef(true)

  useEffect(() => {
    void window.inboxScout.agentRecipes().then((r) => {
      setRecipes(r.recipes)
      setAiReady(r.aiReady)
      setAutonomy(r.autonomy)
      setSignins(r.signins)
    })
    void window.inboxScout.agentStatus().then((s) => {
      setStatus(s.status)
      setLog(s.log)
      setCaptured(s.captured)
    })
    void window.inboxScout
      .systemStatus()
      .then((s) => setSystemEnabled(s.enabled))
      .catch(() => setSystemEnabled(false))
    return window.inboxScout.onAgentEvent((e) => {
      if (e.status) setStatus(e.status)
      if (e.message) setLog((l) => [...l.slice(-80), e.message])
      if (e.type === 'status' || e.type === 'handoff' || e.type === 'error') setBanner(e.message ?? '')
      if (e.type === 'ask') setQuestion(e.question ?? '')
      if (e.type === 'captured' || e.type === 'done') setCaptured(e.captured ?? {})
      if (e.type === 'done') setQuestion('')
    })
  }, [])

  // Keep the newest line in view — but only while the person has not scrolled up to read something older.
  useEffect(() => {
    const box = logBox.current
    if (!box || !followLog.current) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ top: box.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [log])

  const onLogScroll = (): void => {
    const box = logBox.current
    if (!box) return
    followLog.current = box.scrollTop + box.clientHeight >= box.scrollHeight - 12
  }

  const recipe = recipes.find((r) => r.id === selected)
  const busy = status === 'running' || status === 'waiting_user' || status === 'waiting_answer'
  const startUrl = normalizeUrl(custom.startUrl)
  const canStart = aiReady && (recipe ? !recipe.params.some((p: any) => !(params[p.key] ?? '').trim()) : !!custom.goal.trim() && !!startUrl)

  const start = async (): Promise<void> => {
    void window.inboxScout.track('feature', 'assistant')
    setLog([])
    setCaptured({})
    setBanner('')
    setQuestion('')
    followLog.current = true
    if (recipe) await window.inboxScout.agentStart({ recipeId: recipe.id, params })
    else await window.inboxScout.agentStart({ goal: custom.goal, startUrl, signinEmail: signinAs || undefined })
  }

  const changeAutonomy = async (value: Autonomy): Promise<void> => {
    setAutonomy(value)
    setAutonomy(await window.inboxScout.agentSetAutonomy(value))
  }

  const addSignin = async (): Promise<void> => {
    setSigninMsg('')
    try {
      setSignins(await window.inboxScout.signinsSave(newSignin.email.trim(), newSignin.password))
      setNewSignin({ email: '', password: '' })
      setShowPassword(false)
      setSigninMsg('Saved ✓ — kept encrypted on this computer.')
    } catch (err: any) {
      setSigninMsg(cleanIpcError(err))
    }
  }

  const removeSignin = async (email: string): Promise<void> => {
    setSignins(await window.inboxScout.signinsDelete(email))
    setConfirmForget(null)
    setSigninMsg(`Forgot the sign-in for ${email}.`)
    if (signinAs === email) setSigninAs('')
  }

  const sendAnswer = async (): Promise<void> => {
    await window.inboxScout.agentAnswer(answer)
    setAnswer('')
    setQuestion('')
  }

  const actionBtn: React.CSSProperties = { minHeight: 40 }

  return (
    <div>
      <h1>Web chores</h1>
      <p className="sub">
        Give the assistant a job. It opens its own browser window and works through it step by step — you can watch,
        answer a question if it asks, take over for any sign-in, and stop it any time.
      </p>

      {!aiReady && (
        <div className="error" role="alert">
          The assistant needs an AI helper to think. Go to <strong>Setup → Smarter sorting</strong> and connect a free one
          (Gemini or Groq) — it takes about a minute.
        </div>
      )}

      {!busy && (
        <div className="card">
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Before it starts, how much may it do alone?</legend>
            <div className="hub-grid" style={{ marginBottom: 10 }}>
              {AUTONOMY_OPTIONS.map((o) => {
                const on = autonomy === o.value
                return (
                  <label
                    key={o.value}
                    className="hub-btn"
                    style={{ cursor: 'pointer', display: 'block', ...(on ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}) }}
                  >
                    <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name="assistant-autonomy"
                        value={o.value}
                        checked={on}
                        onChange={() => void changeAutonomy(o.value)}
                        style={{ width: 20, height: 20, margin: '2px 0 0', flex: '0 0 auto' }}
                      />
                      <span>
                        <strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>
                          {o.title}
                          {o.recommended && <span className="hint" style={{ fontWeight: 400 }}> (recommended)</span>}
                        </strong>
                        <span className="sub">{o.line}</span>
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <p className="hint" style={{ margin: 0 }}>
            Dial it back any time. Always on, whatever you pick: every step is shown below, there is a Stop button, the window is
            visible, and the AI never sees a password — it types a placeholder that InboxScout swaps in at the keyboard.
          </p>
          {systemEnabled && (
            <p className="hint" style={{ margin: '8px 0 0' }}>
              {level === 'simple'
                ? 'It can also use your computer. It will ask you first.'
                : 'It can also use your computer — open apps, type, run commands — and will ask the first time for each kind of thing. Turn this off in Settings → Helpers.'}
            </p>
          )}
        </div>
      )}

      {!busy && (
        <div className="card">
          <button
            className="ghost"
            style={{ ...actionBtn, width: '100%', textAlign: 'left', fontSize: 15, color: 'var(--ink)' }}
            aria-expanded={advancedOpen}
            aria-controls="assistant-advanced-signins"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            Advanced: let it sign in for me {advancedOpen ? '▾' : '▸'}
          </button>
          {advancedOpen && (
            <div id="assistant-advanced-signins" style={{ marginTop: 12 }}>
              <h3>🔑 Website passwords InboxScout may use</h3>
              <p className="hint" style={{ marginTop: 0 }}>
                Save the email and password you use on a website, and the assistant can sign in there as you. The password is stored
                encrypted on this computer and the AI never sees it — InboxScout types it in for you.
                {autonomy === 'careful' && " (Not used while you've picked \"I'll do the sign-ins\".)"}
              </p>
              {signins.length > 0 && (
                <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                  {signins.map((s) => (
                    <li key={s} style={{ marginBottom: 6 }}>
                      {confirmForget === s ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>Forget the sign-in for {s}?</span>
                          <button className="primary" style={actionBtn} onClick={() => void removeSignin(s)}>
                            Forget it
                          </button>
                          <button className="ghost" style={actionBtn} onClick={() => setConfirmForget(null)}>
                            Keep it
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {s}
                          <button className="ghost" style={actionBtn} onClick={() => setConfirmForget(s)}>
                            Forget…
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                  <span>Email address you use on the website</span>
                  <input
                    id="signin-email"
                    type="email"
                    autoComplete="off"
                    value={newSignin.email}
                    onChange={(e) => setNewSignin({ ...newSignin, email: e.target.value })}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                  <span>Password for that website</span>
                  <input
                    id="signin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newSignin.password}
                    onChange={(e) => setNewSignin({ ...newSignin, password: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && newSignin.email.trim() && newSignin.password && void addSignin()}
                  />
                </label>
                <button className="ghost" style={actionBtn} onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
                <button className="primary" style={actionBtn} onClick={() => void addSignin()} disabled={!newSignin.email.trim() || !newSignin.password}>
                  Save sign-in
                </button>
              </div>
              {signinMsg && (
                <p className="hint" role="status" aria-live="polite">
                  {signinMsg}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!busy && (
        <>
          <div className="hub-grid" style={{ marginBottom: 14 }}>
            {recipes.map((r) => (
              <button
                key={r.id}
                className="hub-btn"
                aria-pressed={selected === r.id}
                style={selected === r.id ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}}
                onClick={() => setSelected(r.id)}
              >
                <span className="icon">{r.icon}</span>
                <strong>{r.name}</strong>
                <span className="sub">{r.description}</span>
              </button>
            ))}
            <button
              className="hub-btn"
              aria-pressed={selected === ''}
              style={selected === '' ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}}
              onClick={() => setSelected('')}
            >
              <span className="icon">✍️</span>
              <strong>Something else</strong>
              <span className="sub">Describe any web task in plain words and give it a starting page.</span>
            </button>
          </div>

          <div className="card">
            {recipe ? (
              <>
                <h3>
                  {recipe.icon} {recipe.name}
                </h3>
                {recipe.params.map((p: any) => (
                  <label key={p.key} className="field">
                    <span>{p.label}</span>
                    <input value={params[p.key] ?? ''} placeholder={p.placeholder} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
                  </label>
                ))}
              </>
            ) : (
              <>
                <h3>✍️ Something else</h3>
                <label className="field">
                  <span>What should the assistant do?</span>
                  <textarea value={custom.goal} onChange={(e) => setCustom({ ...custom, goal: e.target.value })} placeholder="e.g. On my utility company's site, turn on paperless billing." />
                </label>
                <label className="field">
                  <span>Starting web address{autonomy === 'full' ? '' : ' (it will stay on this site)'}</span>
                  <input
                    value={custom.startUrl}
                    onChange={(e) => setCustom({ ...custom, startUrl: e.target.value })}
                    placeholder={level === 'simple' ? 'e.g. amazon.com' : 'e.g. amazon.com or https://www.amazon.com'}
                    inputMode="url"
                  />
                  {custom.startUrl.trim() && !startUrl && (
                    <span className="hint" style={{ fontWeight: 400, marginTop: 4 }}>
                      That doesn't look like a web address — try something like amazon.com.
                    </span>
                  )}
                  {startUrl && startUrl !== custom.startUrl.trim() && (
                    <span className="hint" style={{ fontWeight: 400, marginTop: 4 }}>
                      It will open {startUrl}
                    </span>
                  )}
                </label>
                {autonomy !== 'careful' && signins.length > 0 && (
                  <label className="field">
                    <span>Sign in as (optional)</span>
                    <select value={signinAs} onChange={(e) => setSigninAs(e.target.value)}>
                      <option value="">— pick automatically by site —</option>
                      {signins.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <button className="big-btn" disabled={!canStart} onClick={() => void start()}>
              ▶ Start
            </button>
          </div>
        </>
      )}

      {(busy || log.length > 0) && (
        <div className="card">
          <h3 role="status" aria-live="polite">
            {status === 'running' && '⏳ Working…'}
            {status === 'waiting_user' && '🙋 Your turn'}
            {status === 'waiting_answer' && '❓ Quick question'}
            {status === 'done' && '✅ Done'}
            {status === 'failed' && "⚠ Couldn't finish"}
            {status === 'stopped' && '⏹ Stopped by you'}
          </h3>
          {banner && (
            <div className={status === 'done' ? 'success' : status === 'failed' ? 'error' : 'hint'} role={status === 'failed' ? 'alert' : 'status'} style={{ fontSize: 15 }}>
              {banner}
            </div>
          )}

          {status === 'waiting_user' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
              <button className="big-btn" onClick={() => void window.inboxScout.agentContinue()}>
                ✓ I'm done — Continue
              </button>
              <span className="hint">Do the sign-in, verification, or approval in the assistant window, then press Continue.</span>
            </div>
          )}
          {status === 'waiting_answer' && question && (
            <div style={{ margin: '10px 0' }}>
              <label className="field" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 15 }}>{question}</span>
                <span style={{ display: 'flex', gap: 8, fontWeight: 400 }}>
                  <input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendAnswer()} placeholder="Type your answer" />
                  <button className="primary" style={actionBtn} onClick={() => void sendAnswer()} disabled={!answer.trim()}>
                    Answer
                  </button>
                </span>
              </label>
            </div>
          )}

          {Object.keys(captured).length > 0 && (
            <p className="hint">
              Saved so far:{' '}
              {Object.keys(captured)
                .map((k) => `${CAPTURED_NAMES[k] ?? k} ✓`)
                .join(' · ')}
            </p>
          )}

          <div
            ref={logBox}
            onScroll={onLogScroll}
            role="log"
            aria-live="polite"
            aria-label="What the assistant is doing"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, maxHeight: 260, overflowY: 'auto', fontSize: 13 }}
          >
            {log.map((l, i) => (
              <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
                {l}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {busy ? (
              <button className="ghost" style={actionBtn} onClick={() => void window.inboxScout.agentStop()}>
                ⏹ Stop
              </button>
            ) : (
              <button className="ghost" style={actionBtn} onClick={() => void window.inboxScout.agentCloseWindow()}>
                Close its browser window
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
