import { z } from 'zod'

/**
 * Electron-free brains of the Assistant browser: what the model sees, what it
 * may do, and the rules that keep it safe. Unit-tested.
 */

export const MAX_STEPS = 45

export interface PageElement {
  id: number
  tag: string
  role: string
  text: string
  name?: string
  type?: string
  href?: string
  value?: string
  placeholder?: string
}

export interface Observation {
  url: string
  title: string
  elements: PageElement[]
  text: string
  screenshotDataUrl?: string
}

export const actionSchema = z.object({
  thought: z.string().describe('One short sentence: what you see and why you are taking the next action'),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('navigate'), url: z.string() }),
    z.object({ kind: z.literal('click'), id: z.number().int() }),
    z.object({
      kind: z.literal('type'),
      id: z.number().int(),
      text: z.string(),
      pressEnter: z.boolean().default(false)
    }),
    z.object({ kind: z.literal('scroll'), direction: z.enum(['down', 'up']) }),
    z.object({ kind: z.literal('wait'), seconds: z.number().min(1).max(15) }),
    z.object({ kind: z.literal('read') }),
    z.object({ kind: z.literal('ask_user'), question: z.string() }),
    z.object({ kind: z.literal('handoff'), reason: z.string() }),
    z.object({
      kind: z.literal('done'),
      summary: z.string(),
      captured: z.record(z.string()).default({})
    }),
    z.object({ kind: z.literal('fail'), reason: z.string() })
  ])
})
export type AgentDecision = z.infer<typeof actionSchema>
export type AgentAction = AgentDecision['action']

/** Compact, numbered list of what can be clicked or typed into. */
export function formatElements(elements: PageElement[], max = 90): string {
  return elements
    .slice(0, max)
    .map((e) => {
      const bits = [`[${e.id}]`, e.role]
      const label = (e.text || e.name || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (label) bits.push(`"${label}"`)
      if (e.type && e.type !== 'text') bits.push(`type=${e.type}`)
      if (e.value) bits.push(`value="${e.value.slice(0, 40)}"`)
      if (e.href) bits.push(`→ ${e.href.slice(0, 80)}`)
      return bits.join(' ')
    })
    .join('\n')
}

/** "google.com" allows google.com and any subdomain. */
export function hostAllowed(url: string, allowed: string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return allowed.some((d) => {
    const dom = d.toLowerCase().replace(/^\*\./, '')
    return host === dom || host.endsWith(`.${dom}`)
  })
}

export type ScreenKind = 'login' | 'twofactor' | 'danger' | 'normal'

const LOGIN =
  /\b(enter your password|password\b.*\b(sign in|log in|next)|sign in to continue|log in to continue|use your (google|microsoft|apple|yahoo) account|choose an account|verify it'?s you)\b/i
const PASSWORD_FIELD = /type=password/i
const TWOFACTOR =
  /\b(2-step verification|two-factor|verification code|enter the code|authenticator|security key|approve (this )?sign[- ]in|check your phone|text message with a code|one-time code)\b/i
const DANGER =
  /\b(delete (your )?account|close (your )?account|payment method|card number|billing address|purchase|subscribe now|confirm payment|transfer money|wire|change (your )?password|remove all|factory reset)\b/i

/** Classify what is on screen so the runner can hand off or refuse. */
export function detectScreen(text: string, elementsText = ''): ScreenKind {
  const t = text.slice(0, 6000)
  if (TWOFACTOR.test(t)) return 'twofactor'
  if (PASSWORD_FIELD.test(elementsText) || LOGIN.test(t)) return 'login'
  if (DANGER.test(t)) return 'danger'
  return 'normal'
}

export interface RecipeParam {
  key: string
  label: string
  placeholder?: string
}

export interface Recipe {
  id: string
  name: string
  icon: string
  description: string
  params: RecipeParam[]
  goal: (p: Record<string, string>) => string
  startUrl: (p: Record<string, string>) => string
  allowedDomains: string[]
  /** What the run is expected to produce; the app finishes the job with it. */
  captures: 'appPassword' | 'googleClient' | 'microsoftClientId' | 'none'
  provider?: 'gmail' | 'yahoo' | 'icloud'
}

const READ_ONLY_RULE = 'Never change account settings other than what the goal asks. Never delete anything.'

export const RECIPES: Recipe[] = [
  {
    id: 'gmail-app-password',
    name: 'Connect Gmail (app password)',
    icon: '📧',
    description: "Signs the person in on Google's page, creates an app password named InboxScout, and connects the account.",
    params: [{ key: 'email', label: 'Gmail address', placeholder: 'you@gmail.com' }],
    goal: (p) =>
      `Create a Google app password for ${p.email} named "InboxScout". If Google says 2-Step Verification must be turned on first, ` +
      `help the person turn it on (hand off for phone verification), then return to the app passwords page. ` +
      `When the 16-character app password is shown, finish with done and put it in captured.appPassword (letters only, no spaces).`,
    startUrl: () => 'https://myaccount.google.com/apppasswords',
    allowedDomains: ['google.com', 'accounts.google.com', 'myaccount.google.com', 'gstatic.com', 'youtube.com'],
    captures: 'appPassword',
    provider: 'gmail'
  },
  {
    id: 'yahoo-app-password',
    name: 'Connect Yahoo Mail (app password)',
    icon: '📮',
    description: 'Creates a Yahoo app password named InboxScout and connects the account.',
    params: [{ key: 'email', label: 'Yahoo address', placeholder: 'you@yahoo.com' }],
    goal: (p) =>
      `On Yahoo Account Security for ${p.email}, open "Generate and manage app passwords", create one named "InboxScout", ` +
      `and when the 16-character password is displayed finish with done and captured.appPassword (letters only).`,
    startUrl: () => 'https://login.yahoo.com/myaccount/security/app-password/',
    allowedDomains: ['yahoo.com', 'login.yahoo.com', 'yimg.com', 'aol.com'],
    captures: 'appPassword',
    provider: 'yahoo'
  },
  {
    id: 'icloud-app-password',
    name: 'Connect iCloud Mail (app-specific password)',
    icon: '🍎',
    description: 'Creates an Apple app-specific password named InboxScout and connects the account.',
    params: [{ key: 'email', label: 'iCloud address', placeholder: 'you@icloud.com' }],
    goal: (p) =>
      `On the Apple Account page for ${p.email}, open Sign-In and Security → App-Specific Passwords, generate one named "InboxScout", ` +
      `and when the password (format xxxx-xxxx-xxxx-xxxx) is displayed finish with done and captured.appPassword.`,
    startUrl: () => 'https://account.apple.com/account/manage',
    allowedDomains: ['apple.com', 'account.apple.com', 'appleid.apple.com', 'icloud.com'],
    captures: 'appPassword',
    provider: 'icloud'
  },
  {
    id: 'google-oauth-client',
    name: 'Register the Google sign-in app (one-time, owner)',
    icon: '🔵',
    description: 'Creates the Google Cloud project, enables the Gmail API, sets up the consent screen, and creates a Desktop OAuth client.',
    params: [{ key: 'email', label: 'Your Google account (owner)', placeholder: 'you@gmail.com' }],
    goal: (p) =>
      `In Google Cloud Console as ${p.email}: (1) create or select a project named InboxScout; (2) enable the Gmail API; ` +
      `(3) configure the OAuth consent screen: External, app name InboxScout, support email ${p.email}, add scope gmail.readonly, add ${p.email} as a test user; ` +
      `(4) create an OAuth client ID of type Desktop app named InboxScout. When the "OAuth client created" dialog shows the Client ID and Client secret, ` +
      `finish with done and put them in captured.googleClientId and captured.googleClientSecret.`,
    startUrl: () => 'https://console.cloud.google.com/projectcreate',
    allowedDomains: ['console.cloud.google.com', 'cloud.google.com', 'accounts.google.com', 'google.com', 'gstatic.com'],
    captures: 'googleClient'
  },
  {
    id: 'google-add-test-user',
    name: 'Add a family member to the Google sign-in (owner)',
    icon: '👥',
    description: 'Adds an email address as a test user on the InboxScout consent screen so they can use Sign in with Google.',
    params: [{ key: 'email', label: 'Email address to add', placeholder: 'mom@gmail.com' }],
    goal: (p) =>
      `In the Google Cloud Console project named InboxScout, open the OAuth consent screen / Audience page and add ${p.email} as a test user. ` +
      `Finish with done when it appears in the test users list.`,
    startUrl: () => 'https://console.cloud.google.com/auth/audience',
    allowedDomains: ['console.cloud.google.com', 'cloud.google.com', 'accounts.google.com', 'google.com', 'gstatic.com'],
    captures: 'none'
  },
  {
    id: 'microsoft-app',
    name: 'Register the Microsoft sign-in app (one-time, owner)',
    icon: '🟦',
    description: 'Registers InboxScout in Microsoft Entra, allows public client flows, adds Mail.Read, and captures the app ID.',
    params: [{ key: 'email', label: 'Your Microsoft account (owner)', placeholder: 'you@outlook.com' }],
    goal: (p) =>
      `In Microsoft Entra as ${p.email}: register a new application named InboxScout with "Personal Microsoft accounts only" and no redirect URI; ` +
      `then under Authentication set "Allow public client flows" to Yes and save; then under API permissions add Microsoft Graph delegated Mail.Read and User.Read. ` +
      `Finish with done and put the Application (client) ID in captured.microsoftClientId.`,
    startUrl: () => 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade',
    allowedDomains: [
      'entra.microsoft.com',
      'portal.azure.com',
      'login.microsoftonline.com',
      'login.live.com',
      'microsoft.com',
      'microsoftonline.com',
      'msauth.net',
      'msftauth.net'
    ],
    captures: 'microsoftClientId'
  }
]

export type Autonomy = 'careful' | 'signin' | 'full'

/** Stand-ins the model types; the runner swaps in the real values so the model never sees a password. */
export const EMAIL_PLACEHOLDER = '{{EMAIL}}'
export const PASSWORD_PLACEHOLDER = '{{PASSWORD}}'

export interface SavedSignin {
  email: string
  password: string
}

/** Replace placeholders with the saved sign-in (used only at the moment of typing). */
export function applyPlaceholders(text: string, signin: SavedSignin | null): { text: string; usedSecret: boolean } {
  if (!signin) return { text, usedSecret: false }
  const usedSecret = text.includes(PASSWORD_PLACEHOLDER)
  return {
    text: text.split(PASSWORD_PLACEHOLDER).join(signin.password).split(EMAIL_PLACEHOLDER).join(signin.email),
    usedSecret
  }
}

/** Make sure a real password never lands in logs or history. */
export function redactSecret(text: string, signin: SavedSignin | null): string {
  if (!signin || !signin.password) return text
  return text.split(signin.password).join('••••••••')
}

export interface PromptOptions {
  autonomy?: Autonomy
  /** Email of the saved sign-in available to this run (never the password). */
  signinEmail?: string | null
}

export function buildSystemPrompt(rules: string[], opts: PromptOptions = {}): string {
  const autonomy = opts.autonomy ?? 'careful'
  const canSignIn = autonomy !== 'careful' && !!opts.signinEmail
  const lines = [
    "You are InboxScout's Assistant browser: you operate a web browser on behalf of a non-technical person to complete one clearly stated goal.",
    'You see the current page as a numbered list of interactive elements (and sometimes a screenshot). Act one step at a time.',
    '',
    'Rules:',
    '- Use element ids from the list. Prefer clicking the most specific matching element. Type into inputs by id.'
  ]
  if (canSignIn) {
    lines.push(
      `- A saved sign-in for ${opts.signinEmail} is available. On a sign-in page, type ${EMAIL_PLACEHOLDER} into the email/username field and ${PASSWORD_PLACEHOLDER} into the password field (exactly those placeholders — the app swaps in the real values; you never see the password). Press Enter or click Next/Sign in afterwards.`,
      '- If a verification code, phone approval, or security key is requested, use handoff — only the person can do that. If the saved password is rejected twice, use handoff.'
    )
  } else {
    lines.push(
      '- If the page asks for a password, a verification code, or to approve a sign-in on a phone, use handoff — the person will sign in themselves. You never know or type passwords.'
    )
  }
  if (autonomy === 'full') {
    lines.push(
      '- You may proceed through confirmation pages (payments, deletions, password changes) ONLY when the goal clearly asks for it; otherwise ask_user first. Never change settings the goal did not ask for.'
    )
  } else {
    lines.push('- Never enter payment details, never delete accounts or data, never change settings the goal did not ask for.')
  }
  lines.push(
    '- If you are unsure what the person wants, use ask_user with one clear question.',
    '- If the page has not changed after an action, try a different element, scroll, or wait once — do not repeat the same action more than twice.',
    '- When the goal is achieved, use done with a plain-language summary and any captured values. If it cannot be achieved, use fail with the reason.',
    ...rules.map((r) => `- ${r}`)
  )
  return lines.join('\n')
}

export interface PromptContext {
  goal: string
  url: string
  title: string
  screen: ScreenKind
  elements: PageElement[]
  pageText: string
  history: string[]
  captured: Record<string, string>
  userNotes: string[]
  step: number
}

export function buildStepPrompt(ctx: PromptContext): string {
  const lines: string[] = []
  lines.push(`GOAL: ${ctx.goal}`, '')
  if (ctx.userNotes.length) lines.push('Notes from the person:', ...ctx.userNotes.map((n) => `- ${n}`), '')
  if (Object.keys(ctx.captured).length) lines.push(`Already captured: ${JSON.stringify(ctx.captured)}`, '')
  lines.push(`Step ${ctx.step} of ${MAX_STEPS}.`, `Current page: ${ctx.title} — ${ctx.url}`, `Screen type: ${ctx.screen}`, '')
  if (ctx.history.length) lines.push('Recent actions and results:', ...ctx.history.slice(-8).map((h) => `- ${h}`), '')
  lines.push('Interactive elements:', formatElements(ctx.elements) || '(none found — try scroll, wait, or read)', '')
  lines.push('Visible text (truncated):', ctx.pageText.slice(0, 2500), '', 'Decide the single next action.')
  return lines.join('\n')
}

export const ASSISTANT_RULES = [READ_ONLY_RULE]
