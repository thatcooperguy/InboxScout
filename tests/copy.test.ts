import { describe, expect, it } from 'vitest'
import { COPY, SIMPLE_JARGON, lastChecked, t } from '../src/renderer/src/copy'
import { SETTINGS_REGISTRY } from '../src/shared/settingsRegistry'

/** Rough Flesch–Kincaid grade for a sentence or two. */
function grade(text: string): number {
  const words = text.split(/\s+/).filter(Boolean)
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length)
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) ?? []).length), 0)
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59
}

describe('level copy', () => {
  it('keeps Simple copy short, jargon-free, and easy to read', () => {
    for (const [key, v] of Object.entries(COPY)) {
      if (!v.simple) continue
      const lower = v.simple.toLowerCase()
      for (const word of SIMPLE_JARGON) expect(new RegExp(`\\b${word}\\b`).test(lower), `${key} uses "${word}"`).toBe(false)
      if (v.simple.split(/\s+/).length >= 4) expect(grade(v.simple), `${key} reads at grade ${grade(v.simple).toFixed(1)}: ${v.simple}`).toBeLessThanOrEqual(7)
      for (const sentence of v.simple.split(/[.!?]+/).filter((s) => s.trim())) {
        expect(sentence.trim().split(/\s+/).length, `${key} sentence too long: ${sentence}`).toBeLessThanOrEqual(14)
      }
    }
  })

  it('falls back to Standard and resolves each level', () => {
    expect(t('hero.run', 'simple')).toBe('Check my email')
    expect(t('hero.run', 'pro')).toBe('Check now')
    expect(t('hero.running', 'simple')).toBe('Checking…')
    expect(t('nope', 'standard')).toBe('nope')
  })

  it('describes the last check in words a person would use', () => {
    const now = new Date()
    const morning = new Date(now)
    morning.setHours(7, 31, 0, 0)
    expect(lastChecked(morning, 'simple')).toMatch(/^I checked (this morning|today)\.$/)
    expect(lastChecked(morning, 'standard')).toMatch(/^Last checked today at/)
    expect(lastChecked(morning, 'pro', '212 msgs')).toMatch(/212 msgs$/)
  })

  it('keeps every setting explanation free of unexplained jargon at the label level', () => {
    for (const d of SETTINGS_REGISTRY) {
      const label = d.label.toLowerCase()
      for (const word of ['oauth', 'imap', 'webhook', 'api']) expect(label.includes(word), `${d.key} label says ${word}`).toBe(false)
    }
  })
})
