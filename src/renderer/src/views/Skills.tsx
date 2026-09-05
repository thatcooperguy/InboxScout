import { useEffect, useState } from 'react'

export default function Skills(): JSX.Element {
  const [skills, setSkills] = useState<any[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [settings, setSettings] = useState<any | null>(null)
  const [saved, setSaved] = useState(false)

  const load = (): void => {
    void window.inboxScout.skillsList().then((r) => {
      setSkills(r.skills)
      setErrors(r.errors)
    })
    void window.inboxScout.getSettings().then(setSettings)
  }
  useEffect(load, [])

  const toggle = async (id: string, on: boolean): Promise<void> => {
    const next = skills.map((s) => (s.id === id ? { ...s, enabled: on } : s))
    setSkills(next)
    await window.inboxScout.skillsSetEnabled(next.filter((s) => s.enabled).map((s) => s.id))
  }

  const savePeople = async (): Promise<void> => {
    await window.inboxScout.setSettings(settings)
    setSaved(true)
  }

  const listToText = (list: string[]): string => (list ?? []).join('\n')
  const textToList = (text: string): string[] =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)

  return (
    <div>
      <h1>What should InboxScout watch for?</h1>
      <p className="sub">Tick what matters in your life and work. Each one adds a section to your brief.</p>
      <div className="card">
        {skills.map((s) => (
          <label key={s.id} className="skill-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={s.enabled} onChange={(e) => void toggle(s.id, e.target.checked)} />
            <span className="icon">{s.icon}</span>
            <span>
              <strong>
                {s.name}
                {s.custom && <span className="pill work" style={{ marginLeft: 8 }}>custom</span>}
                {s.hasAgent && <span className="pill personal" style={{ marginLeft: 6 }}>sends to your agent</span>}
              </strong>
              <span className="desc">{s.description}</span>
            </span>
          </label>
        ))}
      </div>

      {settings && (
        <div className="grid2">
          <div className="card">
            <h3>⭐ Important people</h3>
            <p className="hint">Anything from these people is always treated as important. One name or email per line.</p>
            <textarea
              value={listToText(settings.vipSenders)}
              onChange={(e) => {
                setSettings({ ...settings, vipSenders: textToList(e.target.value) })
                setSaved(false)
              }}
              placeholder={'Mom\nboss@company.com\nDr. Patel'}
            />
          </div>
          <div className="card">
            <h3>🔇 Never bother me about</h3>
            <p className="hint">Mail from these senders is filed as noise and kept out of your brief.</p>
            <textarea
              value={listToText(settings.mutedSenders)}
              onChange={(e) => {
                setSettings({ ...settings, mutedSenders: textToList(e.target.value) })
                setSaved(false)
              }}
              placeholder={'deals@store.com\nnewsletter'}
            />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="primary" onClick={() => void savePeople()}>
          Save people lists
        </button>
        {saved && <span className="success" style={{ margin: 0 }}>Saved ✓</span>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>🧩 Custom watchers (for businesses and power users)</h3>
        <p className="hint">
          Drop a JSON file into the skills folder to teach InboxScout about your own kind of mail — and optionally send
          matches to your company's own AI agent by webhook. See docs/SKILLS.md in the project for the format.
        </p>
        {errors.length > 0 && (
          <div className="error">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}
        <button className="ghost" onClick={() => void window.inboxScout.skillsOpenFolder()}>
          Open skills folder
        </button>
      </div>
    </div>
  )
}
