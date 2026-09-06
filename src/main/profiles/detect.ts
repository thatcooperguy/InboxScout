import type { WorkProfile } from './profiles'

/**
 * Pick the profile that best matches what a person's mail looks like.
 * Pure and cheap: regex signals over subject, sender, and snippet of recent
 * messages. Used after each scan when "choose for me" is on, and shown as a
 * suggestion when it is off.
 */
export interface DetectInput {
  subject: string
  fromName?: string
  fromAddress: string
  snippet: string
  /** Messages the person wrote themselves count a little more. */
  fromMe?: boolean
}

export interface ProfileScore {
  id: string
  score: number
  /** Distinct signals that fired (for explaining the suggestion). */
  hits: number
  /** Messages that matched at least one signal. */
  messages: number
}

const cache = new Map<string, RegExp | null>()
function re(src: string): RegExp | null {
  if (cache.has(src)) return cache.get(src)!
  let r: RegExp | null
  try {
    r = new RegExp(src, 'i')
  } catch {
    r = null
  }
  cache.set(src, r)
  return r
}

export function scoreProfiles(messages: DetectInput[], profiles: WorkProfile[]): ProfileScore[] {
  const texts = messages.map((m) => ({
    text: `${m.subject} | ${m.fromName ?? ''} <${m.fromAddress}> | ${m.snippet}`.slice(0, 1200),
    boost: m.fromMe ? 1.5 : 1
  }))
  const out: ProfileScore[] = []
  for (const p of profiles) {
    if (!p.signals.length) continue
    let score = 0
    let messagesHit = 0
    const fired = new Set<number>()
    for (const t of texts) {
      let hit = false
      p.signals.forEach((s, i) => {
        const r = re(s.pattern)
        if (r && r.test(t.text)) {
          // Diminishing returns per signal so one noisy newsletter can't dominate.
          const times = (fired as any)[`n${i}`] ?? 0
          ;(fired as any)[`n${i}`] = times + 1
          score += ((s.weight ?? 1) * t.boost) / (1 + times * 0.35)
          fired.add(i)
          hit = true
        }
      })
      if (hit) messagesHit++
    }
    if (score > 0) out.push({ id: p.id, score: Math.round(score * 10) / 10, hits: fired.size, messages: messagesHit })
  }
  return out.sort((a, b) => b.score - a.score)
}

export interface Detection {
  id: string
  confidence: 'high' | 'medium' | 'low'
  score: number
  runnerUp: string | null
  why: string
}

/**
 * Decide. Needs a few distinct signals and a clear lead over the runner-up;
 * otherwise returns null (keep whatever the person chose).
 */
export function detectProfile(messages: DetectInput[], profiles: WorkProfile[], minMessages = 15): Detection | null {
  if (messages.length < minMessages) return null
  const ranked = scoreProfiles(messages, profiles)
  const top = ranked[0]
  if (!top || top.hits < 3 || top.messages < 3) return null
  const second = ranked[1]
  const lead = second ? top.score / Math.max(second.score, 0.1) : Infinity
  const confidence: Detection['confidence'] = top.hits >= 5 && lead >= 1.6 ? 'high' : lead >= 1.25 ? 'medium' : 'low'
  if (confidence === 'low') return null
  const name = profiles.find((p) => p.id === top.id)?.name ?? top.id
  return {
    id: top.id,
    confidence,
    score: top.score,
    runnerUp: second?.id ?? null,
    why: `${top.messages} of your recent messages look like ${name} mail (${top.hits} distinct signals).`
  }
}
