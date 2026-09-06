import { useEffect } from 'react'
import type { HelperNote } from '../../../shared/types'
import { t } from '../copy'
import { speak } from '../useLevel'

type Level = 'simple' | 'standard' | 'pro'

interface Props {
  notes: HelperNote[]
  level: Level
  /** The person pressed Done: hide the card (the notes stay in the inbox). */
  onDone: () => void
}

const when = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * Trusted helpers (v1.4, A2d): "Notes from your helpers" — replies helpers sent to InboxScout mail,
 * pulled from the person's own inbox. Read aloud at Simple; dismissed with Done.
 * Drop it into Today when brief.helperNotes has entries:
 *   <HelperNotesCard notes={brief.helperNotes} level={level} onDone={() => setNotesHidden(true)} />
 */
export default function HelperNotesCard({ notes, level, onDone }: Props): JSX.Element | null {
  useEffect(() => {
    if (level !== 'simple' || notes.length === 0) return
    speak(`${t('helpers.notes', level)}. ${notes.map((n) => `${n.from} wrote: ${n.text}`).join('. ')}`)
  }, [level, notes])

  if (notes.length === 0) return null
  const shown = level === 'simple' ? notes.slice(0, 2) : notes
  return (
    <div className="today-card attention full">
      <h3>
        💌 {t('helpers.notes', level)}
        {level !== 'simple' && <span className="count">({notes.length})</span>}
      </h3>
      <ul>
        {shown.map((n) => (
          <li key={n.messageId}>
            <strong>{n.from}</strong>
            {level !== 'simple' && <span className="hint"> · {when(n.receivedAt)}</span>}
            <div className="next" style={{ whiteSpace: 'pre-wrap' }}>
              {n.text}
            </div>
          </li>
        ))}
      </ul>
      {level !== 'pro' && <p className="hint">{t('helpers.notes.why', level)}</p>}
      <button className="ghost" onClick={onDone}>
        {t('helpers.done', level)} ✓
      </button>
    </div>
  )
}
