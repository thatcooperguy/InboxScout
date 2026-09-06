/**
 * The terms shown once at first launch, in plain language. Bump EULA_VERSION
 * when the text changes in a way people should see again.
 */
export const EULA_VERSION = '2026-09'

export interface EulaSection {
  title: string
  body: string
}

export const EULA_SECTIONS: EulaSection[] = [
  {
    title: 'What InboxScout does',
    body:
      'InboxScout reads the email accounts you connect and writes you a short brief of what needs you. It reads only — it can never send, delete, or change your mail.'
  },
  {
    title: 'Where your data lives',
    body:
      'Your mail, passwords, and keys stay on this computer, encrypted with the operating system. Nothing is sent anywhere unless you connect an AI helper (then the text of your mail goes to that service) or turn on a delivery option (email, text, Google Drive, or another agent).'
  },
  {
    title: 'The Assistant can use your computer',
    body:
      'InboxScout includes an assistant that can do chores for you: open websites and sign in with sign-ins you save, create app passwords, open apps and files, type and click on your desktop, run commands, and read or write files under your home folder. It is on by default. The first time it does each kind of thing, a popup asks you (Allow once, Always allow, or Don’t allow). Anything dangerous — deleting things, changing passwords, paying, shutting down — always asks first. You can turn all of this off in Settings → Helpers.'
  },
  {
    title: 'Other agents',
    body:
      'If you turn on the Agent bridge, other AI tools on this computer (for example Hermes) can use InboxScout as a tool, including the abilities above. It is off until you switch it on, and a key is required.'
  },
  {
    title: 'It makes mistakes',
    body:
      'InboxScout guesses what is important, who people are, and what dates mean. It will sometimes be wrong. Check anything that matters before acting on it. Every screen has a way to correct it.'
  },
  {
    title: 'Free software, no warranty',
    body:
      'InboxScout is provided free under the Functional Source License (FSL-1.1-MIT), as is, without warranty of any kind. You use it at your own risk. The full license is in LICENSE.md.'
  }
]

export const EULA_ACCEPT_LINE = 'I understand, and I agree to these terms.'

/**
 * Opt-in choices shown with the terms. Each says what will happen and why.
 * Defaults follow the owner's decision: opted in = full autonomy (no popups
 * for the kinds you tick), while dangerous actions still ask unless you also
 * tick the override. Every choice can be changed later in Settings → Who can help.
 */
export type EulaOptionId = 'systemControl' | 'screenshot' | 'input' | 'open' | 'run' | 'files' | 'dangerousOverride'

export interface EulaOption {
  id: EulaOptionId
  label: string
  /** What will happen if this is on. */
  what: string
  /** Why we ask for it. */
  why: string
  default: boolean
  /** Sub-options belong to the master switch and are disabled when it is off. */
  parent?: 'systemControl'
  /** Shown in red; for the override only. */
  warning?: string
}

export const EULA_OPTIONS: EulaOption[] = [
  {
    id: 'systemControl',
    label: 'Let InboxScout use my computer',
    what: 'The Assistant (and any agent you connect later, like Hermes) may act on this computer for you, not only inside its own browser window.',
    why: 'So chores actually finish — opening the file, pasting the numbers, saving the export — without you doing the last step by hand.',
    default: true
  },
  {
    id: 'screenshot',
    label: 'Look at my screen',
    what: 'Takes a picture of the screen when it needs to see where things are. The picture stays on this computer unless you connected an AI helper that sees images.',
    why: 'That is how it finds buttons and windows outside its own browser.',
    default: true,
    parent: 'systemControl'
  },
  {
    id: 'input',
    label: 'Use my keyboard and mouse',
    what: 'Clicks and types on your desktop, in whatever app is in front.',
    why: 'Needed for apps that have no other way in — a spreadsheet, a company portal, a print dialog.',
    default: true,
    parent: 'systemControl'
  },
  {
    id: 'open',
    label: 'Open apps, files, and links',
    what: 'Opens things with the app you normally use for them.',
    why: 'The simplest way to hand you a file, a folder, or a web page.',
    default: true,
    parent: 'systemControl'
  },
  {
    id: 'run',
    label: 'Run commands',
    what: 'Runs commands on this computer, in your home folder. Dangerous commands — deleting, formatting, shutting down, changing passwords, payments — always stop and ask first.',
    why: 'Some chores are one command; it is faster and more reliable than clicking through.',
    default: true,
    parent: 'systemControl'
  },
  {
    id: 'files',
    label: 'Read and change files in my home folder',
    what: 'Reads, lists, and writes files under your home folder. Secret folders (keys, credentials, keychains) are never touched.',
    why: 'To save exports where you want them and read the files a chore needs.',
    default: true,
    parent: 'systemControl'
  },
  {
    id: 'dangerousOverride',
    label: 'Full autonomy: skip the safety stop for dangerous actions',
    what: 'When on, dangerous commands run without asking. Everything still shows in the Assistant log.',
    why: 'Only for long, unattended jobs where you would rather not be interrupted. Most people should leave this off.',
    default: false,
    parent: 'systemControl',
    warning: 'With this on, a mistake by the AI can delete files or change your system with no chance to say no.'
  }
]

/** Turn the choices into settings values. Ticked = allowed with no popup; unticked = refused until you change it in Settings. */
export function eulaChoicesToSettings(choices: Record<EulaOptionId, boolean>): {
  systemControl: 'on' | 'off'
  systemConsents: Partial<Record<'screenshot' | 'input' | 'open' | 'run' | 'files', 'always' | 'never'>>
  systemDangerousOverride: boolean
} {
  const on = !!choices.systemControl
  const kinds = ['screenshot', 'input', 'open', 'run', 'files'] as const
  const systemConsents: Partial<Record<(typeof kinds)[number], 'always' | 'never'>> = {}
  for (const k of kinds) systemConsents[k] = on && choices[k] ? 'always' : 'never'
  return { systemControl: on ? 'on' : 'off', systemConsents, systemDangerousOverride: on && !!choices.dangerousOverride }
}
