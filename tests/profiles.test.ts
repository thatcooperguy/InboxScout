import { describe, expect, it } from 'vitest'
import { PROFILES, PROFILE_GROUPS, PROFILE_LIST, getProfile } from '../src/main/profiles/profiles'
import { detectProfile, scoreProfiles } from '../src/main/profiles/detect'
import { BUILTIN_SKILLS } from '../src/main/skills/library'
import { defaultSkillIds } from '../src/main/skills/engine'

describe('profile catalogue', () => {
  it('has 50+ unique, well-formed profiles across the five groups', () => {
    expect(PROFILE_LIST.length).toBeGreaterThanOrEqual(50)
    const ids = PROFILE_LIST.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const groups = new Set(PROFILE_GROUPS.map((g) => g.id))
    for (const p of PROFILE_LIST) {
      expect(p.id, p.id).toMatch(/^[a-z][a-z0-9]*$/)
      expect(groups.has(p.group), `${p.id} group`).toBe(true)
      expect(p.name.length, `${p.id} name`).toBeGreaterThan(3)
      expect(p.tagline.length, `${p.id} tagline`).toBeGreaterThan(10)
      expect(p.icon.length, `${p.id} icon`).toBeGreaterThan(0)
      expect(p.pulseName.length, `${p.id} pulse`).toBeGreaterThan(3)
      expect(p.workDescription.length, `${p.id} workDescription`).toBeGreaterThan(60)
      expect(p.urgencyHints.length, `${p.id} urgencyHints`).toBeGreaterThanOrEqual(3)
      expect(p.entityNoun.length, `${p.id} entityNoun`).toBeGreaterThan(1)
      if (p.id !== 'general') expect(p.signals.length, `${p.id} signals`).toBeGreaterThanOrEqual(8)
      for (const s of p.signals) expect(() => new RegExp(s.pattern, 'i'), `${p.id}: ${s.pattern}`).not.toThrow()
    }
    for (const g of PROFILE_GROUPS) expect(PROFILE_LIST.some((p) => p.group === g.id), g.id).toBe(true)
  })

  it('every default skill a profile names exists, and every profile gets some skills', () => {
    const known = new Set(BUILTIN_SKILLS.map((s) => s.id))
    for (const p of PROFILE_LIST) {
      for (const id of p.defaultSkills) expect(known.has(id), `${p.id} → skill ${id}`).toBe(true)
      expect(defaultSkillIds(p.id).length, `${p.id} defaults`).toBeGreaterThanOrEqual(2)
    }
    expect(getProfile('nope').id).toBe('general')
    expect(PROFILES.general).toBeTruthy()
  })
})

describe('skill catalogue', () => {
  it('has unique ids and compiling regexes', () => {
    const ids = BUILTIN_SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of BUILTIN_SKILLS) {
      expect(s.id, s.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(s.description.length, `${s.id} description`).toBeGreaterThan(10)
      expect(s.lineTemplate.length, `${s.id} lineTemplate`).toBeGreaterThan(3)
      expect(s.sectionTitle.length, `${s.id} sectionTitle`).toBeGreaterThan(2)
      for (const m of [...s.match, ...(s.senderMatch ?? []), ...(s.urgentWhen ?? [])]) {
        expect(() => new RegExp(m, 'i'), `${s.id}: ${m}`).not.toThrow()
      }
      for (const ex of s.extractors ?? []) expect(() => new RegExp(ex.pattern, ex.flags ?? 'i'), `${s.id}: ${ex.pattern}`).not.toThrow()
      for (const pid of s.defaultFor) expect(PROFILES[pid], `${s.id} defaultFor ${pid}`).toBeTruthy()
    }
  })
})

describe('profile detection', () => {
  const msg = (subject: string, fromAddress: string, snippet = ''): { subject: string; fromAddress: string; snippet: string } => ({ subject, fromAddress, snippet })

  it('recognises a real-estate agent from their mail', () => {
    const mail = [
      msg('Showing request for 12 Oak St', 'noreply@showingtime.com', 'A buyer agent requested a showing'),
      msg('Counter offer on 45 Elm', 'jane@brokerage.com', 'Seller countered at 450k, escrow to open Monday'),
      msg('MLS listing agreement', 'broker@realty.com', 'Please sign the listing agreement'),
      msg('Home inspection scheduled', 'inspector@homeinspect.com', 'Inspection Tuesday 9am'),
      msg('Closing disclosure ready', 'title@titleco.com', 'Closing disclosure for review'),
      msg('Open house Sunday', 'me@realty.com', 'Reminder open house 2-4'),
      msg('Earnest money received', 'escrow@titleco.com', 'Earnest money deposit received'),
      ...Array.from({ length: 10 }, (_, i) => msg(`Hello ${i}`, 'friend@example.com', 'lunch?'))
    ]
    const d = detectProfile(mail, PROFILE_LIST)
    expect(d?.id).toBe('realestate')
    expect(['high', 'medium']).toContain(d?.confidence)
  })

  it('stays quiet on too little or ambiguous mail', () => {
    expect(detectProfile([msg('hi', 'a@b.com')], PROFILE_LIST)).toBeNull()
    const bland = Array.from({ length: 20 }, (_, i) => msg(`Note ${i}`, 'x@example.com', 'see attached'))
    expect(detectProfile(bland, PROFILE_LIST)).toBeNull()
  })

  it('scores every non-general profile from a sample of its own vocabulary', () => {
    // Each profile's own signals, used as fake subjects, must rank that profile first.
    for (const p of PROFILE_LIST) {
      if (!p.signals.length) continue
      const sample = p.signals.map((s, i) => msg(`Sample ${i}`, 'someone@example.com', literalFromPattern(s.pattern)))
      const ranked = scoreProfiles(sample, PROFILE_LIST)
      expect(ranked[0]?.id, `${p.id} should win its own vocabulary; got ${ranked.slice(0, 3).map((r) => `${r.id}:${r.score}`).join(', ')}`).toBe(p.id)
    }
  })
})

/** Turn a simple alternation regex into one literal phrase it matches (best effort, for self-tests). */
function literalFromPattern(pattern: string): string {
  let s = pattern
  s = s.replace(/\\b/g, '')
  s = s.replace(/\(\?:([^()|]+)\|[^()]*\)/g, '$1') // (?:a|b) → a
  s = s.replace(/\(\?:([^()]*)\)\?/g, '') // optional group → drop
  s = s.replace(/\(\?:([^()|]+)\)/g, '$1')
  s = s.replace(/\(([^()|]+)\|[^()]*\)/g, '$1')
  s = s.replace(/\\\./g, '.').replace(/\\-/g, '-').replace(/\\\//g, '/').replace(/\\#/g, '#').replace(/\\\$/g, '$').replace(/\\&/g, '&').replace(/\\@/g, '@')
  s = s.replace(/\[- \]/g, ' ').replace(/\[ -\]/g, ' ')
  s = s.replace(/\[a-z\]\*/g, '').replace(/[a-z]\?/g, (m) => m[0]).replace(/\?/g, '')
  s = s.replace(/\\d\{?\d*,?\d*\}?/g, '42').replace(/\\d/g, '4').replace(/\\s\*/g, ' ').replace(/\\s\+/g, ' ').replace(/\\s/g, ' ')
  s = s.replace(/\[[^\]]+\]\+?/g, 'x')
  s = s.replace(/[.*+^$]/g, '')
  return s.replace(/\|/g, ' ').replace(/[()]/g, '')
}
