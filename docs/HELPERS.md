# Trusted helpers

"Simple enough for a grandparent" only holds if the grandparent is not alone with it. A **trusted helper** is a
second person the owner of the inbox names — a daughter, a neighbour, a friend — who gets a narrow, plain-words
slice of the brief by email or text. The helper installs nothing; the person stays in control of everything.

InboxScout's promise changes from "only ever sends to *you*" to **"only ever sends to you and the helpers you
name."** Every message goes out from the person's own connected email account, and every one of them is kept,
word for word, where the person can read it.

## What it is

Open **Setup → Trusted helpers** and press **Add a helper**. Give them a name, who they are to you, and an email
address and/or a mobile number with its carrier (texts go through the carrier's free email-to-text gateway). Then
choose a **sharing level**:

| Level | Copy in the app | What the helper gets |
|---|---|---|
| `ask` | **Ask only** — only when I press Ask for help | Nothing on its own. Only what the person sends with **Ask for help**. |
| `schedule` | **Appointments only** — good for a friend | A digest of appointments and dates (title, day, time, where it came from) and anything overdue. No issues, no promises, no heads-ups. |
| `needs` | **What needs me** — plus a heads-up about scams, a broken account, or someone gone quiet | A digest of what needs the person (titles and next steps), plus heads-ups. |
| `all` | **Everything** — the same brief I get | The full brief, exactly as *Email me my brief* sends it, plus heads-ups. |

Each helper also has a **cadence** for the digest: after every scheduled check (`each_brief`), once a week
(`weekly`, on a weekday you pick — it goes with the first check on or after that day), or `off` (heads-ups and
Ask for help only). A manual **Check my email** never sends anything to a helper.

When a digest has nothing to say it still goes, so silence from the app means something:

- `needs`: *All fine. Nothing needed Mom this week.*
- `schedule`: *No appointments coming up for Mom this week.*
- `all`: the normal brief (its own headline already says "You're all caught up").

Every digest ends with *If this stops arriving, Mom's computer is probably off.*

### Ask for help

Every *Needs you*, *Waiting on you*, *Promises*, and *This week* row on Today — and each *Needs you* row on the
phone page — has an **Ask for help** button. It opens a small form: which helper (pre-selected when there is
one), an optional one-line note, **Send** / **Cancel**. After Send, the message waits **ten seconds with a visible
Cancel** (the undo-send pattern; there is no unsend for email), then goes. The helper receives:

```
Subject: Mom needs a hand: Sign the lease renewal
Mom asked InboxScout to send you this.

What: Sign the lease renewal
Next step: Open the PDF and sign it
Why now: Due Friday
Mom's note: Can you come by Thursday?

Reply to this email to send Mom a note back — it lands in their inbox and on their InboxScout screen.
You are getting this because Mom added you as a trusted helper. Mom can stop it any time.
```

By text, the first 120 characters go, followed by *Reply by email, not text.*

If no connected account can send mail, the send is logged as failed and the app offers **Open in my mail app**
instead (a `mailto:` link with the same message — the person presses Send there). Never a server relay.

### Heads-ups

After each scheduled or catch-up run, helpers at `needs` and `all` get a one-line heads-up when something specific
happened. Each trigger fires at most once per seven days (`meta` key `helper:sent:<triggerKey>`):

| # | Trigger | Message |
|---|---|---|
| 1 | A stranger (not in the person's circle, or new, or only occasional) asked for private details | *Someone Mom doesn't usually hear from ("Account Team", subject "Verify your account") asked for private details. Worth a phone call.* |
| 2 | A stranger is applying payment or urgency pressure (`gift card`, `wire`, `bitcoin`, `pay now`, `account locked`, `verify your identity`… or the built-in urgency words) | *An email from "Account Team" is pushing Mom to pay or act fast. It looks like a scam. Please check with Mom.* |
| 3 | An email account has failed to sync twice or more in a row (from health data, so it works even when the run produced no brief) | *InboxScout can't read Mom's Gmail email any more (it has failed 3 times). Mom may need a new app password; the app says how under Settings → Health.* |
| 4 | Someone in the inner circle has gone quiet | *Mom usually hears from Jane every week; it has been 23 days.* |
| 5 | A promise the person made is overdue | *Mom told Jane "I will send the photos by Tuesday" and the date has passed.* |
| 6 | Something urgent was tracked in this run | *Sign the lease renewal — Open the PDF and sign it.* (title + next step only) |

Helpers at `schedule` get no heads-ups at all.

## What helpers never see

- The emails themselves: no bodies, no snippets, no attachments.
- Passwords, sign-ins, app IDs, or anything else from Settings.
- The People list.
- Anything from a message flagged private or confidential beyond its subject and sender (the same rule as the
  brief's *Private or confidential mail spotted* notices).
- Anything at all while helpers are paused, from a manual *Check my email*, or from a helper who is paused.

Only the person's own screen can add a helper. A connected agent may add one through the bridge only at **Full**
access; the person then sees a line on Today for seven days — *"Sarah now gets a copy of what needs you. Change
this."* — and the agent only ever sees contact details masked (`s***@gmail.com`, `***-***-4567`). The phone page can
list helpers and ask for help; it can never add or change one. `helpers` is deliberately not in the bridge's
`update_settings` allow-list: helpers change only through the `helper_*` ops, so every path logs and sends the hello.

## The sent log

Every message that went — or tried to go — to a helper is stored in the `helper_sends` table with its full text:
kind (`hello`, `ask`, `digest`, `headsup`), channel (`email`, `sms`), when, subject, the exact plain text, the trigger
key, and its status (`sent`, `failed` with the reason in plain words, or `cancelled` for an Ask stopped in time). The
person reads it under **Setup → Trusted helpers → Everything sent to your helpers**, and **Pause all helpers** stops
everything in one press. Health (Settings → Health) warns when there are helpers but no account that can send mail,
or when the last message to a helper failed. Sending is never an automatic repair.

## The helper's side — no app

Adding a helper sends them one **hello** message: what they will get, that they will never get the emails themselves,
that the person can change or stop it any time and can read every message, and that replying works.

Because every message is sent **from the person's own email account**, a helper's reply lands in the person's inbox,
which InboxScout already reads. After each check, replies from a helper whose subject starts with `Re:` and one of
InboxScout's own subject shapes (*… needs a hand: …*, *How … week looks*, *Heads-up about …*, *InboxScout: …*) are
surfaced on Today as **Notes from your helpers** — the helper's own words, without the quoted original — read aloud
at Simple and dismissed with **Done**.

Commands by email ("DONE 2") are out of scope on purpose: `From:` is spoofable and the app stays read-only. Text
messages go to the carrier gateway and replies are not delivered back reliably, so the text footer says *reply by
email, not text*.

## Who is setting this up?

The first-run wizard asks **Who is setting this up? — Me / Someone I'm helping**. Choosing the second sets
`setupBy: 'someone_else'` and, on the last step, offers a pre-filled helper card (name, relationship, email/phone,
level *What needs me*). The person then sees for seven days: *"Sarah set this up for you. Sarah gets a short note
when something needs you. Press here to change that."*

## Integration

Everything lives under `src/main/helpers/`:

| File | What |
|---|---|
| `deliver.ts` | `composeAsk`, `composeDigest`, `composeHeadsups`, `composeHello` (pure), `smsClip`, `sendToHelper` (writes the log, email then SMS, never throws), the ten-second pending queue (`scheduleAsk` → `{sendId, sendsAt}`, `cancelAsk`). |
| `headsups.ts` | `detectHeadsups(input)` — the six detectors, the `PRESSURE` regex, the 7-day key helpers. |
| `notes.ts` | `findHelperNotes(messages, helpers)` — helper replies for the Today card. |
| `index.ts` | The one entry point the rest of the app uses: `afterRun`, `addHelper`/`updateHelper`/`removeHelper`/`pauseAll`, masking, and re-exports. |

The pipeline (`src/main/pipeline/run.ts`) needs exactly two calls. Imports:

```ts
import { afterRun as helpersAfterRun, findHelperNotes } from '../helpers/index'
import { failingAccounts } from '../health/checks'
```

**1. Notes from your helpers** — right after step 4b (after `brief.inboxes = …`, outside the `insightsEnabled` block so
it works either way). `circleMessages` is the 120-day window the pipeline already loads:

```ts
    // 4c. Trusted helpers (v1.4): replies helpers sent to InboxScout mail, from the person's own inbox.
    brief.helperNotes = findHelperNotes(circleMessages, settings.helpers, { now: new Date() })
```

**2. Digests and heads-ups** — in step 6, next to the existing delivery block (after the `deliverEmailTo`/SMS block,
before the Google Drive export). `afterRun` itself returns `[]` for manual and CLI runs and while helpers are paused,
so the guard is only a shortcut; it never throws:

```ts
    // 6b. Trusted helpers (v1.4): digests and heads-ups — scheduled/catch-up runs only, never on manual "Check my email".
    if ((trigger === 'scheduled' || trigger === 'catchup') && !settings.helpersPaused && settings.helpers.length > 0) {
      onProgress({ phase: 'save', detail: 'Telling your helpers…' })
      notices.push(
        ...(await helpersAfterRun(
          { db, secrets, log },
          {
            brief,
            trigger,
            newClassifications: classifications,
            messages: toClassify,
            people,
            failingAccounts: failingAccounts({ accounts: () => accounts, getMeta: (k) => repo.getMeta(db, k) }),
            now,
            markdown,
            runStartedAt: startedAt
          }
        ))
      )
    }
```

`people` is the array from `buildPeople` (empty when insights are off — fine; #4 then never fires). `markdown` is the
rendered brief, used for helpers at `all`. `runStartedAt` lets #6 fire only for issues created in this run.

On Today (`src/renderer/src/views/Today.tsx`), three drop-in components under `src/renderer/src/components/`:

```tsx
import AskForHelp from '../components/AskForHelp'
import HelperNotesCard from '../components/HelperNotesCard'
import HelperNotice from '../components/HelperNotice'

// Under the hero, once:
<HelperNotice level={level} onChange={() => onGoTo?.('setup')} />

// In each Needs-you / Waiting-on-you / Promises / This-week row's button group:
<AskForHelp title={i.title} nextStep={i.nextStep} whyNow={i.whyNow} level={level} />

// As a card, when brief.helperNotes?.length (keep a `notesHidden` state for Done):
{brief.helperNotes?.length > 0 && !notesHidden && <HelperNotesCard notes={brief.helperNotes} level={level} onDone={() => setNotesHidden(true)} />}
```

Renderer IPC (`window.inboxScout`): `helpersList`, `helpersAdd`, `helpersUpdate`, `helpersRemove`, `helpersAsk`,
`helpersCancel`, `helpersLog`, `helpersPauseAll`, `helpersSetSetupBy`, `helpersDismissNotice` (channels
`helpers:list/add/update/remove/ask/cancel/log/pauseAll/setSetupBy/dismissNotice`). Bridge and MCP ops:
`helper_list`, `helper_add`, `helper_update`, `helper_remove`, `helper_ask`, `helper_cancel`, `helper_log`,
`helper_pause_all` (REST under `/v1/helpers…`). The phone page is allowed `helper_list`, `helper_ask`, `helper_cancel`
only.

## Out of scope (would need a server)

Push notifications to a helper's phone, a helper web page, reply-by-SMS, verified identity of the helper. The local
alternatives are, respectively: SMS through the carrier gateway; the emailed digest; reply by email; the hello message
plus the sent log.
