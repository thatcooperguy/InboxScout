import { describe, expect, it } from 'vitest'
import { detectEnvKeys } from '../src/main/ai/detect'

describe('detectEnvKeys', () => {
  it('finds known AI keys in the environment', () => {
    const found = detectEnvKeys({
      GEMINI_API_KEY: 'g-123',
      OPENAI_API_KEY: 'sk-456',
      PATH: '/usr/bin'
    })
    expect(found).toHaveLength(2)
    expect(found.find((d) => d.provider === 'gemini')?.apiKey).toBe('g-123')
    expect(found.find((d) => d.provider === 'openai')?.apiKey).toBe('sk-456')
    expect(found.every((d) => d.kind === 'env_key')).toBe(true)
  })

  it('deduplicates aliases pointing at the same provider', () => {
    const found = detectEnvKeys({ GEMINI_API_KEY: 'a', GOOGLE_API_KEY: 'b' })
    expect(found).toHaveLength(1)
    expect(found[0].apiKey).toBe('a')
  })

  it('ignores empty values and unknown variables', () => {
    expect(detectEnvKeys({ GROQ_API_KEY: '  ', RANDOM_KEY: 'x' })).toHaveLength(0)
  })
})
