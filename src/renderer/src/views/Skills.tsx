import { useEffect, useState } from 'react'
import { useLevel } from '../useLevel'

export default function Skills(): JSX.Element {
  const level = useLevel()
  const [skills, setSkills] = useState<any[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = (): void => {
    void window.inboxScout
      .skillsList()
      .then((r) => {
        setSkills(r.skills)
        setErrors(r.errors)
      })
      .finally(() => setLoaded(true))
  }
  useEffect(load, [])

  const toggle = async (id: string, on: boolean): Promise<void> => {
    const next = skills.map((s) => (s.id === id ? { ...s, enabled: on } : s))
    setSkills(next)
    await window.inboxScout.skillsSetEnabled(next.filter((s) => s.enabled).map((s) => s.id))
  }

  const onCount = skills.filter((s) => s.enabled).length

  return (
    <div>
      <h1>What to watch for</h1>
      <p className="sub">Tick what matters in your life and work. Each one adds a section to your brief — changes apply right away.</p>
      <div className="card">
        {!loaded && <div className="empty">Opening…</div>}
        {loaded && skills.length > 0 && (
          <p className="hint" style={{ margin: '0 0 6px' }} aria-live="polite">
            Watching for {onCount} of {skills.length}
          </p>
        )}
        {skills.map((s) => (
          <label key={s.id} className="skill-row" style={{ cursor: 'pointer', minHeight: 44, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => void toggle(s.id, e.target.checked)}
              style={{ width: 24, height: 24, margin: 0 }}
            />
            <span className="icon" aria-hidden="true">{s.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong>
                {s.name}
                {s.custom && (
                  <span className="pill work" style={{ marginLeft: 8 }} title="A watcher you added yourself">
                    yours
                  </span>
                )}
                {s.hasAgent && (
                  <span
                    className="pill personal"
                    style={{ marginLeft: 6 }}
                    title="Matches are also sent to the company AI set up in this watcher"
                  >
                    also sent to your company’s AI
                  </span>
                )}
              </strong>
              <span className="desc" style={{ display: 'block' }}>{s.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="card">
        <h3>⭐ Important people · 🔇 Never bother me about</h3>
        <p className="hint" style={{ margin: 0 }}>
          These two lists now live on the <strong>People</strong> tab, next to your circle — add or remove anyone there.
        </p>
      </div>

      {level !== 'simple' && (
        <details className="card" open={errors.length > 0}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15, minHeight: 40, display: 'flex', alignItems: 'center' }}>
            🧩 Your own watchers (advanced)
          </summary>
          <p className="hint">
            Drop a JSON file into the skills folder to teach InboxScout about your own kind of mail — and optionally send matches
            to your company’s own AI. See docs/SKILLS.md in the project for the format.
          </p>
          {errors.length > 0 && (
            <div className="error" role="status">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
          <button className="ghost" style={{ minHeight: 40 }} onClick={() => void window.inboxScout.skillsOpenFolder()}>
            Open skills folder
          </button>
        </details>
      )}
    </div>
  )
}
