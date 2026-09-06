import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Pre-select a recipe and params (e.g. from the account wizard). */
  preset?: { recipeId: string; params: Record<string, string> } | null
}

/**
 * The Assistant: pick a job, watch it work in its own browser window,
 * answer a question or take over for a sign-in when asked, press Stop any time.
 */
export default function Assistant({ preset }: Props): JSX.Element {
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
  const [autonomy, setAutonomy] = useState<'careful' | 'signin' | 'full'>('signin')
  const [signins, setSignins] = useState<string[]>([])
  const [newSignin, setNewSignin] = useState({ email: '', password: '' })
  const [signinMsg, setSigninMsg] = useState('')
  const [signinAs, setSigninAs] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

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
    return window.inboxScout.onAgentEvent((e) => {
      if (e.status) setStatus(e.status)
      if (e.message) setLog((l) => [...l.slice(-80), e.message])
      if (e.type === 'status' || e.type === 'handoff' || e.type === 'error') setBanner(e.message ?? '')
      if (e.type === 'ask') setQuestion(e.question ?? '')
      if (e.type === 'captured' || e.type === 'done') setCaptured(e.captured ?? {})
      if (e.type === 'done') setQuestion('')
    })
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const recipe = recipes.find((r) => r.id === selected)
  const busy = status === 'running' || status === 'waiting_user' || status === 'waiting_answer'

  const start = async (): Promise<void> => {
    setLog([])
    setCaptured({})
    setBanner('')
    setQuestion('')
    if (recipe) await window.inboxScout.agentStart({ recipeId: recipe.id, params })
    else await window.inboxScout.agentStart({ goal: custom.goal, startUrl: custom.startUrl, signinEmail: signinAs || undefined })
  }

  const changeAutonomy = async (value: string): Promise<void> => {
    setAutonomy(await window.inboxScout.agentSetAutonomy(value))
  }

  const addSignin = async (): Promise<void> => {
    setSigninMsg('')
    try {
      setSignins(await window.inboxScout.signinsSave(newSignin.email, newSignin.password))
      setNewSignin({ email: '', password: '' })
      setSigninMsg('Saved ✓')
    } catch (err: any) {
      setSigninMsg(String(err?.message ?? err).replace(/^Error invoking remote method[^:]*:\s*/, ''))
    }
  }

  const removeSignin = async (email: string): Promise<void> => {
    setSignins(await window.inboxScout.signinsDelete(email))
  }

  const sendAnswer = async (): Promise<void> => {
    await window.inboxScout.agentAnswer(answer)
    setAnswer('')
    setQuestion('')
  }

  return (
    <div>
      <h1>Assistant</h1>
      <p className="sub">
        Give the assistant a job. It opens its own browser window and works through it step by step — you can watch,
        answer a question if it asks, take over for any sign-in, and stop it any time.
      </p>

      {!aiReady && (
        <div className="error">
          The assistant needs an AI helper to think. Go to <strong>Setup → AI helper</strong> and connect a free one
          (Gemini or Groq) — takes a minute.
        </div>
      )}

      {!busy && (
        <div className="grid2">
          <div className="card">
            <h3>🎚 How much should it do on its own?</h3>
            <label className="field">
              <span>Autonomy</span>
              <select value={autonomy} onChange={(e) => void changeAutonomy(e.target.value)}>
                <option value="full">Full (recommended) — signs in with my saved sign-ins and keeps going; only verification codes come to me</option>
                <option value="signin">Sign in for me — but pause on payment/delete pages so I can say yes</option>
                <option value="careful">Careful — hand every sign-in and risky page to me</option>
              </select>
            </label>
            <p className="hint" style={{ margin: 0 }}>
              Dial it back any time. Always on, whatever you pick: every step is shown below, there is a Stop button, the window is
              visible, and the AI never sees a password — it types a placeholder that InboxScout swaps in at the keyboard.
            </p>
          </div>
          <div className="card">
            <h3>🔑 Saved sign-ins</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Your normal website passwords, stored encrypted on this computer, so the assistant can log in as you.
              {autonomy === 'careful' && ' (Not used while autonomy is Careful.)'}
            </p>
            {signins.length > 0 && (
              <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                {signins.map((s) => (
                  <li key={s} style={{ marginBottom: 4 }}>
                    {s}{' '}
                    <button className="ghost tiny" onClick={() => void removeSignin(s)}>
                      Forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ flex: 1, minWidth: 160 }} value={newSignin.email} onChange={(e) => setNewSignin({ ...newSignin, email: e.target.value })} placeholder="email address" />
              <input style={{ flex: 1, minWidth: 140 }} type="password" value={newSignin.password} onChange={(e) => setNewSignin({ ...newSignin, password: e.target.value })} placeholder="password" />
              <button className="ghost" onClick={() => void addSignin()} disabled={!newSignin.email.trim() || !newSignin.password}>
                Save
              </button>
            </div>
            {signinMsg && <p className="hint">{signinMsg}</p>}
          </div>
        </div>
      )}

      {!busy && (
        <>
          <div className="hub-grid" style={{ marginBottom: 14 }}>
            {recipes.map((r) => (
              <button key={r.id} className="hub-btn" style={selected === r.id ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}} onClick={() => setSelected(r.id)}>
                <span className="icon">{r.icon}</span>
                <strong>{r.name}</strong>
                <span className="sub">{r.description}</span>
              </button>
            ))}
            <button className="hub-btn" style={selected === '' ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 2px var(--blue-soft)' } : {}} onClick={() => setSelected('')}>
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
                  <input value={custom.startUrl} onChange={(e) => setCustom({ ...custom, startUrl: e.target.value })} placeholder="https://…" />
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
            <button
              className="big-btn"
              disabled={!aiReady || (recipe ? recipe.params.some((p: any) => !(params[p.key] ?? '').trim()) : !custom.goal.trim() || !/^https?:\/\//.test(custom.startUrl))}
              onClick={() => void start()}
            >
              ▶ Start
            </button>
          </div>
        </>
      )}

      {(busy || log.length > 0) && (
        <div className="card">
          <h3>
            {status === 'running' && '⏳ Working…'}
            {status === 'waiting_user' && '🙋 Your turn'}
            {status === 'waiting_answer' && '❓ Quick question'}
            {status === 'done' && '✅ Done'}
            {status === 'failed' && '⚠ Stopped'}
            {status === 'stopped' && '⏹ Stopped'}
          </h3>
          {banner && <div className={status === 'done' ? 'success' : status === 'failed' ? 'error' : 'hint'} style={{ fontSize: 15 }}>{banner}</div>}

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
              <p style={{ margin: '0 0 6px' }}>
                <strong>{question}</strong>
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendAnswer()} placeholder="Type your answer" />
                <button className="primary" onClick={() => void sendAnswer()} disabled={!answer.trim()}>
                  Answer
                </button>
              </div>
            </div>
          )}

          {Object.keys(captured).length > 0 && (
            <p className="hint">Captured so far: {Object.keys(captured).map((k) => `${k} ✓`).join(' · ')}</p>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, maxHeight: 260, overflowY: 'auto', fontSize: 13 }}>
            {log.map((l, i) => (
              <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
                {l}
              </div>
            ))}
            <div ref={logEnd} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {busy ? (
              <button className="ghost" onClick={() => void window.inboxScout.agentStop()}>
                ⏹ Stop
              </button>
            ) : (
              <button className="ghost" onClick={() => void window.inboxScout.agentCloseWindow()}>
                Close assistant window
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
