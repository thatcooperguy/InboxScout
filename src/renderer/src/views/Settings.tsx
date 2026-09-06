import { useEffect, useState } from 'react'
import ProfilePicker from './ProfilePicker'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Local API for Hermes and other agents on this computer. */
function BridgeCard({ settings, update }: { settings: any; update: (patch: any) => void }): JSX.Element {
  const [info, setInfo] = useState<any | null>(null)
  const [showToken, setShowToken] = useState(false)
  useEffect(() => {
    void window.inboxScout.bridgeInfo().then(setInfo)
  }, [])
  if (!info) return <div />
  const hermesConfig = `mcp_servers:\n  inboxscout:\n    url: ${info.mcpUrl}\n    headers:\n      Authorization: Bearer ${showToken ? info.token : '<token>'}`
  return (
    <div className="card">
      <h3>🤝 Agent bridge (Hermes &amp; friends)</h3>
      <p className="hint">
        Lets another AI agent on this computer — such as Hermes — use InboxScout as a tool: read your brief, search mail,
        check email now, connect accounts, and drive the Assistant. Local only (127.0.0.1), token-protected, off by default.
      </p>
      <label className="field">
        <span>Agent bridge</span>
        <select
          value={info.enabled ? 'on' : 'off'}
          onChange={(e) => void window.inboxScout.bridgeSetEnabled(e.target.value === 'on').then(setInfo)}
        >
          <option value="off">Off</option>
          <option value="on">On — other agents on this PC may call InboxScout</option>
        </select>
      </label>
      {info.enabled && (
        <>
          <label className="field">
            <span>What may they do?</span>
            <select value={info.access} onChange={(e) => void window.inboxScout.bridgeSetAccess(e.target.value).then(setInfo)}>
              <option value="read">Read only — brief, issues, mail search, status</option>
              <option value="full">Full — also check email now, connect accounts, save sign-ins, change preferences, run the Assistant</option>
            </select>
          </label>
          <div className="hint" style={{ fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.8 }}>
            REST: {info.url} {info.running ? '(running)' : '(starting…)'}
            <br />
            MCP: {info.mcpUrl}
            <br />
            Token: {showToken ? info.token : '••••••••••••••••••••••••'}{' '}
            <button className="ghost tiny" onClick={() => setShowToken(!showToken)}>
              {showToken ? 'Hide' : 'Show'}
            </button>{' '}
            <button className="ghost tiny" onClick={() => void window.inboxScout.bridgeRegenerate().then(setInfo)}>
              New token
            </button>
            <br />
            Spec: {info.url}/openapi.json · Events: {info.url}/events
          </div>
          <p className="hint" style={{ marginBottom: 4 }}>Hermes: paste this into ~/.hermes/config.yaml (or add it as an MCP server in any MCP client):</p>
          <pre style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontSize: 12, overflowX: 'auto', margin: '0 0 10px' }}>{hermesConfig}</pre>
        </>
      )}
      <label className="field" style={{ marginTop: 8 }}>
        <span>Also send each new brief to an agent webhook (e.g. Hermes) — URL, blank = off</span>
        <input value={settings.agentWebhookUrl} onChange={(e) => update({ agentWebhookUrl: e.target.value })} placeholder="https://… or http://127.0.0.1:…" />
      </label>
      {settings.agentWebhookUrl && (
        <label className="field">
          <span>Webhook bearer token (optional)</span>
          <input type="password" value={settings.agentWebhookToken} onChange={(e) => update({ agentWebhookToken: e.target.value })} />
        </label>
      )}
    </div>
  )
}

interface Props {
  onSaved?: () => void
}

export default function SettingsView({ onSaved }: Props): JSX.Element {
  const [settings, setSettings] = useState<any | null>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [saved, setSaved] = useState(false)
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([])
  const [testMsg, setTestMsg] = useState('')

  const [profileSuggestion, setProfileSuggestion] = useState<any | null>(null)

  useEffect(() => {
    void window.inboxScout.getSettings().then(setSettings)
    void window.inboxScout.listProfiles().then(setProfiles)
    void window.inboxScout.deliveryCarriers().then(setCarriers)
    void window.inboxScout.profileStatus().then((s) => setProfileSuggestion(s.suggestion))
  }, [])

  const chooseProfile = async (id: string | 'auto'): Promise<void> => {
    const next = await window.inboxScout.chooseProfile(id)
    setSettings({ ...settings, profileId: next.profileId, profileAuto: next.profileAuto, enabledSkillIds: next.enabledSkillIds })
    setProfileSuggestion(null)
    onSaved?.()
  }

  const dismissSuggestion = async (): Promise<void> => {
    await window.inboxScout.dismissProfileSuggestion()
    setProfileSuggestion(null)
  }

  const testDelivery = async (kind: 'email' | 'sms'): Promise<void> => {
    await window.inboxScout.setSettings(settings)
    const r = await window.inboxScout.deliveryTest(kind)
    setTestMsg(r.ok ? (kind === 'email' ? 'Test email sent ✓' : 'Test text sent ✓') : r.error ?? 'Failed')
  }

  if (!settings) return <div className="empty">Loading…</div>

  const update = (patch: any): void => {
    setSettings({ ...settings, ...patch })
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    setSettings(await window.inboxScout.setSettings(settings))
    setSaved(true)
    onSaved?.()
  }

  return (
    <div>
      <h1>Preferences</h1>
      <p className="sub">Everything here has a sensible default — change only what you want.</p>
      {saved && <div className="success">Saved ✓</div>}
      <div className="grid2">
        <div className="card">
          <h3>Comfort</h3>
          <label className="field">
            <span>Text size</span>
            <select value={settings.textSize} onChange={(e) => update({ textSize: e.target.value })}>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="xlarge">Extra large</option>
            </select>
          </label>
          <label className="field">
            <span>🔊 Speak a short summary out loud when a scheduled brief is ready</span>
            <select value={settings.speakBriefs ? 'yes' : 'no'} onChange={(e) => update({ speakBriefs: e.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes — use the computer's voice</option>
            </select>
          </label>
          <label className="field">
            <span>Quiet insights — your circle, this week's schedule across inboxes, promises you made, and a per-inbox view</span>
            <select value={settings.insightsEnabled ? 'yes' : 'no'} onChange={(e) => update({ insightsEnabled: e.target.value === 'yes' })}>
              <option value="yes">On — they only appear when there's something to say (recommended)</option>
              <option value="no">Off</option>
            </select>
          </label>
          <label className="field">
            <span>Show advanced tools (Details and Inbox review tabs)</span>
            <select
              value={settings.simpleMode ? 'no' : 'yes'}
              onChange={(e) => update({ simpleMode: e.target.value !== 'yes' })}
            >
              <option value="no">No — keep it simple (recommended)</option>
              <option value="yes">Yes — I like to see everything</option>
            </select>
          </label>
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3>Who is this inbox for?</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            This tunes what counts as work mail, what is urgent, and what your brief tracks — {profiles.length} kinds of people and
            counting. Current: <strong>{profiles.find((p) => p.id === settings.profileId)?.name ?? settings.profileId}</strong>
            {settings.profileAuto ? ' (chosen automatically)' : ' (locked by you)'}.
          </p>
          {profileSuggestion && (
            <div className="success" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>
                Your mail looks like <strong>{profileSuggestion.name}</strong>. {profileSuggestion.why}
              </span>
              <button className="primary" onClick={() => void chooseProfile(profileSuggestion.id)}>
                Switch
              </button>
              <button className="ghost" onClick={() => void dismissSuggestion()}>
                No thanks
              </button>
            </div>
          )}
          <ProfilePicker value={settings.profileId} auto={settings.profileAuto} onChoose={(id) => void chooseProfile(id)} />
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
          <h3>📨 Send me my brief</h3>
          <p className="hint">
            InboxScout only ever sends to <strong>you</strong>, using one of your own Gmail/Yahoo/iCloud accounts as the outbox.
          </p>
          <label className="field">
            <span>Email each brief to</span>
            <input value={settings.deliverEmailTo} onChange={(e) => update({ deliverEmailTo: e.target.value })} placeholder="you@example.com (blank = off)" />
          </label>
          <label className="field">
            <span>Text me the headline — phone number</span>
            <input value={settings.smsPhone} onChange={(e) => update({ smsPhone: e.target.value })} placeholder="(555) 123-4567 (blank = off)" />
          </label>
          <label className="field">
            <span>Carrier (texts go through your carrier's free email gateway)</span>
            <select value={settings.smsCarrier} onChange={(e) => update({ smsCarrier: e.target.value })}>
              <option value="">— choose —</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="ghost" onClick={() => void testDelivery('email')} disabled={!settings.deliverEmailTo}>
              Send test email
            </button>
            <button className="ghost" onClick={() => void testDelivery('sms')} disabled={!settings.smsPhone || !settings.smsCarrier}>
              Send test text
            </button>
            {testMsg && <span className="hint">{testMsg}</span>}
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Also save briefs to Google Drive (as Google Docs) and keep a Google Sheet tracker</span>
            <select
              value={settings.googleDriveExport ? 'yes' : 'no'}
              onChange={(e) => update({ googleDriveExport: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes — needs "Sign in with Google" (re-sign-in to allow Drive)</option>
            </select>
          </label>
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
            <span>Start InboxScout when the computer starts</span>
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
        <BridgeCard settings={settings} update={update} />
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
            <span>Microsoft app ID (for Outlook.com / Hotmail sign-in — see docs/OUTLOOK.md)</span>
            <input
              value={settings.microsoftClientId}
              onChange={(e) => update({ microsoftClientId: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
          <label className="field">
            <span>Google OAuth client ID (for "Sign in with Google" — see docs/GOOGLE.md)</span>
            <input
              value={settings.googleClientId}
              onChange={(e) => update({ googleClientId: e.target.value })}
              placeholder="xxxx.apps.googleusercontent.com"
            />
          </label>
          <label className="field">
            <span>Google OAuth client secret</span>
            <input
              type="password"
              value={settings.googleClientSecret}
              onChange={(e) => update({ googleClientSecret: e.target.value })}
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
