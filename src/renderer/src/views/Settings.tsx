import { useEffect, useMemo, useState } from 'react'
import ProfilePicker from './ProfilePicker'
import { SETTING_GROUPS, defaultOf, getSetting, isDefault, searchSettings, setSetting, visibleAt, type SettingDesc } from '../../../shared/settingsRegistry'
import { LEVEL_LABEL } from '../../../shared/adapt'
import { EULA_VERSION } from '../../../shared/eula'
import Eula from './Eula'

type Level = 'simple' | 'standard' | 'pro'

type ConsentKind = 'screenshot' | 'input' | 'open' | 'run' | 'files'
type ConsentValue = 'always' | 'never' | 'ask'

/** Plain names for each kind of thing the computer-control popup can remember. */
const CONSENT_KINDS: { kind: ConsentKind; label: string }[] = [
  { kind: 'screenshot', label: 'Look at my screen' },
  { kind: 'input', label: 'Use my keyboard and mouse' },
  { kind: 'open', label: 'Open apps and files' },
  { kind: 'run', label: 'Run commands' },
  { kind: 'files', label: 'Read and change my files' }
]

/** "What you've already allowed": the remembered popup answers, editable, with a reset. */
function SystemConsents({ dangerousOverride }: { dangerousOverride: boolean }): JSX.Element {
  const [consents, setConsents] = useState<Partial<Record<string, 'always' | 'never'>> | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    void window.inboxScout.systemStatus().then((s) => setConsents(s.consents))
  }, [])
  if (!consents) return <></>
  const set = async (kind: ConsentKind, value: ConsentValue): Promise<void> => {
    await window.inboxScout.systemSetConsent(kind, value === 'ask' ? null : value)
    const next = { ...consents }
    if (value === 'ask') delete next[kind]
    else next[kind] = value
    setConsents(next)
    setNote('Saved ✓')
    window.setTimeout(() => setNote(''), 2500)
  }
  const reset = async (): Promise<void> => {
    await window.inboxScout.systemReset()
    setConsents({})
    setConfirmReset(false)
    setNote('Forgotten — InboxScout will ask again for everything.')
    window.setTimeout(() => setNote(''), 4000)
  }
  return (
    <div className="setting-row">
      <div className="setting-main">
        <strong>What you've already allowed</strong>
        <div className="hint">
          The answers you gave the popups. "Always" means no popup for that kind of thing (dangerous commands still ask). "Never"
          means it is refused quietly. "Ask each time" brings the popup back.
        </div>
        {dangerousOverride && (
          <div className="hint" style={{ color: 'var(--red, #c0392f)' }}>
            ⚠ Full autonomy is on: with "Run commands" on Always, even dangerous commands run without asking.
          </div>
        )}
        {note && (
          <div className="hint" role="status" aria-live="polite" style={{ color: 'var(--good)' }}>
            {note}
          </div>
        )}
      </div>
      <div className="setting-control" style={{ display: 'grid', gap: 8 }}>
        {CONSENT_KINDS.map((c) => (
          <label key={c.kind} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span>{c.label}</span>
            <select value={consents[c.kind] ?? 'ask'} onChange={(e) => void set(c.kind, e.target.value as ConsentValue)} aria-label={`${c.label}: remembered answer`}>
              <option value="always">Always</option>
              <option value="never">Never</option>
              <option value="ask">Ask each time</option>
            </select>
          </label>
        ))}
        {confirmReset ? (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="hint">Forget all of these answers?</span>
            <button className="primary" onClick={() => void reset()}>
              Yes, ask me again
            </button>
            <button className="ghost" onClick={() => setConfirmReset(false)}>
              Keep them
            </button>
          </span>
        ) : (
          <button className="ghost" onClick={() => setConfirmReset(true)} disabled={Object.keys(consents).length === 0}>
            Ask me again for everything
          </button>
        )}
      </div>
    </div>
  )
}

/** "Terms accepted: <version>" with a way to read them again. */
function TermsRow({ accepted, onReadAgain }: { accepted: string | null; onReadAgain: () => void }): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-main">
        <strong>Terms accepted: {accepted ?? 'not yet'}</strong>
        <div className="hint">
          The plain-language terms you agreed to when InboxScout first opened{accepted && accepted !== EULA_VERSION ? ` (the current version is ${EULA_VERSION})` : ''}.
        </div>
      </div>
      <div className="setting-control">
        <button className="ghost" onClick={onReadAgain}>
          Read the terms again
        </button>
      </div>
    </div>
  )
}

/** Connection details for Hermes and friends; the on/off and access switches live in the registry. */
function BridgeDetails(): JSX.Element {
  const [info, setInfo] = useState<any | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
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
          {confirmNew ? (
            <>
              <span className="hint">Every connected tool will need the new key.</span>{' '}
              <button className="primary" onClick={() => void window.inboxScout.bridgeRegenerate().then((i) => { setInfo(i); setConfirmNew(false) })}>
                Yes, make a new key
              </button>{' '}
              <button className="ghost" onClick={() => setConfirmNew(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button className="ghost tiny" onClick={() => setConfirmNew(true)}>
              New key…
            </button>
          )}
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
  const [readingTerms, setReadingTerms] = useState(false)

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
  if (readingTerms) {
    return (
      <div>
        <button className="ghost" style={{ marginBottom: 8 }} onClick={() => setReadingTerms(false)}>
          ← Back to Settings
        </button>
        <Eula
          onAccepted={() => {
            setReadingTerms(false)
            void window.inboxScout.getSettings().then(setSettings)
            onSaved?.()
          }}
        />
      </div>
    )
  }

  // Apply on change (no Save button to forget): each change is stored at once and confirmed quietly.
  const change = (key: string, value: unknown): void => {
    const next = setSetting(settings, key, value)
    setSettings(next)
    setSaved(false)
    void (async () => {
      const stored = await window.inboxScout.setSettings(next)
      if (key === 'uiLevel') setUi(await window.inboxScout.uiSetLevel(stored.uiLevel))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    })()
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
      case 'folder':
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="hint" style={{ flex: 1, wordBreak: 'break-all' }}>{String(raw || 'Documents → InboxScout → Reports')}</span>
            <button className="ghost" onClick={() => void window.inboxScout.chooseDir(String(raw ?? '')).then((dir) => dir && change(d.key, dir))}>
              Choose folder…
            </button>
          </div>
        )
      case 'time':
        return <input type="time" value={String(raw ?? '')} onChange={(e) => change(d.key, e.target.value)} />
      case 'password':
        return <input type="password" value={String(raw ?? '')} onChange={(e) => change(d.key, e.target.value)} />
      default:
        return <input value={String(raw ?? '')} placeholder={d.placeholder} onChange={(e) => change(d.key, e.target.value)} />
    }
  }

  const riskyNow = (d: SettingDesc): boolean => {
    const v = getSetting(settings, d.key)
    if (d.key === 'storeFullBodies') return v === false
    if (d.key === 'assistantAutonomy' || d.key === 'bridgeAccess') return v === 'full'
    if (d.key === 'systemControl') return v === 'on'
    if (d.key === 'systemDangerousOverride') return v === true
    return true
  }
  const scheduleSummary = (): string => {
    const s = settings.schedule
    const time = new Date(2000, 0, 1, s.hour, s.minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    if (s.frequency === 'manual') return 'InboxScout will only check when you press Check my email.'
    if (s.frequency === 'weekly') return `InboxScout will check every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][s.weekday]} at ${time}.`
    return `InboxScout will check every day at ${time}.`
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
          {d.caution && riskyNow(d) && (
            <div className="hint" style={{ color: 'var(--red, #c0392f)' }}>
              ⚠ {d.caution}
            </div>
          )}
          {d.key === 'schedule.frequency' && <div className="hint">{scheduleSummary()}</div>}
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
      <h1>Settings</h1>
      <p className="sub">
        Everything here already has a sensible choice. Change only what you want — each one says what it does and why, and
        every change is saved right away.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings: voice, text size, Hermes, schedule…" style={{ flex: 1, minWidth: 220 }} />
        {level !== 'pro' && !query && (
          <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ width: 'auto' }} /> Show everything
          </label>
        )}
      </div>
      {saved && (
        <div className="success" role="status">
          Saved ✓
        </div>
      )}

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
            {g.id === 'helpers' && settings.systemControl === 'on' && <SystemConsents dangerousOverride={!!settings.systemDangerousOverride} />}
            {g.id === 'helpers' && <TermsRow accepted={settings.eulaAcceptedVersion ?? null} onReadAgain={() => setReadingTerms(true)} />}
            {g.id === 'helpers' && settings.bridgeEnabled && <BridgeDetails />}
          </div>
        )
      })}
      {visible.length === 0 && query && <div className="empty">Nothing matches “{query}”. Try another word, like “voice” or “schedule”.</div>}
      <p className="hint">Changes are saved as you make them.</p>
    </div>
  )
}
