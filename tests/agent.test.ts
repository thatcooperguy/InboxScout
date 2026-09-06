import { describe, expect, it, vi } from 'vitest'
import {
  EMAIL_PLACEHOLDER,
  PASSWORD_PLACEHOLDER,
  RECIPES,
  actionSchema,
  applyPlaceholders,
  buildStepPrompt,
  buildSystemPrompt,
  detectScreen,
  formatElements,
  hostAllowed,
  redactSecret
} from '../src/main/agent/policy'
import { extractAppPassword } from '../src/main/setup/capture'

// runner.ts pulls in the Assistant's Electron browser window; only describeAction is under test here.
vi.mock('electron', () => ({ BrowserWindow: class {} }))
import { describeAction } from '../src/main/agent/runner'

describe('agent policy', () => {
  it('formats elements compactly with ids the model can reference', () => {
    const text = formatElements([
      { id: 1, tag: 'button', role: 'button', text: 'Create' },
      { id: 2, tag: 'input', role: 'input', text: '', placeholder: 'App name', type: 'text' },
      { id: 3, tag: 'a', role: 'link', text: 'Security', href: '/security' }
    ])
    expect(text).toContain('[1] button "Create"')
    expect(text).toContain('[2] input "App name"')
    expect(text).toContain('[3] link "Security" → /security')
  })

  it('allows only the recipe\'s domains and their subdomains', () => {
    const allowed = ['google.com', 'myaccount.google.com']
    expect(hostAllowed('https://myaccount.google.com/apppasswords', allowed)).toBe(true)
    expect(hostAllowed('https://accounts.google.com/signin', allowed)).toBe(true)
    expect(hostAllowed('https://evil-google.com/', allowed)).toBe(false)
    expect(hostAllowed('not a url', allowed)).toBe(false)
  })

  it('detects sign-in, verification, and dangerous screens', () => {
    expect(detectScreen('Welcome back. Enter your password to continue', '')).toBe('login')
    expect(detectScreen('Nothing special', '[4] input type=password')).toBe('login')
    expect(detectScreen('2-Step Verification: enter the code we sent to your phone', '')).toBe('twofactor')
    expect(detectScreen('Add a payment method. Card number:', '')).toBe('danger')
    expect(detectScreen('App passwords let you sign in to apps', '[1] button "Create"')).toBe('normal')
  })

  it('validates model decisions against the action schema', () => {
    expect(actionSchema.safeParse({ thought: 'ok', action: { kind: 'click', id: 3 } }).success).toBe(true)
    expect(actionSchema.safeParse({ thought: 'ok', action: { kind: 'type', id: 2, text: 'InboxScout' } }).success).toBe(true)
    expect(actionSchema.safeParse({ thought: 'ok', action: { kind: 'done', summary: 'finished', captured: { appPassword: 'abcd' } } }).success).toBe(true)
    expect(actionSchema.safeParse({ thought: 'ok', action: { kind: 'explode' } }).success).toBe(false)
    expect(actionSchema.safeParse({ thought: 'ok', action: { kind: 'wait', seconds: 99 } }).success).toBe(false)
  })

  it('accepts every whole-computer action', () => {
    const ok = (action: unknown): boolean => actionSchema.safeParse({ thought: 'ok', action }).success
    expect(ok({ kind: 'desktop_screenshot' })).toBe(true)
    expect(ok({ kind: 'desktop_click', x: 120, y: 340 })).toBe(true)
    expect(ok({ kind: 'desktop_click', x: 120, y: 340, double: true })).toBe(true)
    expect(ok({ kind: 'desktop_type', text: 'hello' })).toBe(true)
    expect(ok({ kind: 'desktop_key', combo: 'ctrl+s' })).toBe(true)
    expect(ok({ kind: 'open', target: '/Users/me/Documents/brief.html' })).toBe(true)
    expect(ok({ kind: 'run', command: 'ls -la' })).toBe(true)
    expect(ok({ kind: 'file_read', path: '/Users/me/notes.txt' })).toBe(true)
    expect(ok({ kind: 'file_write', path: '/Users/me/notes.txt', text: 'remember milk' })).toBe(true)
    expect(ok({ kind: 'file_list', path: '/Users/me/Documents' })).toBe(true)
    // Missing required fields are rejected.
    expect(ok({ kind: 'desktop_click', x: 1 })).toBe(false)
    expect(ok({ kind: 'run' })).toBe(false)
    expect(ok({ kind: 'file_write', path: '/Users/me/notes.txt' })).toBe(false)
  })

  it('mentions the desktop only when system control is on', () => {
    const off = buildSystemPrompt([])
    expect(off).not.toContain('desktop_screenshot')
    expect(off).not.toContain('whole computer')
    expect(buildSystemPrompt([], { systemControl: false })).not.toContain('desktop_screenshot')
    const on = buildSystemPrompt([], { systemControl: true })
    expect(on).toContain('whole computer')
    expect(on).toContain('desktop_screenshot')
    expect(on).toContain('Prefer the browser actions')
    expect(on).toContain('not allowed')
    expect(on).toContain('never retry')
    expect(on).toContain('destructive')
  })

  it('describes every whole-computer action for the log', () => {
    expect(describeAction({ kind: 'desktop_screenshot' })).toBe('look at the screen')
    expect(describeAction({ kind: 'desktop_click', x: 10, y: 20 })).toBe('click the desktop at 10,20')
    expect(describeAction({ kind: 'desktop_click', x: 10, y: 20, double: true })).toBe('double-click the desktop at 10,20')
    expect(describeAction({ kind: 'desktop_type', text: 'hello' })).toContain('type "hello" on the desktop')
    expect(describeAction({ kind: 'desktop_key', combo: 'enter' })).toBe('press enter')
    expect(describeAction({ kind: 'open', target: 'Notes' })).toBe('open on this computer: Notes')
    expect(describeAction({ kind: 'run', command: 'ls' })).toBe('run: ls')
    expect(describeAction({ kind: 'file_read', path: '/a/b.txt' })).toBe('read file /a/b.txt')
    expect(describeAction({ kind: 'file_write', path: '/a/b.txt', text: 'x' })).toBe('write file /a/b.txt')
    expect(describeAction({ kind: 'file_list', path: '/a' })).toBe('list folder /a')
    // The browser actions still describe as before.
    expect(describeAction({ kind: 'click', id: 3 })).toBe('click [3]')
    expect(describeAction({ kind: 'navigate', url: 'https://x.test' })).toBe('open https://x.test')
  })

  it('builds prompts that carry the goal, elements, history, and rules', () => {
    const system = buildSystemPrompt(['Extra rule here'])
    expect(system).toContain('never know or type passwords')
    expect(system).toContain('Extra rule here')
    const prompt = buildStepPrompt({
      goal: 'Create an app password',
      url: 'https://myaccount.google.com/apppasswords',
      title: 'App passwords',
      screen: 'normal',
      elements: [{ id: 1, tag: 'button', role: 'button', text: 'Create' }],
      pageText: 'App passwords',
      history: ['click [7] ⇒ clicked Security'],
      captured: {},
      userNotes: ['My account is the second one'],
      step: 3
    })
    expect(prompt).toContain('GOAL: Create an app password')
    expect(prompt).toContain('[1] button "Create"')
    expect(prompt).toContain('click [7] ⇒ clicked Security')
    expect(prompt).toContain('My account is the second one')
    expect(prompt).toContain('Step 3 of')
  })

  it('tells the model about saved sign-ins only when autonomy allows, without the password', () => {
    const careful = buildSystemPrompt([], { autonomy: 'careful', signinEmail: 'mom@gmail.com' })
    expect(careful).toContain('never know or type passwords')
    expect(careful).not.toContain(PASSWORD_PLACEHOLDER)
    const signin = buildSystemPrompt([], { autonomy: 'signin', signinEmail: 'mom@gmail.com' })
    expect(signin).toContain('mom@gmail.com')
    expect(signin).toContain(PASSWORD_PLACEHOLDER)
    expect(signin).toContain(EMAIL_PLACEHOLDER)
    expect(signin).toContain('Never enter payment details')
    const full = buildSystemPrompt([], { autonomy: 'full', signinEmail: 'mom@gmail.com' })
    expect(full).toContain('ONLY when the goal clearly asks')
    // No saved sign-in → still hands off even at full autonomy.
    expect(buildSystemPrompt([], { autonomy: 'full', signinEmail: null })).toContain('never know or type passwords')
  })

  it('swaps placeholders at the keyboard and keeps the password out of logs', () => {
    const signin = { email: 'mom@gmail.com', password: 's3cret!' }
    expect(applyPlaceholders(`${EMAIL_PLACEHOLDER}`, signin)).toEqual({ text: 'mom@gmail.com', usedSecret: false })
    expect(applyPlaceholders(`${PASSWORD_PLACEHOLDER}`, signin)).toEqual({ text: 's3cret!', usedSecret: true })
    expect(applyPlaceholders('InboxScout', signin)).toEqual({ text: 'InboxScout', usedSecret: false })
    expect(applyPlaceholders(PASSWORD_PLACEHOLDER, null).text).toBe(PASSWORD_PLACEHOLDER)
    expect(redactSecret('typed s3cret! into [4]', signin)).toBe('typed •••••••• into [4]')
    expect(redactSecret('nothing', null)).toBe('nothing')
  })

  it('ships recipes with goals, start pages, and allowed domains that match', () => {
    for (const r of RECIPES) {
      const p = { email: 'me@example.com', reportsDir: '/Users/me/Documents/InboxScout' }
      expect(r.goal(p).length).toBeGreaterThan(20)
      const start = r.startUrl(p)
      // Desktop-only recipes start on a blank page and need no web domains.
      if (start !== 'about:blank') expect(hostAllowed(start, r.allowedDomains)).toBe(true)
    }
    expect(RECIPES.find((r) => r.id === 'gmail-app-password')?.captures).toBe('appPassword')
    const latest = RECIPES.find((r) => r.id === 'open-latest-brief')
    expect(latest?.captures).toBe('none')
    expect(latest?.params.map((x) => x.key)).toEqual(['reportsDir'])
    expect(latest?.goal({ reportsDir: '/tmp/reports' })).toContain('file_list')
    expect(latest?.goal({ reportsDir: '/tmp/reports' })).toContain('/tmp/reports')
    expect(RECIPES.find((r) => r.id === 'open-exports-folder')?.goal({ reportsDir: '/tmp/reports' })).toContain('/tmp/reports')
  })
})

describe('extractAppPassword', () => {
  it('reads a Google app password shown in four groups', () => {
    const page = 'Your app password for your device\n\nabcd efgh ijkl mnop\n\nHow to use it'
    expect(extractAppPassword('gmail', page)).toBe('abcdefghijklmnop')
  })
  it('ignores ordinary four-letter words in a row', () => {
    expect(extractAppPassword('gmail', 'this that with your account here')).toBeNull()
  })
  it('reads Yahoo and Apple formats', () => {
    expect(extractAppPassword('yahoo', 'Here is your password: qwertyuiopasdfgh use it in the app')).toBe('qwertyuiopasdfgh')
    expect(extractAppPassword('icloud', 'App-specific password: abcd-efgh-ijkl-mnop')).toBe('abcd-efgh-ijkl-mnop')
    expect(extractAppPassword('icloud', 'nothing here')).toBeNull()
  })
})
