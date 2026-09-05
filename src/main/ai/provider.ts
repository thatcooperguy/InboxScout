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
  builtin: 'rules-v1',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-5-mini',
  xai: 'grok-3-mini',
  anthropic: 'claude-haiku-4-5',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  mistral: 'mistral-small-latest',
  deepseek: 'deepseek-chat',
  ollama: 'qwen3:4b',
  lmstudio: 'local-model',
  custom: 'local-model'
}

/** Providers that need no API key: they run on this computer (or are pure code). */
export const LOCAL_PROVIDERS: ProviderId[] = ['builtin', 'ollama', 'lmstudio']

export interface ProviderLabel {
  name: string
  keyUrl: string
  note: string
  free: boolean
}

export const PROVIDER_LABELS: Record<ProviderId, ProviderLabel> = {
  builtin: {
    name: 'Built-in (no account)',
    keyUrl: '',
    note: 'Works out of the box: rule-based sorting and briefs, 100% on this PC. Connect any AI below for smarter results.',
    free: true
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier, no credit card. Recommended AI upgrade.',
    free: true
  },
  groq: {
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier; very fast open models.',
    free: true
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'One key, hundreds of models — includes free models.',
    free: true
  },
  mistral: {
    name: 'Mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Free experiment tier available.',
    free: true
  },
  deepseek: {
    name: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'Very low cost.',
    free: false
  },
  openai: { name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', note: 'Requires billing setup.', free: false },
  xai: { name: 'xAI Grok', keyUrl: 'https://console.x.ai', note: 'API key from the xAI console.', free: false },
  anthropic: {
    name: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'API key from the Claude Console.',
    free: false
  },
  ollama: {
    name: 'Ollama (local)',
    keyUrl: 'https://ollama.com/download',
    note: 'Free local AI. No account; email never leaves this PC.',
    free: true
  },
  lmstudio: {
    name: 'LM Studio (local)',
    keyUrl: 'https://lmstudio.ai',
    note: 'Free local AI via LM Studio\'s server. No account.',
    free: true
  },
  custom: {
    name: 'Custom endpoint',
    keyUrl: '',
    note: 'Any OpenAI-compatible server (self-hosted, llama.cpp, vLLM…).',
    free: true
  }
}

export function resolveModel(settings: AiSettings, apiKey: string): LanguageModel {
  const modelId = settings.model || DEFAULT_MODELS[settings.provider]
  const compatible = (name: string, baseURL: string, key: string): LanguageModel =>
    createOpenAICompatible({ name, baseURL, apiKey: key || 'none' })(modelId)
  switch (settings.provider) {
    case 'builtin':
      throw new Error('The built-in engine does not use an AI model.')
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
    case 'openrouter':
      return compatible('openrouter', 'https://openrouter.ai/api/v1', apiKey)
    case 'mistral':
      return compatible('mistral', 'https://api.mistral.ai/v1', apiKey)
    case 'deepseek':
      return compatible('deepseek', 'https://api.deepseek.com/v1', apiKey)
    case 'ollama':
      return compatible('ollama', settings.ollamaBaseUrl || 'http://127.0.0.1:11434/v1', apiKey || 'ollama')
    case 'lmstudio':
      return compatible('lmstudio', 'http://127.0.0.1:1234/v1', apiKey || 'lmstudio')
    case 'custom':
      if (!settings.customBaseUrl) throw new Error('Set the custom endpoint URL first.')
      return compatible('custom', settings.customBaseUrl, apiKey)
  }
}

/** Cheap live check that a key/endpoint works. The built-in engine always works. */
export async function testProvider(settings: AiSettings, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (settings.provider === 'builtin') return { ok: true }
  try {
    const model = resolveModel(settings, apiKey)
    await generateText({ model, prompt: 'Reply with the single word: ok' })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}
