# The Assistant (AI-operated browser)

InboxScout includes an assistant that can do web chores on a person's behalf — the kind of thing a
human helper would do sitting next to them: create an app password at Google/Yahoo/Apple and connect
the account, register the Google or Microsoft sign-in app for the family, add a family member as a
test user, or any task you describe in plain words on a site you name.

It runs in **its own browser window** (isolated session, visible on screen) so the person can watch,
take over, and stop it. It is inspired by "computer use" agents such as Hermes, but built to be safe
for non-technical people first.

## How a run works

1. Pick a job (a *recipe*) in **Setup → Web chores**, or click **Let the assistant do it** in the account wizard.
2. The assistant opens the starting page. Each step it looks at the page (a numbered list of buttons,
   links, and fields — plus a screenshot when the AI backend supports images), decides one action, and does it.
3. If the page asks for a password, it either signs in with your **saved sign-in** (see below) or **hands control
   to you**: sign in on the assistant window, then press **Continue** in InboxScout. Verification codes are always yours.
4. When the job is done it says so. For recipes that produce something — an app password, the Google
   client ID/secret, the Microsoft app ID — InboxScout finishes the job automatically (connects the account,
   saves the IDs). A page-watcher runs underneath and captures those values directly from the page even if
   the AI narrates poorly.

## How far it goes on its own (Setup → Web chores → How far it goes)

| Level | Sign-in pages | Payment / delete / password-change pages | Leaving the task's sites |
|---|---|---|---|
| **Full** (default) | logs in with your saved sign-in | keeps going (logged as a heads-up) | allowed |
| **Sign in for me** | logs in with your saved sign-in | pauses so you can press Continue (or Stop) | pauses, asks you to steer back |
| **Careful** | handed to you | run stops | pauses, asks you to steer back |

Full is the default because that is what "just works" for most people; dial it back to *Sign in for me* or *Careful*
whenever you would rather be asked.

Verification codes, phone approvals, and security keys are **always** handed to you — nothing else can do them.

### Saved sign-ins

Under *Setup → Web chores → Website passwords InboxScout may use* (or in the account wizard's "Let the assistant do it" box) you can store
your normal website password for an email address. It is encrypted with the OS keystore, like every other secret.
The AI model **never receives it**: on a sign-in page it types the placeholders `{{EMAIL}}` and `{{PASSWORD}}`, and
InboxScout swaps in the real values at the keyboard. Logs and history are scrubbed of the password. If the saved
password is rejected twice, the assistant hands the sign-in to you. Custom tasks can pick which saved sign-in to use;
recipes use the one for the account being connected, or the one matching the site.

## Guardrails (always on, whatever the level)

- **The model never sees a password.** Saved sign-ins are typed through placeholders; the runner redacts them from logs.
- **Visible and stoppable.** Every step is logged live; there is always a Stop button; the window is never hidden.
- **Bounded.** At most 45 steps per job; repeated identical actions are broken up.
- **Isolated.** Its own cookie jar, separate from the app and from your normal browser.
- **Scoped changes.** It is told never to change settings the goal did not ask for.

## Your whole computer

Since v1.1 the Assistant is not limited to its browser window. With **system control on** (the default) it can:

- **look at your screen** — take a screenshot to see where things are;
- **click and type on the desktop** — click a spot it saw in the screenshot, type text, press key combos like `ctrl+s`;
- **open things** — apps, files, folders, and links, with whatever your computer normally uses;
- **run commands** — a shell command with a timeout, in your home folder;
- **read, write, and list files** — inside your home folder only, never in secret folders such as `.ssh`, `.gnupg`, cloud
  credentials, or the OS keychain.

The model is told to prefer plain browser actions for web tasks, to take a screenshot before clicking on the desktop and
after each desktop action to check the result, and never to run destructive commands unless the goal clearly asks for them.
Two built-in recipes use it: **Open the latest brief** (lists your reports folder, picks the newest `.html`, opens it) and
**Open the exports folder**. Other agents on the computer (Hermes, through the bridge) go through exactly the same gate.

### The first-launch opt-in and the popups

- **Once, at first launch,** InboxScout shows its plain-language terms and asks you to accept them. Nothing below happens
  until you have.
- **The first time each kind of action happens** — looking at the screen, using the keyboard and mouse, opening something,
  running a command, touching files — a native popup tells you what it wants and asks **Allow once / Always allow /
  Don't allow**. Your answer is remembered per kind (Settings → Who can help), so a run is not a stream of questions.
- **Dangerous commands ask unless the full-autonomy choice is on** (it is on by default; turn it off in Settings → Who can
  help). Dangerous means deleting or formatting, shutting down, changing user accounts or passwords, `sudo`, turning off
  protection, piping downloads into a shell, and anything that looks like a payment or transfer. With the choice off, those
  always ask even under "Always allow". The **Full autonomy** override in Settings is that same choice; the first-launch
  terms show it with a warning so you know exactly what you are agreeing to.
- If you decline, the action fails with "not allowed" and the Assistant is told never to retry it — it looks for another
  way or asks you instead.

### The off switch

Settings → Who can help → **System control: off** turns the whole thing off. The Assistant then keeps working as a
browser-only helper, and any whole-computer action simply reports "system control is off". You can also clear or change the
remembered answers there at any time.

### Platform notes

- **Windows** and **macOS** work out of the box (macOS asks once for Accessibility and Screen Recording permission for
  InboxScout in System Settings → Privacy & Security).
- **Linux** needs `xdotool` installed for clicking and typing (`sudo apt install xdotool` or your distro's equivalent);
  screenshots, opening, commands, and files work without it.

## Driving it from another agent (Hermes)

Everything above is available to other agents on the computer through the **Agent bridge** — as an MCP server, a
REST API, or an event stream — including saving sign-ins and starting recipes. See `integrations/hermes/`.

## Requirements

It needs an AI backend to think — the free Gemini or Groq tiers work (Setup → Smarter sorting (AI)). Backends with
image support (Gemini, OpenAI, Claude, Grok, OpenRouter vision models) see screenshots; text-only backends
(Groq, Mistral, DeepSeek, Ollama, LM Studio) work from the element list alone.

## Built-in recipes

| Recipe | What it does | Produces |
|---|---|---|
| Connect Gmail (app password) | Creates a Google app password named InboxScout, connects the account | account |
| Connect Yahoo Mail (app password) | Same for Yahoo | account |
| Connect iCloud Mail (app-specific password) | Same for Apple | account |
| Register the Google sign-in app (owner) | Project, Gmail API, consent screen, Desktop OAuth client | client ID + secret |
| Add a family member to the Google sign-in (owner) | Adds a test user on the consent screen | — |
| Register the Microsoft sign-in app (owner) | Entra app, public client flows, Mail.Read | app ID |
| Open the latest brief | Finds the newest saved brief in your reports folder and opens it (needs system control) | — |
| Open the exports folder | Opens the folder where briefs and exports are saved (needs system control) | — |
| Something else | Any task you describe, on a site you name | — |

## Honest limits

Web consoles change; a run can stall on an unexpected screen. When that happens it asks you or hands
off rather than guessing. For the owner-only Google/Microsoft registration, the durable fix is to bake
the resulting IDs into official builds (`docs/RELEASING.md`) so nobody has to run those recipes again.
