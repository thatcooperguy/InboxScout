import { generateObject, type LanguageModel } from 'ai'
import { AgentBrowser } from './browser'
import {
  ASSISTANT_RULES,
  MAX_STEPS,
  actionSchema,
  applyPlaceholders,
  buildStepPrompt,
  buildSystemPrompt,
  detectScreen,
  formatElements,
  hostAllowed,
  redactSecret,
  type AgentAction,
  type Autonomy,
  type Recipe,
  type SavedSignin
} from './policy'
import { extractAppPassword, extractCredentials } from '../setup/capture'

export type AgentStatus = 'idle' | 'running' | 'waiting_user' | 'waiting_answer' | 'done' | 'failed' | 'stopped'

export interface AgentEvent {
  type: 'status' | 'step' | 'ask' | 'handoff' | 'done' | 'error' | 'captured'
  status?: AgentStatus
  message?: string
  step?: number
  captured?: Record<string, string>
  question?: string
}

export interface AgentDeps {
  getModel: () => Promise<{ model: LanguageModel; vision: boolean } | null>
  onEvent: (e: AgentEvent) => void
}

export interface AgentTask {
  recipe: Recipe | null
  params: Record<string, string>
  goal: string
  startUrl: string
  allowedDomains: string[]
  /** How far it may go on its own (Preferences → Assistant). */
  autonomy: Autonomy
  /** Saved sign-in it may use to log in (never shown to the model; typed via placeholders). */
  signin: SavedSignin | null
}

/** Most sign-in attempts with the saved password before handing off. */
const MAX_SIGNIN_ATTEMPTS = 2

/**
 * The agent loop: observe → decide → guard → act, with the person able to
 * answer questions, take over sign-ins, and stop at any time.
 */
export class AgentRunner {
  private browser: AgentBrowser
  private status: AgentStatus = 'idle'
  private stopRequested = false
  private pendingResume: (() => void) | null = null
  private pendingAnswer: ((text: string) => void) | null = null
  private history: string[] = []
  private userNotes: string[] = []
  private captured: Record<string, string> = {}
  private task: AgentTask | null = null
  private log: string[] = []
  private signinAttempts = 0
  private dangerAcknowledged = false

  constructor(private deps: AgentDeps) {
    this.browser = new AgentBrowser(() => {
      if (this.isBusy()) {
        this.stopRequested = true
        this.pendingResume?.()
        this.pendingAnswer?.('')
      }
    })
  }

  isBusy(): boolean {
    return this.status === 'running' || this.status === 'waiting_user' || this.status === 'waiting_answer'
  }

  getStatus(): { status: AgentStatus; log: string[]; captured: Record<string, string>; task: Omit<AgentTask, 'signin'> | null } {
    const task = this.task ? { ...this.task, signin: undefined } : null
    if (task) delete (task as any).signin
    return { status: this.status, log: this.log.slice(-60), captured: { ...this.captured }, task: task as Omit<AgentTask, 'signin'> | null }
  }

  private emit(e: AgentEvent): void {
    if (e.message) this.log.push(e.message)
    this.deps.onEvent(e)
  }

  private setStatus(status: AgentStatus, message?: string): void {
    this.status = status
    this.emit({ type: 'status', status, message })
  }

  answer(text: string): void {
    this.userNotes.push(text)
    this.pendingAnswer?.(text)
  }

  continueAfterHandoff(): void {
    this.userNotes.push('The person finished signing in / verifying (or approved continuing); continue.')
    this.pendingResume?.()
  }

  stop(): void {
    this.stopRequested = true
    this.pendingResume?.()
    this.pendingAnswer?.('')
  }

  async start(task: AgentTask): Promise<{ ok: boolean; captured: Record<string, string>; summary: string }> {
    if (this.isBusy()) {
      return { ok: false, captured: {}, summary: 'The assistant is already working on something.' }
    }
    const backend = await this.deps.getModel()
    if (!backend) {
      this.setStatus('failed', 'Connect an AI helper first (Setup → AI helper). The free Gemini or Groq tier works.')
      return { ok: false, captured: {}, summary: 'No AI backend' }
    }
    this.task = task
    this.stopRequested = false
    this.history = []
    this.userNotes = []
    this.captured = {}
    this.log = []
    this.signinAttempts = 0
    this.dangerAcknowledged = false
    const canSignIn = task.autonomy !== 'careful' && !!task.signin
    this.setStatus(
      'running',
      `Starting: ${task.recipe?.name ?? 'custom task'}` + (canSignIn ? ` (will sign in as ${task.signin!.email})` : '')
    )
    this.browser.open(task.startUrl)
    await this.browser.settle(2500)

    const system = buildSystemPrompt(ASSISTANT_RULES, { autonomy: task.autonomy, signinEmail: canSignIn ? task.signin!.email : null })
    let summary = ''
    let lastAction = ''
    let repeats = 0
    try {
      for (let step = 1; step <= MAX_STEPS; step++) {
        if (this.stopRequested) break
        if (!this.browser.isOpen()) throw new Error('The assistant window was closed.')
        const obs = await this.browser.observe(backend.vision)
        this.watchForCredentials(obs.text)

        if (task.autonomy !== 'full' && !hostAllowed(obs.url, task.allowedDomains) && !obs.url.startsWith('about:')) {
          await this.handoff(
            `The page moved to ${safeHost(obs.url)}, which is outside this task. Please get back to the right page, then press Continue.`
          )
          continue
        }
        const screen = detectScreen(obs.text, formatElements(obs.elements))
        if (screen === 'twofactor') {
          await this.handoff('Please finish the verification step (code or phone approval) on the assistant window, then press Continue.')
          continue
        }
        if (screen === 'login') {
          if (!canSignIn) {
            await this.handoff('Please sign in on the assistant window (the assistant never sees your password), then press Continue.')
            continue
          }
          if (this.signinAttempts >= MAX_SIGNIN_ATTEMPTS) {
            await this.handoff(
              `The saved password for ${task.signin!.email} did not seem to work. Please sign in on the assistant window, then press Continue.`
            )
            this.signinAttempts = 0
            continue
          }
        }
        if (screen === 'danger' && !this.dangerAcknowledged) {
          if (task.autonomy === 'careful') {
            this.setStatus('failed', 'Stopped: this page involves payments, deletion, or passwords — the assistant is not allowed to act here (change this in Preferences → Assistant).')
            return { ok: false, captured: this.captured, summary: 'Refused a dangerous page.' }
          }
          if (task.autonomy === 'signin') {
            await this.handoff('This page involves payments, deletion, or a password change. Press Continue if that is what you want the assistant to do, or Stop.')
            this.dangerAcknowledged = true
            continue
          }
          this.emit({ type: 'step', message: 'Heads-up: this page involves payments, deletion, or a password change — continuing because autonomy is set to Full.' })
          this.dangerAcknowledged = true
        }

        const prompt = buildStepPrompt({
          goal: task.goal,
          url: obs.url,
          title: obs.title,
          screen,
          elements: obs.elements,
          pageText: obs.text,
          history: this.history,
          captured: this.captured,
          userNotes: this.userNotes,
          step
        })
        const messages: any[] = [
          {
            role: 'user',
            content: obs.screenshotDataUrl
              ? [
                  { type: 'text', text: prompt },
                  { type: 'image', image: obs.screenshotDataUrl, mediaType: 'image/png' }
                ]
              : prompt
          }
        ]
        const { object } = await generateObject({ model: backend.model, schema: actionSchema, system, messages })
        const action = object.action
        const signature = JSON.stringify(action)
        repeats = signature === lastAction ? repeats + 1 : 0
        lastAction = signature
        if (repeats >= 3) {
          this.history.push('Same action repeated 3 times — try something different.')
          repeats = 0
          continue
        }
        this.emit({ type: 'step', step, message: `${step}. ${object.thought} → ${describe(action)}` })

        const result = await this.perform(action, task)
        if (result.finished) {
          summary = result.summary ?? ''
          break
        }
        this.history.push(`${describe(action)} ⇒ ${redactSecret(result.note, task.signin)}`)
      }
    } catch (err: any) {
      this.setStatus('failed', `Problem: ${redactSecret(String(err?.message ?? err), task.signin)}`)
      return { ok: false, captured: this.captured, summary: String(err?.message ?? err) }
    }

    if (this.stopRequested) {
      this.setStatus('stopped', 'Stopped.')
      return { ok: false, captured: this.captured, summary: 'Stopped.' }
    }
    if (this.status === 'failed') return { ok: false, captured: this.captured, summary }
    if (this.status !== 'done') {
      this.setStatus('failed', `Ran out of steps (${MAX_STEPS}) before finishing. The page may need a human touch.`)
      return { ok: false, captured: this.captured, summary: 'Out of steps' }
    }
    return { ok: true, captured: this.captured, summary }
  }

  private watchForCredentials(text: string): void {
    const recipe = this.task?.recipe
    if (!recipe) return
    let found: Record<string, string> = {}
    if (recipe.captures === 'appPassword' && recipe.provider) {
      const pw = extractAppPassword(recipe.provider, text)
      if (pw) found = { appPassword: pw }
    } else if (recipe.captures === 'googleClient') {
      const c = extractCredentials('google', text)
      found = {
        ...(c.googleClientId ? { googleClientId: c.googleClientId } : {}),
        ...(c.googleClientSecret ? { googleClientSecret: c.googleClientSecret } : {})
      }
    } else if (recipe.captures === 'microsoftClientId') {
      const c = extractCredentials('microsoft', text)
      if (c.microsoftClientId) found = { microsoftClientId: c.microsoftClientId }
    }
    let changed = false
    for (const [k, v] of Object.entries(found)) {
      if (this.captured[k] !== v) {
        this.captured[k] = v
        changed = true
      }
    }
    if (changed) this.emit({ type: 'captured', captured: { ...this.captured }, message: `Captured: ${Object.keys(found).join(', ')}` })
  }

  private async handoff(message: string): Promise<void> {
    this.browser.setTitle('InboxScout Assistant — your turn (then press Continue in InboxScout)')
    this.browser.bringToFront()
    this.setStatus('waiting_user', message)
    this.emit({ type: 'handoff', message })
    await new Promise<void>((resolve) => {
      this.pendingResume = resolve
    })
    this.pendingResume = null
    if (!this.stopRequested) {
      this.browser.setTitle('InboxScout Assistant — working… (you can take over any time)')
      this.setStatus('running', 'Continuing.')
      await this.browser.settle(1500)
    }
  }

  private async perform(action: AgentAction, task: AgentTask): Promise<{ note: string; finished?: boolean; summary?: string }> {
    switch (action.kind) {
      case 'navigate': {
        if (task.autonomy !== 'full' && !hostAllowed(action.url, task.allowedDomains)) {
          return { note: `refused: ${action.url} is outside the allowed sites` }
        }
        await this.browser.navigate(action.url)
        return { note: `navigated to ${action.url}` }
      }
      case 'click':
        return { note: await this.browser.click(action.id) }
      case 'type': {
        const signin = task.autonomy !== 'careful' ? task.signin : null
        const { text, usedSecret } = applyPlaceholders(action.text, signin)
        if (usedSecret) this.signinAttempts++
        if (!signin && /\{\{(PASSWORD|EMAIL)\}\}/.test(action.text)) {
          return { note: 'no saved sign-in is available — use handoff so the person can sign in' }
        }
        const note = await this.browser.type(action.id, text, action.pressEnter)
        return { note: usedSecret ? `${note} (saved password)` : note }
      }
      case 'scroll':
        return { note: await this.browser.scroll(action.direction) }
      case 'wait':
        await new Promise((r) => setTimeout(r, Math.min(15, action.seconds) * 1000))
        return { note: `waited ${action.seconds}s` }
      case 'read':
        return { note: 'read the page' }
      case 'ask_user': {
        this.setStatus('waiting_answer', action.question)
        this.emit({ type: 'ask', question: action.question })
        const answer = await new Promise<string>((resolve) => {
          this.pendingAnswer = resolve
        })
        this.pendingAnswer = null
        if (this.stopRequested) return { note: 'stopped' }
        this.setStatus('running', 'Thanks — continuing.')
        return { note: `the person answered: ${answer}` }
      }
      case 'handoff':
        await this.handoff(action.reason)
        return { note: 'the person took over and then continued' }
      case 'done': {
        for (const [k, v] of Object.entries(action.captured ?? {})) if (v && !this.captured[k]) this.captured[k] = v
        this.setStatus('done', action.summary)
        this.emit({ type: 'done', captured: { ...this.captured }, message: action.summary })
        return { note: 'done', finished: true, summary: action.summary }
      }
      case 'fail':
        this.setStatus('failed', action.reason)
        return { note: 'failed', finished: true, summary: action.reason }
    }
  }

  closeWindow(): void {
    this.browser.close()
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function describe(a: AgentAction): string {
  switch (a.kind) {
    case 'navigate':
      return `open ${a.url}`
    case 'click':
      return `click [${a.id}]`
    case 'type':
      return `type "${a.text.slice(0, 40)}" into [${a.id}]${a.pressEnter ? ' + Enter' : ''}`
    case 'scroll':
      return `scroll ${a.direction}`
    case 'wait':
      return `wait ${a.seconds}s`
    case 'read':
      return 'read page'
    case 'ask_user':
      return `ask: ${a.question}`
    case 'handoff':
      return `hand off: ${a.reason}`
    case 'done':
      return `done: ${a.summary}`
    case 'fail':
      return `give up: ${a.reason}`
  }
}
