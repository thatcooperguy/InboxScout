import type { ProviderId } from '../../shared/types'

export interface Detection {
  provider: ProviderId
  kind: 'env_key' | 'local_server'
  detail: string
  /** For env keys: the key value, so one click can connect it. */
  apiKey?: string
}

const ENV_KEY_MAP: [string, ProviderId][] = [
  ['GEMINI_API_KEY', 'gemini'],
  ['GOOGLE_API_KEY', 'gemini'],
  ['GROQ_API_KEY', 'groq'],
  ['OPENAI_API_KEY', 'openai'],
  ['XAI_API_KEY', 'xai'],
  ['ANTHROPIC_API_KEY', 'anthropic'],
  ['OPENROUTER_API_KEY', 'openrouter'],
  ['MISTRAL_API_KEY', 'mistral'],
  ['DEEPSEEK_API_KEY', 'deepseek']
]

/** Pure: find AI keys already present in the environment. */
export function detectEnvKeys(env: Record<string, string | undefined>): Detection[] {
  const found: Detection[] = []
  const seen = new Set<ProviderId>()
  for (const [name, provider] of ENV_KEY_MAP) {
    const value = env[name]?.trim()
    if (value && !seen.has(provider)) {
      seen.add(provider)
      found.push({ provider, kind: 'env_key', detail: `Found ${name} on this computer`, apiKey: value })
    }
  }
  return found
}

async function probe(url: string, timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Probe for local AI servers already running on this machine. */
export async function detectLocalServers(ollamaBaseUrl: string): Promise<Detection[]> {
  const found: Detection[] = []
  const ollamaRoot = (ollamaBaseUrl || 'http://127.0.0.1:11434/v1').replace(/\/v1\/?$/, '')
  const [ollama, lmstudio] = await Promise.all([
    probe(`${ollamaRoot}/api/tags`),
    probe('http://127.0.0.1:1234/v1/models')
  ])
  if (ollama) found.push({ provider: 'ollama', kind: 'local_server', detail: 'Ollama is running on this computer' })
  if (lmstudio)
    found.push({ provider: 'lmstudio', kind: 'local_server', detail: 'LM Studio server is running on this computer' })
  return found
}
