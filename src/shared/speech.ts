import type { Brief } from './types'

/** Plain-language script for a spoken brief - shared by the app and the OS voice. */
export function briefToSpeech(brief: Brief, opts: { short?: boolean } = {}): string {
  const parts: string[] = [brief.headline]
  const n = brief.topIssues.length
  if (n > 0) {
    parts.push(`${n} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you.`)
    for (const i of brief.topIssues.slice(0, opts.short ? 3 : 7)) parts.push(`${i.title}. ${i.nextStep}`)
  }
  if (brief.waitingOnYou.length > 0) {
    parts.push(`You owe ${brief.waitingOnYou.length} repl${brief.waitingOnYou.length === 1 ? 'y' : 'ies'}.`)
    if (!opts.short) for (const w of brief.waitingOnYou.slice(0, 5)) parts.push(w.replace(/ - /g, ', from '))
  }
  const todayEvents = brief.schedule?.days.find((d) => d.label === 'Today')?.events ?? []
  if (todayEvents.length > 0) {
    parts.push('Today: ' + todayEvents.slice(0, 4).map((e) => `${e.time ? `${e.time}, ` : ''}${e.title}`).join('. '))
  } else if (brief.deadlines.length > 0) {
    parts.push('Coming up: ' + brief.deadlines.slice(0, opts.short ? 3 : 6).map((d) => d.replace(/ — /g, ', ')).join('. '))
  }
  const overduePromises = (brief.promises ?? []).filter((p) => p.overdue)
  if (overduePromises.length > 0) {
    parts.push(`You promised ${overduePromises[0].to}: ${overduePromises[0].text}${overduePromises.length > 1 ? `, and ${overduePromises.length - 1} more` : ''}.`)
  }
  for (const q of (brief.people?.goingQuiet ?? []).slice(0, opts.short ? 1 : 2)) parts.push(q)
  for (const s of brief.skillSections ?? []) {
    if (s.lines.length === 0) continue
    parts.push(
      `${s.title}: ` +
        s.lines
          .slice(0, opts.short ? 2 : 4)
          .map((l) => l.replace(/^‼\s*/, 'Urgent: ').replace(/ — /g, ', '))
          .join('. ')
    )
  }
  if (n === 0 && brief.waitingOnYou.length === 0 && brief.deadlines.length === 0) parts.push("You're all caught up.")
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ')
}
