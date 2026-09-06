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
