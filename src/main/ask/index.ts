import type { LanguageModel } from 'ai'
import type { DB } from '../db/index'
import { recordFeature } from '../usage'
import { answerLocally, invalidateAskCache } from './local'
import { askAi, buildAskCtx } from './ai'
import type { Answer, AppSettings, HealthReport } from '../../shared/types'

export { invalidateAskCache } from './local'

/**
 * Conversation (v1.4, Part B): one function, two engines.
 *
 *   ask(deps, question, { onLocal, onAi })
 *
 * The local answerer runs first and is handed to `onLocal` (and returned) in well under 2 s. When an AI
 * provider is configured, the AI answerer runs after it with a hard 8-second budget and is handed to
 * `onAi`; if it throws, times out, or the model cannot call tools, nothing happens — the local answer
 * already stands. The transcript lives in the renderer; the only thing written here is a feature count.
 */

export const AI_BUDGET_MS = 8000

export interface AskDeps {
  db: DB
  settings: () => AppSettings
  /**
   * The configured model, or null when the AI is off / not configured. The closure that builds it may read
   * the SecretStore; `ask` itself never does, and the model is the only thing that crosses into AskCtx.
   */
  getModel: () => LanguageModel | null
  healthStatus?: () => HealthReport | Promise<HealthReport>
  ownerName?: string
  now?: () => Date
  log?: (level: 'info' | 'warn' | 'error', message: string, detail?: unknown) => void
}

export interface AskHandlers {
  onLocal?: (answer: Answer) => void
  onAi?: (answer: Answer) => void
}

export interface AskResult {
  local: Answer
  /** True when an AI answer is on its way (the UI shows "thinking…"). */
  aiPending: boolean
  /** Resolves with the AI answer, or null when there is none (off, failed, or out of time). */
  ai: Promise<Answer | null>
}

/** The previous answer's text, so "read it to me" can repeat it. In memory only; one person per app. */
let lastAnswerText: string | null = null

function remember(a: Answer): void {
  if (a.actions.some((x) => x.kind === 'speak')) return
  lastAnswerText = a.text
}

function aiConfigured(deps: AskDeps): LanguageModel | null {
  try {
    if (deps.settings().ai.provider === 'builtin') return null
    return deps.getModel()
  } catch {
    return null
  }
}

/** Both engines, started together; the local answer is ready as soon as this resolves. */
export async function askBoth(deps: AskDeps, question: string): Promise<AskResult> {
  const q = String(question ?? '').trim().slice(0, 500)
  try {
    recordFeature(deps.db, 'ask')
  } catch {
    // a missing usage row is not worth failing a question
  }
  const now = deps.now ?? (() => new Date())
  const local = await answerLocally({ db: deps.db, healthStatus: deps.healthStatus, lastAnswer: () => lastAnswerText, ownerName: deps.ownerName, now }, q)
  remember(local)
  const model = q ? aiConfigured(deps) : null
  if (!model) return { local, aiPending: false, ai: Promise.resolve(null) }
  const ai = runAi(deps, model, q, now()).then((a) => {
    if (a) remember(a)
    return a
  })
  return { local, aiPending: true, ai }
}

async function runAi(deps: AskDeps, model: LanguageModel, q: string, now: Date): Promise<Answer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_BUDGET_MS)
  try {
    const ctx = buildAskCtx(deps.db, model, { now, ownerName: deps.ownerName })
    // Race a timer too: some providers ignore the abort signal mid-request.
    const answer = await Promise.race([
      askAi(ctx, q, controller.signal),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_BUDGET_MS + 250))
    ])
    return answer
  } catch (err) {
    deps.log?.('warn', 'ask: AI answer failed; the local answer stands', { error: String((err as Error)?.message ?? err) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Local first (returned and handed to `onLocal`), AI later through `onAi`. Never rejects because of the AI.
 */
export async function ask(deps: AskDeps, question: string, handlers: AskHandlers = {}): Promise<Answer> {
  const r = await askBoth(deps, question)
  handlers.onLocal?.(r.local)
  if (r.aiPending) void r.ai.then((a) => a && handlers.onAi?.(a))
  return r.local
}

/** Local + AI awaited together (the bridge and the phone): the AI answer when it makes the budget, else the local one. */
export async function askAndWait(deps: AskDeps, question: string): Promise<Answer> {
  const r = await askBoth(deps, question)
  if (!r.aiPending) return r.local
  return (await r.ai) ?? r.local
}

/** Test hook: forget the remembered answer. */
export function resetAskMemory(): void {
  lastAnswerText = null
  invalidateAskCache()
}
