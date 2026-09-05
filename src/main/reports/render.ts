import { marked } from 'marked'
import type { Brief } from '../../shared/types'
import type { WorkProfile } from '../profiles/profiles'

const SEVERITY_MARK: Record<string, string> = { urgent: 'URGENT', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }
const TREND_MARK: Record<string, string> = { up: '▲ progressing', steady: '▬ steady', down: '▼ at risk' }

export function renderMarkdown(
  brief: Brief,
  profile: WorkProfile,
  periodType: 'daily' | 'weekly',
  date: Date
): string {
  const title = periodType === 'daily' ? 'Daily Brief' : 'Weekly Brief'
  const dateStr = date.toDateString()
  const lines: string[] = []
  lines.push(`# ${title} — ${dateStr}`, '', `> ${brief.headline}`, '')

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

  if (brief.deadlines.length > 0) {
    lines.push('## 📅 Dates & deadlines', '')
    for (const d of brief.deadlines) lines.push(`- ${d}`)
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>Inbox Intel Brief</title><style>${HTML_STYLE}</style></head><body>${body}</body></html>`
}
