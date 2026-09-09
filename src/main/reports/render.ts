import { marked } from 'marked'
import type { Brief } from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'

const SEVERITY_MARK: Record<string, string> = { urgent: 'URGENT', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }
const TREND_MARK: Record<string, string> = { up: '▲ progressing', steady: '▬ steady', down: '▼ at risk' }

export function renderMarkdown(
  brief: Brief,
  profile: WorkProfile,
  periodType: 'daily' | 'weekly',
  date: Date,
  syncErrors: string[] = []
): string {
  const title = periodType === 'daily' ? 'Daily Brief' : 'Weekly Brief'
  const dateStr = date.toDateString()
  const lines: string[] = []
  lines.push(`# ${title} — ${dateStr}`, '', `> ${brief.headline}`, '')

  if (syncErrors.length > 0) {
    lines.push('## ⚠ Account problems', '', '_These accounts could not be checked this run — their mail is not included:_', '')
    for (const e of syncErrors) lines.push(`- ${e}`)
    lines.push('')
  }

  if ((brief.scamWarnings ?? []).length > 0) {
    lines.push('## 🛑 Looks like a scam', '', '_Flagged by rules on this computer. Nothing was deleted or moved._', '')
    for (const w of brief.scamWarnings!) lines.push(`- **${w.subject}** — from ${w.from}. ${w.reasons.join(' ')} _${w.advice}_`)
    lines.push('')
  }

  lines.push('## ⚠ Top Emerging Issues', '')
  if (brief.topIssues.length === 0) lines.push('Nothing urgent right now.', '')
  brief.topIssues.forEach((issue, i) => {
    lines.push(`${i + 1}. **${issue.title}** (${SEVERITY_MARK[issue.severity] ?? issue.severity})`)
    lines.push(`   - Why now: ${issue.whyNow}`)
    lines.push(`   - Next step: ${issue.nextStep}`)
    if (issue.sources.length > 0) lines.push(`   - Sources: ${issue.sources.join('; ')}`)
  })
  lines.push('')

  lines.push(`## 📊 ${profile.pulseName}`, '')
  if (brief.pulse.length === 0) {
    lines.push(`No tracked ${profile.entityNoun}s yet.`, '')
  } else {
    lines.push('| ' + cap(profile.entityNoun) + ' | Status | Trend | What changed |', '|---|---|---|---|')
    for (const p of brief.pulse) {
      lines.push(`| ${esc(p.projectName)} | ${esc(p.status)} | ${TREND_MARK[p.trend] ?? p.trend} | ${esc(p.whatChanged)} |`)
    }
    lines.push('')
  }

  for (const section of brief.skillSections ?? []) {
    if (section.lines.length === 0) continue
    lines.push(`## ${section.icon} ${section.title}`, '')
    for (const l of section.lines) lines.push(`- ${l}`)
    lines.push('')
  }

  if (brief.waitingOnYou.length > 0 || brief.waitingOnThem.length > 0) {
    lines.push('## ✉ Reply tracker', '')
    if (brief.waitingOnYou.length > 0) {
      lines.push(`**You owe ${brief.waitingOnYou.length} repl${brief.waitingOnYou.length === 1 ? 'y' : 'ies'}:**`)
      for (const t of brief.waitingOnYou) lines.push(`- ${t}`)
    }
    if (brief.waitingOnThem.length > 0) {
      lines.push('', `**Waiting on others (${brief.waitingOnThem.length}):**`)
      for (const t of brief.waitingOnThem) lines.push(`- ${t}`)
    }
    lines.push('')
  }

  const schedule = brief.schedule
  if (schedule && (schedule.days.some((d) => d.events.length) || schedule.overdue.length || schedule.recurring.length)) {
    lines.push('## 🗓 This week', '')
    for (const day of schedule.days) {
      if (day.events.length === 0) continue
      lines.push(`**${day.label}**`)
      for (const e of day.events) {
        lines.push(`- ${e.conflict ? '‼ ' : ''}${e.time ? `${e.time} · ` : ''}${e.title}${e.person ? ` (${e.person})` : ''}${e.sourceLabel && e.sourceLabel !== 'Deadline' ? ` · ${e.sourceLabel}` : ''}`)
      }
      lines.push('')
    }
    if (schedule.conflicts.length) {
      lines.push('_Overlaps:_')
      for (const c of schedule.conflicts) lines.push(`- ‼ ${c}`)
      lines.push('')
    }
    if (schedule.overdue.length) {
      for (const o of schedule.overdue) lines.push(`- ${o}`)
      lines.push('')
    }
    if (schedule.recurring.length) {
      lines.push('_Regulars:_ ' + schedule.recurring.join(' · '), '')
    }
  } else if (brief.deadlines.length > 0) {
    lines.push('## 📅 Dates & deadlines', '')
    for (const d of brief.deadlines) lines.push(`- ${d}`)
    lines.push('')
  }

  if ((brief.promises ?? []).length > 0) {
    lines.push('## 🤝 Promises you made', '')
    for (const p of brief.promises!) {
      lines.push(`- ${p.overdue ? '‼ ' : ''}To ${p.to}: "${p.text}"${p.due ? ` — by ${new Date(p.due).toDateString()}` : ''} _(${p.subject})_`)
    }
    lines.push('')
  }

  const people = brief.people
  if (people && (people.goingQuiet.length || people.newFaces.length || (periodType === 'weekly' && people.inner.length))) {
    lines.push('## 👥 Your circle', '')
    for (const g of people.goingQuiet) lines.push(`- ${g}`)
    for (const n of people.newFaces) lines.push(`- ${n}`)
    if (periodType === 'weekly' && people.inner.length) {
      lines.push('', '_People who matter most right now:_')
      for (const p of people.inner) lines.push(`- **${p.name}** — ${p.note}`)
    }
    lines.push('')
  }

  if ((brief.inboxes ?? []).length > 1) {
    lines.push('## 📥 By inbox', '')
    for (const ib of brief.inboxes!) {
      lines.push(`- **${ib.label}** (${ib.role}) — ${ib.newCount} new${ib.needsYou ? `, ${ib.needsYou} need you` : ''}${ib.waitingOnYou ? `, ${ib.waitingOnYou} waiting for your reply` : ''}`)
    }
    lines.push('')
  }

  if ((brief.resolvedRecently ?? []).length > 0) {
    lines.push('## ✅ Done since last time', '')
    for (const r of brief.resolvedRecently!) lines.push(`- ${r}`)
    lines.push('')
  }

  lines.push('## 🏠 Personal', '')
  if (brief.personal.length === 0) lines.push('Nothing notable.', '')
  else {
    for (const p of brief.personal) lines.push(`- ${p}`)
    lines.push('')
  }

  if (brief.sensitiveNotices.length > 0) {
    lines.push('## 🔒 Sensitive items noticed', '', '_A heads-up only — nothing has been hidden or redacted._', '')
    for (const s of brief.sensitiveNotices) lines.push(`- ${s}`)
    lines.push('')
  }

  return lines.join('\n')
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const HTML_STYLE = `
body { font-family: Segoe UI, system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem;
  color: #1e2430; line-height: 1.6; }
h1 { border-bottom: 3px solid #1e2430; padding-bottom: .4rem; }
h2 { margin-top: 1.6rem; }
blockquote { border-left: 4px solid #2456a6; margin: 0; padding: .4rem 1rem; background: #f0f4fa; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d9dad1; padding: .45rem .6rem; text-align: left; font-size: .95rem; }
th { background: #f2f2ec; }
`

export function renderHtml(markdown: string): string {
  const body = marked.parse(markdown, { async: false }) as string
  return `<!doctype html><html><head><meta charset="utf-8"><title>InboxScout Brief</title><style>${HTML_STYLE}</style></head><body>${body}</body></html>`
}
