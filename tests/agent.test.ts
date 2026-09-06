import { describe, expect, it } from 'vitest'
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
      const p = { email: 'me@example.com' }
      expect(r.goal(p).length).toBeGreaterThan(20)
      expect(hostAllowed(r.startUrl(p), r.allowedDomains)).toBe(true)
    }
    expect(RECIPES.find((r) => r.id === 'gmail-app-password')?.captures).toBe('appPassword')
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
