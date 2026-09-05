import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
import { createXai } from '@ai-sdk/xai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, type LanguageModel } from 'ai'
import type { AiSettings, ProviderId } from '../../shared/types'

/**
 * Default model per provider. Users can override in Settings; these are
 * chosen as the cheap/fast tier suitable for classification and briefs.
 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-5-mini',
  xai: 'grok-3-mini',
  anthropic: 'claude-haiku-4-5',
  ollama: 'qwen3:4b'
}

export const PROVIDER_LABELS: Record<ProviderId, { name: string; keyUrl: string; note: string }> = {
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier, no credit card. Recommended default.'
  },
  groq: {
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier; very fast open models.'
  },
  openai: { name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', note: 'Requires billing setup.' },
  xai: { name: 'xAI Grok', keyUrl: 'https://console.x.ai', note: 'API key from the xAI console.' },
  anthropic: {
    name: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'API key from the Claude Console.'
  },
  ollama: { name: 'Ollama (local)', keyUrl: 'https://ollama.com/download', note: 'No account. Email never leaves this PC.' }
}

export function resolveModel(settings: AiSettings, apiKey: string): LanguageModel {
  const modelId = settings.model || DEFAULT_MODELS[settings.provider]
  switch (settings.provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(modelId)
    case 'groq':
      return createGroq({ apiKey })(modelId)
    case 'openai':
      return createOpenAI({ apiKey })(modelId)
    case 'xai':
      return createXai({ apiKey })(modelId)
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId)
    case 'ollama':
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: settings.ollamaBaseUrl || 'http://127.0.0.1:11434/v1',
        apiKey: apiKey || 'ollama'
      })(modelId)
  }
}

/** Cheap live check that a key/endpoint works. */
export async function testProvider(settings: AiSettings, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const model = resolveModel(settings, apiKey)
    await generateText({ model, prompt: 'Reply with the single word: ok' })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}
