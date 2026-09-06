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
import type { DesktopControl } from '../desktop/control'

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
  /** Full system control (desktop input, apps, commands, files). Null when unavailable. */
  desktop?: DesktopControl | null
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
  /**
   * Full system control for this run (Settings → Who can help → systemControl === 'on'). Optional so older callers keep
   * working; the runner treats a missing value as true and still requires deps.desktop to actually do anything.
   */
  systemControl?: boolean
}

/** Most sign-in attempts with the saved password before handing off. */
const MAX_SIGNIN_ATTEMPTS = 2

/** Who is asking, as shown in the permission popups. */
const REQUESTER = 'the Assistant'

/** How many steps a desktop screenshot stays in the model's view before it must take a fresh one. */
const DESKTOP_SHOT_TTL = 3

/** What DesktopControl.screenshot() returns. */
type DesktopShot = Awaited<ReturnType<DesktopControl['screenshot']>>

interface LastDesktopShot {
  dataUrl: string
  scaleX: number
  scaleY: number
  stepsLeft: number
}

const SYSTEM_CONTROL_OFF = 'system control is off (Settings → Who can help)'

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
  /** Most recent desktop screenshot, shown to the model for a few steps; click coordinates are scaled through it. */
  private lastDesktopShot: LastDesktopShot | null = null

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
    this.lastDesktopShot = null
    const canSignIn = task.autonomy !== 'careful' && !!task.signin
    const systemControl = (task.systemControl ?? true) && !!this.deps.desktop
    this.setStatus(
      'running',
      `Starting: ${task.recipe?.name ?? 'custom task'}` + (canSignIn ? ` (will sign in as ${task.signin!.email})` : '')
    )
    this.browser.open(task.startUrl)
    await this.browser.settle(2500)

    const system = buildSystemPrompt(ASSISTANT_RULES, {
      autonomy: task.autonomy,
      signinEmail: canSignIn ? task.signin!.email : null,
      systemControl
    })
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
        const parts: any[] = [{ type: 'text', text: prompt }]
        if (obs.screenshotDataUrl) parts.push({ type: 'image', image: obs.screenshotDataUrl, mediaType: 'image/png' })
        const deskShot = this.currentDesktopShot()
        if (backend.vision && deskShot) {
          parts.push(
            { type: 'text', text: 'Desktop screenshot (click coordinates refer to this image)' },
            { type: 'image', image: deskShot.dataUrl, mediaType: 'image/png' }
          )
          deskShot.stepsLeft -= 1
          if (deskShot.stepsLeft <= 0) this.lastDesktopShot = null
        }
        const messages: any[] = [{ role: 'user', content: parts.length > 1 ? parts : prompt }]
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
        this.emit({ type: 'step', step, message: `${step}. ${object.thought} → ${describeAction(action)}` })

        const result = await this.perform(action, task)
        if (result.finished) {
          summary = result.summary ?? ''
          break
        }
        this.history.push(`${describeAction(action)} ⇒ ${redactSecret(result.note, task.signin)}`)
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

  /** Read through a method so TypeScript does not narrow the field to null across the step loop (perform() mutates it). */
  private currentDesktopShot(): LastDesktopShot | null {
    return this.lastDesktopShot
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
      case 'desktop_screenshot':
      case 'desktop_click':
      case 'desktop_type':
      case 'desktop_key':
      case 'open':
      case 'run':
      case 'file_read':
      case 'file_write':
      case 'file_list':
        return this.performDesktop(action, task)
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

  /**
   * Whole-computer actions. Every call may pop up a permission question; a "no" comes back as a
   * consent_denied error, which becomes a "not allowed" note the model is told never to retry.
   */
  private async performDesktop(
    action: Extract<
      AgentAction,
      { kind: 'desktop_screenshot' | 'desktop_click' | 'desktop_type' | 'desktop_key' | 'open' | 'run' | 'file_read' | 'file_write' | 'file_list' }
    >,
    task: AgentTask
  ): Promise<{ note: string }> {
    const desktop = this.deps.desktop
    if (!desktop || !(task.systemControl ?? true)) return { note: SYSTEM_CONTROL_OFF }
    try {
      switch (action.kind) {
        case 'desktop_screenshot': {
          // The stub still types screenshot() as Promise<string>; the real implementation returns this shape.
          const shot: DesktopShot = await desktop.screenshot(REQUESTER)
          this.lastDesktopShot = {
            dataUrl: shot.dataUrl,
            scaleX: shot.width ? shot.screenWidth / shot.width : 1,
            scaleY: shot.height ? shot.screenHeight / shot.height : 1,
            stepsLeft: DESKTOP_SHOT_TTL
          }
          this.emit({ type: 'step', message: `📷 looked at the screen (${shot.screenWidth}×${shot.screenHeight})` })
          return { note: `took a desktop screenshot (${shot.width}×${shot.height} image of a ${shot.screenWidth}×${shot.screenHeight} screen)` }
        }
        case 'desktop_click': {
          const shot = this.lastDesktopShot
          const x = Math.round(action.x * (shot?.scaleX ?? 1))
          const y = Math.round(action.y * (shot?.scaleY ?? 1))
          const note = await desktop.click(x, y, REQUESTER, { double: action.double })
          this.emit({ type: 'step', message: `🖱 ${action.double ? 'double-clicked' : 'clicked'} the desktop at ${action.x},${action.y}` })
          return { note: `${note || 'clicked'} at ${x},${y} on screen` }
        }
        case 'desktop_type': {
          const signin = task.autonomy !== 'careful' ? task.signin : null
          const { text, usedSecret } = applyPlaceholders(action.text, signin)
          if (!signin && /\{\{(PASSWORD|EMAIL)\}\}/.test(action.text)) {
            return { note: 'no saved sign-in is available — use handoff so the person can sign in' }
          }
          const note = await desktop.type(text, REQUESTER)
          this.emit({ type: 'step', message: `⌨ typed ${text.length} characters on the desktop` })
          return { note: `${note || 'typed'}${usedSecret ? ' (saved password)' : ''}` }
        }
        case 'desktop_key': {
          const note = await desktop.key(action.combo, REQUESTER)
          this.emit({ type: 'step', message: `⌨ pressed ${action.combo}` })
          return { note: note || `pressed ${action.combo}` }
        }
        case 'open': {
          const note = await desktop.open(action.target, REQUESTER)
          this.emit({ type: 'step', message: `🖥 opened ${action.target}` })
          return { note: note || `opened ${action.target}` }
        }
        case 'run': {
          const r = await desktop.run(action.command, REQUESTER, {})
          this.emit({ type: 'step', message: `▶ ran: ${action.command.slice(0, 80)} (exit ${r.code ?? 'none'}${r.timedOut ? ', timed out' : ''})` })
          return {
            note: `exit ${r.code ?? 'none'}${r.timedOut ? ' (timed out)' : ''}; stdout: ${r.stdout.slice(0, 1500)}; stderr: ${r.stderr.slice(0, 500)}`
          }
        }
        case 'file_read': {
          const text = await desktop.readFile(action.path, REQUESTER)
          this.emit({ type: 'step', message: `📄 read ${action.path}` })
          return { note: `contents of ${action.path} (${text.length} chars${text.length > 4000 ? ', truncated' : ''}):\n${text.slice(0, 4000)}` }
        }
        case 'file_write': {
          const note = await desktop.writeFile(action.path, action.text, REQUESTER)
          this.emit({ type: 'step', message: `💾 wrote ${action.text.length} characters to ${action.path}` })
          return { note: note || `wrote ${action.path}` }
        }
        case 'file_list': {
          const entries = await desktop.listDir(action.path, REQUESTER)
          this.emit({ type: 'step', message: `📁 listed ${action.path} (${entries.length} items)` })
          const lines = entries.slice(0, 200).map((e) => `${e.dir ? '[dir] ' : ''}${e.name}${e.dir ? '' : ` (${e.size} bytes)`}`)
          return { note: `${action.path} contains ${entries.length} items:\n${lines.join('\n') || '(empty)'}` }
        }
      }
    } catch (err: any) {
      const message = String(err?.message ?? err)
      if (message.startsWith('consent_denied:')) {
        const reason = message.slice('consent_denied:'.length).trim()
        this.emit({ type: 'step', message: `🚫 not allowed by the person: ${reason}` })
        return { note: `not allowed by the person: ${reason}` }
      }
      return { note: `failed: ${message}` }
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

/** One line per action for the live log and the model's history. Exported for tests. */
export function describeAction(a: AgentAction): string {
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
    case 'desktop_screenshot':
      return 'look at the screen'
    case 'desktop_click':
      return `${a.double ? 'double-click' : 'click'} the desktop at ${a.x},${a.y}`
    case 'desktop_type':
      return `type "${a.text.slice(0, 40)}" on the desktop`
    case 'desktop_key':
      return `press ${a.combo}`
    case 'open':
      return `open on this computer: ${a.target}`
    case 'run':
      return `run: ${a.command.slice(0, 80)}`
    case 'file_read':
      return `read file ${a.path}`
    case 'file_write':
      return `write file ${a.path}`
    case 'file_list':
      return `list folder ${a.path}`
    case 'done':
      return `done: ${a.summary}`
    case 'fail':
      return `give up: ${a.reason}`
  }
}
