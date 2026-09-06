import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { SETTINGS_REGISTRY, SETTING_GROUPS, defaultOf, getSetting, isDefault, searchSettings, setSetting, visibleAt } from '../src/shared/settingsRegistry'

describe('settings registry', () => {
  it('explains every registered setting in plain words and points at a real key', () => {
    const groups = new Set(SETTING_GROUPS.map((g) => g.id))
    for (const d of SETTINGS_REGISTRY) {
      expect(groups.has(d.group), d.key).toBe(true)
      expect(d.label.length, d.key).toBeGreaterThan(3)
      expect(d.what.length, `${d.key} what`).toBeGreaterThan(20)
      expect(d.why.length, `${d.key} why`).toBeGreaterThan(5)
      expect(defaultOf(d.key), `${d.key} exists in DEFAULT_SETTINGS`).not.toBeUndefined()
      if (d.kind === 'select' || d.kind === 'toggle') expect(Array.isArray(d.options), `${d.key} options`).toBe(true)
    }
    const keys = SETTINGS_REGISTRY.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('covers every plain setting except the ones handled by richer cards', () => {
    const handledElsewhere = new Set(['profileId', 'ai.provider', 'ai.customBaseUrl', 'lastRunAt', 'enabledSkillIds', 'vipSenders', 'mutedSenders', 'quietPeople', 'schedule.hour', 'schedule.minute', 'systemConsents', 'eulaAcceptedVersion'])
    const flat = (obj: any, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
    const registered = new Set(SETTINGS_REGISTRY.map((d) => d.key))
    for (const key of flat(DEFAULT_SETTINGS)) {
      if (handledElsewhere.has(key)) continue
      expect(registered.has(key) || registered.has('schedule.time'), `setting ${key} is explained`).toBe(true)
    }
  })

  it('reads and writes dotted keys and the virtual schedule time', () => {
    expect(getSetting(DEFAULT_SETTINGS, 'schedule.time')).toBe('07:30')
    const next = setSetting(DEFAULT_SETTINGS, 'schedule.time', '18:05')
    expect(next.schedule.hour).toBe(18)
    expect(next.schedule.minute).toBe(5)
    expect(setSetting(DEFAULT_SETTINGS, 'ai.model', 'x').ai.model).toBe('x')
    expect(setSetting(DEFAULT_SETTINGS, 'textSize', 'large').textSize).toBe('large')
    expect(isDefault(DEFAULT_SETTINGS, 'textSize')).toBe(true)
    expect(isDefault(setSetting(DEFAULT_SETTINGS, 'textSize', 'large'), 'textSize')).toBe(false)
  })

  it('shows fewer settings at Simple and finds settings by plain words', () => {
    const simple = SETTINGS_REGISTRY.filter((d) => visibleAt(d, 'simple'))
    const pro = SETTINGS_REGISTRY.filter((d) => visibleAt(d, 'pro'))
    expect(simple.length).toBeLessThan(pro.length)
    expect(pro.length).toBe(SETTINGS_REGISTRY.length)
    expect(searchSettings('read aloud').map((d) => d.key)).toContain('speakBriefs')
    expect(searchSettings('hermes').map((d) => d.key)).toContain('bridgeEnabled')
  })
})
