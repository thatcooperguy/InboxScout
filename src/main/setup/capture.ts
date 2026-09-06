/**
 * Electron-free part of the Setup Assistant: step definitions and the
 * credential capture regexes (unit-tested).
 */

export type SetupKind = 'google' | 'microsoft'

export interface SetupStep {
  title: string
  detail: string
  url: string
  /** Which captured field completes this step, if any. */
  captures?: 'googleClientId' | 'googleClientSecret' | 'microsoftClientId'
}

export interface Captured {
  googleClientId?: string
  googleClientSecret?: string
  microsoftClientId?: string
}

export const GOOGLE_STEPS: SetupStep[] = [
  {
    title: 'Create (or pick) a Google Cloud project',
    detail: 'Name it "InboxScout". If you already have one, just select it in the top bar.',
    url: 'https://console.cloud.google.com/projectcreate'
  },
  {
    title: 'Enable the Gmail API',
    detail: 'Click the blue "Enable" button.',
    url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com'
  },
  {
    title: 'Set up the consent screen',
    detail: 'Choose "External", give the app the name InboxScout and your email, and save. Under Audience, add the Gmail addresses of the people who will use it as test users (or publish the app).',
    url: 'https://console.cloud.google.com/auth/overview'
  },
  {
    title: 'Create the OAuth client',
    detail: 'Application type: "Desktop app". Name: InboxScout. Click Create. When the "OAuth client created" box appears, InboxScout will grab the ID and secret automatically.',
    url: 'https://console.cloud.google.com/auth/clients/create',
    captures: 'googleClientId'
  }
]

export const MICROSOFT_STEPS: SetupStep[] = [
  {
    title: 'Register the app',
    detail: 'Name: InboxScout. Supported account types: "Personal Microsoft accounts only". Leave Redirect URI empty. Click Register. InboxScout will grab the Application (client) ID from the overview page automatically.',
    url: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade',
    captures: 'microsoftClientId'
  },
  {
    title: 'Allow public client flows',
    detail: 'On your app: Authentication → Advanced settings → "Allow public client flows" → Yes → Save.',
    url: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
  },
  {
    title: 'Add the Mail.Read permission',
    detail: 'API permissions → Add a permission → Microsoft Graph → Delegated → tick Mail.Read and User.Read → Add permissions.',
    url: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
  }
]

const GOOGLE_CLIENT_ID = /\b(\d{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com)\b/
const GOOGLE_SECRET = /\b(GOCSPX-[A-Za-z0-9_-]{20,})\b/
const GUID = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

/** Pure: find credentials in page text. Exported for tests. */
export function extractCredentials(kind: SetupKind, text: string): Captured {
  const out: Captured = {}
  if (kind === 'google') {
    const id = text.match(GOOGLE_CLIENT_ID)
    const secret = text.match(GOOGLE_SECRET)
    if (id) out.googleClientId = id[1]
    if (secret) out.googleClientSecret = secret[1]
  } else {
    // Prefer the GUID that follows the "Application (client) ID" label.
    const labelled = text.match(/Application \(client\) ID\s*:?\s*([0-9a-f-]{36})/i)
    const any = labelled ?? text.match(GUID)
    if (any) out.microsoftClientId = any[1].toLowerCase()
  }
  return out
}

const APP_PASSWORD_PATTERNS: Record<'gmail' | 'yahoo' | 'icloud', RegExp> = {
  // Google shows "abcd efgh ijkl mnop" in a box; Yahoo shows 16 lowercase letters; Apple shows xxxx-xxxx-xxxx-xxxx.
  gmail: /\b([a-z]{4})[  ]?([a-z]{4})[  ]?([a-z]{4})[  ]?([a-z]{4})\b/,
  yahoo: /\b([a-z]{16})\b/,
  icloud: /\b([a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4})\b/
}

const COMMON_WORDS = new Set(
  (
    'this that with from your have more will been they when what here sign code name mail save help back next done page user info ' +
    'menu home data true null json html text link copy open file edit view list type size time date year week left last long only ' +
    'also into over such than then them were some most many much make like just take know good well work need want look find give ' +
    'keep send read show turn step your'
  ).split(' ')
)

/** Pull a freshly generated app password out of page text (null when not visible). */
export function extractAppPassword(provider: 'gmail' | 'yahoo' | 'icloud', text: string): string | null {
  const re = new RegExp(APP_PASSWORD_PATTERNS[provider].source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (provider === 'gmail') {
      const groups = [m[1], m[2], m[3], m[4]]
      // Four real words in a row ("this that with your") are not a password.
      if (groups.filter((g) => COMMON_WORDS.has(g)).length >= 2) continue
      return groups.join('')
    }
    if (provider === 'yahoo') {
      const candidate = m[1]
      if (COMMON_WORDS.has(candidate.slice(0, 4)) && COMMON_WORDS.has(candidate.slice(4, 8))) continue
      return candidate
    }
    return m[1]
  }
  return null
}

