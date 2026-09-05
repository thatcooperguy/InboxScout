import { useEffect, useState } from 'react'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function SettingsView(): JSX.Element {
  const [settings, setSettings] = useState<any | null>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.inboxIntel.getSettings().then(setSettings)
    void window.inboxIntel.listProfiles().then(setProfiles)
  }, [])

  if (!settings) return <div className="empty">Loading…</div>

  const update = (patch: any): void => {
    setSettings({ ...settings, ...patch })
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    setSettings(await window.inboxIntel.setSettings(settings))
    setSaved(true)
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="sub">Everything here has a sensible default — change only what you want.</p>
      {saved && <div className="success">Saved ✓</div>}
      <div className="grid2">
        <div className="card">
          <h3>What kind of work do you do?</h3>
          <label className="field">
            <span>Work profile</span>
            <select value={settings.profileId} onChange={(e) => update({ profileId: e.target.value })}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.pulseName}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">This tunes what counts as work mail and what your brief tracks.</p>
        </div>
        <div className="card">
          <h3>Schedule</h3>
          <label className="field">
            <span>Run automatically</span>
            <select
              value={settings.schedule.frequency}
              onChange={(e) => update({ schedule: { ...settings.schedule, frequency: e.target.value } })}
            >
              <option value="daily">Every day</option>
              <option value="weekly">Once a week</option>
              <option value="manual">Only when I press Run now</option>
            </select>
          </label>
          {settings.schedule.frequency === 'weekly' && (
            <label className="field">
              <span>Day</span>
              <select
                value={settings.schedule.weekday}
                onChange={(e) => update({ schedule: { ...settings.schedule, weekday: Number(e.target.value) } })}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          {settings.schedule.frequency !== 'manual' && (
            <label className="field">
              <span>Time</span>
              <input
                type="time"
                value={`${String(settings.schedule.hour).padStart(2, '0')}:${String(settings.schedule.minute).padStart(2, '0')}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  update({ schedule: { ...settings.schedule, hour: h, minute: m } })
                }}
              />
            </label>
          )}
        </div>
        <div className="card">
          <h3>Storage & privacy</h3>
          <label className="field">
            <span>Keep full email text on this computer</span>
            <select
              value={settings.storeFullBodies ? 'yes' : 'no'}
              onChange={(e) => update({ storeFullBodies: e.target.value === 'yes' })}
            >
              <option value="yes">Yes — enables search and re-analysis (recommended)</option>
              <option value="no">No — keep short previews only</option>
            </select>
          </label>
          <label className="field">
            <span>Reports folder</span>
            <input value={settings.reportsDir} onChange={(e) => update({ reportsDir: e.target.value })} />
          </label>
          <label className="field">
            <span>Start Inbox Intel when the computer starts</span>
            <select
              value={settings.launchAtLogin ? 'yes' : 'no'}
              onChange={(e) => update({ launchAtLogin: e.target.value === 'yes' })}
            >
              <option value="yes">Yes — so scheduled briefs always run (recommended)</option>
              <option value="no">No — I'll open it myself</option>
            </select>
          </label>
          <p className="hint">
            Sensitive personal or company-confidential content is flagged in your brief as a heads-up. Nothing is ever
            hidden or redacted.
          </p>
        </div>
        <div className="card">
          <h3>Advanced</h3>
          <label className="field">
            <span>AI model override (blank = recommended default)</span>
            <input
              value={settings.ai.model}
              onChange={(e) => update({ ai: { ...settings.ai, model: e.target.value } })}
              placeholder="e.g. gemini-2.5-flash"
            />
          </label>
          <label className="field">
            <span>Ollama URL (local AI)</span>
            <input
              value={settings.ai.ollamaBaseUrl}
              onChange={(e) => update({ ai: { ...settings.ai, ollamaBaseUrl: e.target.value } })}
            />
          </label>
        </div>
      </div>
      <button className="primary" onClick={() => void save()}>
        Save settings
      </button>
    </div>
  )
}
