import { useEffect, useState } from 'react'
import type { Helper } from '../../../shared/types'
import { fill, t } from '../copy'
import { speak } from '../useLevel'

type Level = 'simple' | 'standard' | 'pro'

interface Props {
  level: Level
  /** Take the person to Setup → Trusted helpers. */
  onChange?: () => void
}

/**
 * Trusted helpers (v1.4, A1): the seven-day Today line — "Sarah now gets a copy of what needs you.
 * Change this." — after a helper was added from anywhere but the person's own screen, or
 * "Sarah set this up for you…" when someone else ran setup. Renders nothing otherwise.
 * Drop it into Today under the hero: <HelperNotice level={level} onChange={() => onGoTo?.('setup')} />
 */
export default function HelperNotice({ level, onChange }: Props): JSX.Element | null {
  const [info, setInfo] = useState<{ helpers: Helper[]; setupBy: 'me' | 'someone_else' | null; until: string | null } | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let alive = true
    void window.inboxScout
      .helpersList()
      .then((r) => alive && setInfo({ helpers: r.helpers, setupBy: r.setupBy, until: r.helperNoticeUntil }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const active = !!info?.until && new Date(info.until).getTime() > Date.now() && !hidden
  const who =
    info?.helpers.filter((h) => h.addedBy !== 'person').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    info?.helpers.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const text = who ? fill(t(info?.setupBy === 'someone_else' && who.addedBy === 'helper_setup' ? 'helpers.setupBy' : 'helpers.notice', level), { name: who.name }) : ''

  // Speak once when it first shows (Simple only).
  useEffect(() => {
    if (active && text && level === 'simple') speak(text)
  }, [active, level, text])

  if (!active || !who) return null
  const dismiss = async (): Promise<void> => {
    setHidden(true)
    await window.inboxScout.helpersDismissNotice().catch(() => undefined)
  }
  return (
    <div className="success" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: level === 'simple' ? 16 : 14 }}>
      <span style={{ flex: 1 }}>🙋 {text}</span>
      {onChange && (
        <button className="ghost tiny" onClick={onChange}>
          {level === 'pro' ? 'Helpers' : 'Change'}
        </button>
      )}
      <button className="ghost tiny" aria-label="Hide this notice" title="Hide this notice" onClick={() => void dismiss()}>
        ✕
      </button>
    </div>
  )
}
