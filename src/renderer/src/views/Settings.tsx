import { useEffect, useMemo, useState } from 'react'
import ProfilePicker from './ProfilePicker'
import { SETTING_GROUPS, defaultOf, getSetting, isDefault, searchSettings, setSetting, visibleAt, type SettingDesc } from '../../../shared/settingsRegistry'
import { LEVEL_LABEL } from '../../../shared/adapt'

type Level = 'simple' | 'standard' | 'pro'

/** Connection details for Hermes and friends; the on/off and access switches live in the registry. */
function BridgeDetails(): JSX.Element {
  const [info, setInfo] = useState<any | null>(null)
  const [showToken, setShowToken] = useState(false)
  useEffect(() => {
    void window.inboxScout.bridgeInfo().then(setInfo)
  }, [])
  if (!info || !info.enabled) return <></>
  const hermesConfig = `mcp_servers:\n  inboxscout:\n    url: ${info.mcpUrl}\n    headers:\n      Authorization: Bearer ${showToken ? info.token : '<token>'}`
  return (
    <div className="setting-row">
      <div className="setting-main">
        <strong>Bridge connection details</strong>
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
        </div>
        <p className="hint" style={{ marginBottom: 4 }}>Hermes: paste this into ~/.hermes/config.yaml (or add it as an MCP server in any MCP client):</p>
        <pre style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontSize: 12, overflowX: 'auto', margin: 0 }}>{hermesConfig}</pre>
      </div>
    </div>
  )
}

interface Props {
  onSaved?: () => void
}

/**
 * Preferences, generated from the settings registry: every setting comes with
 * "what it does" and "why it's set this way", can be searched, and can be put
 * back to automatic. Simple layouts see fewer rows; "Show everything" reveals all.
 */
export default function SettingsView({ onSaved }: Props): JSX.Element {
  const [settings, setSettings] = useState<any | null>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [saved, setSaved] = useState(false)
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([])
  const [testMsg, setTestMsg] = useState('')
  const [profileSuggestion, setProfileSuggestion] = useState<any | null>(null)
  const [ui, setUi] = useState<any | null>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [openHelp, setOpenHelp] = useState<string | null>(null)

  useEffect(() => {
    void window.inboxScout.getSettings().then(setSettings)
    void window.inboxScout.listProfiles().then(setProfiles)
    void window.inboxScout.deliveryCarriers().then(setCarriers)
    void window.inboxScout.profileStatus().then((s) => setProfileSuggestion(s.suggestion))
    void window.inboxScout.uiLevel().then(setUi)
  }, [])

  const level: Level = ui?.level ?? 'standard'
  const effectiveLevel: Level = showAll ? 'pro' : level

  const visible = useMemo(() => {
    if (!settings) return [] as SettingDesc[]
    return searchSettings(query).filter((d) => (query ? true : visibleAt(d, effectiveLevel)) && (!d.showWhen || d.showWhen(settings)))
  }, [settings, query, effectiveLevel])

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

  const change = (key: string, value: unknown): void => {
    setSettings(setSetting(settings, key, value))
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    const next = await window.inboxScout.setSettings(settings)
    setSettings(next)
    if (next.uiLevel !== ui?.setting) setUi(await window.inboxScout.uiSetLevel(next.uiLevel))
    setSaved(true)
    onSaved?.()
  }

  const control = (d: SettingDesc): JSX.Element => {
    const raw = getSetting(settings, d.key)
    switch (d.kind) {
      case 'toggle':
        return (
          <select value={String(!!raw)} onChange={(e) => change(d.key, e.target.value === 'true')}>
            {(d.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      case 'select': {
        const options = d.key === 'smsCarrier' ? [{ value: '', label: '— choose —' }, ...carriers.map((c) => ({ value: c.id, label: c.name }))] : d.options ?? []
        return (
          <select value={String(raw ?? '')} onChange={(e) => change(d.key, d.key === 'schedule.weekday' ? Number(e.target.value) : e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      }
      case 'number':
        return <input type="number" value={String(raw ?? '')} onChange={(e) => change(d.key, Number(e.target.value))} />
      case 'time':
        return <input type="time" value={String(raw ?? '')} onChange={(e) => change(d.key, e.target.value)} />
      case 'password':
        return <input type="password" value={String(raw ?? '')} onChange={(e) => change(d.key, e.target.value)} />
      default:
        return <input value={String(raw ?? '')} placeholder={d.placeholder} onChange={(e) => change(d.key, e.target.value)} />
    }
  }

  const row = (d: SettingDesc): JSX.Element => {
    const atDefault = isDefault(settings, d.key)
    const managed = d.managed && (d.key === 'uiLevel' ? settings.uiLevel === 'auto' : !!getSetting(settings, d.key))
    return (
      <div className="setting-row" key={d.key}>
        <div className="setting-main">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong>{d.label}</strong>
            {managed ? <span className="badge">chosen for you</span> : atDefault ? <span className="badge muted">default</span> : <span className="badge you">you set this</span>}
            <button className="ghost tiny" onClick={() => setOpenHelp(openHelp === d.key ? null : d.key)} aria-expanded={openHelp === d.key}>
              {openHelp === d.key ? 'Hide' : 'Why?'}
            </button>
          </div>
          <div className="hint">{d.what}</div>
          {openHelp === d.key && (
            <div className="hint" style={{ marginTop: 4 }}>
              <strong>Why this default:</strong> {d.why}
              {d.who && (
                <>
                  {' '}
                  <strong>Who changes it:</strong> {d.who}
                </>
              )}
              {d.key === 'uiLevel' && ui && (
                <div style={{ marginTop: 4 }}>
                  <strong>Right now:</strong> {LEVEL_LABEL[ui.level as Level]}
                  {ui.setting === 'auto' ? ` — because of ${ui.reasons.join(', ')}.` : ` — because you chose it (InboxScout would pick ${LEVEL_LABEL[ui.suggested as Level]}).`}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="setting-control">
          {control(d)}
          {!atDefault && (
            <button className="ghost tiny" onClick={() => change(d.key, defaultOf(d.key))} title={`Back to: ${String(defaultOf(d.key))}`}>
              ↺ Back to automatic
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>Preferences</h1>
      <p className="sub">
        Everything here already has a sensible choice. Change only what you want — each one says what it does and why.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings: voice, text size, Hermes, schedule…" style={{ flex: 1, minWidth: 220 }} />
        {level !== 'pro' && !query && (
          <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ width: 'auto' }} /> Show everything
          </label>
        )}
      </div>
      {saved && <div className="success">Saved ✓</div>}

      {!query && (
        <div className="card">
          <h3>Who is this inbox for?</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            This tunes what counts as work mail, what is urgent, and what your brief tracks — {profiles.length} kinds of people.
            Current: <strong>{profiles.find((p) => p.id === settings.profileId)?.name ?? settings.profileId}</strong>
            {settings.profileAuto ? ' (chosen for you)' : ' (you set this)'}.
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
      )}

      {SETTING_GROUPS.map((g) => {
        const items = visible.filter((d) => d.group === g.id)
        if (items.length === 0) return null
        return (
          <div className="card" key={g.id}>
            <h3>{g.name}</h3>
            <p className="hint" style={{ marginTop: 0 }}>{g.blurb}</p>
            {items.map(row)}
            {g.id === 'get' && (settings.deliverEmailTo || settings.smsPhone) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                {settings.deliverEmailTo && (
                  <button className="ghost" onClick={() => void testDelivery('email')}>
                    Send test email
                  </button>
                )}
                {settings.smsPhone && settings.smsCarrier && (
                  <button className="ghost" onClick={() => void testDelivery('sms')}>
                    Send test text
                  </button>
                )}
                {testMsg && <span className="hint">{testMsg}</span>}
              </div>
            )}
            {g.id === 'helpers' && settings.bridgeEnabled && <BridgeDetails />}
          </div>
        )
      })}
      {visible.length === 0 && query && <div className="empty">Nothing matches “{query}”. Try another word, like “voice” or “schedule”.</div>}

      <button className="primary" onClick={() => void save()}>
        Save settings
      </button>
    </div>
  )
}
