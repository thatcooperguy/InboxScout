# v1.4 — Trusted helpers, Conversation, and the quality/speed sweep

Build-ready spec in three parts. Everything is local: there is no server and this spec adds none. Where a feature
would normally want a server, it says so and gives the local alternative. File paths are relative to the repo
root; "existing" means the function already exists at the named path.

Ground rules carried over from the codebase: InboxScout never sends mail on the person's behalf except to
addresses the person typed in themselves (`src/main/delivery/email.ts` header comment); the level system
(`src/shared/adapt.ts`) decides density, never position; every setting goes through `src/shared/settingsRegistry.ts`
with a `what`/`why`; every Simple string must pass `tests/copy.test.ts` (grade ≤ 7, ≤ 14-word sentences, no
`SIMPLE_JARGON`).

---

## Part A — Trusted helpers

### A1. Why and what

"Simple enough for a grandparent" only holds if the grandparent is not alone with it. Today the app can email or
text a brief *to the person* (`deliverEmailTo`, `smsPhone`). A trusted helper is a second recipient the person
names — a daughter, a neighbour, a friend — who gets a narrow, plain-words slice of the brief, by email or text,
with no app to install.

**Concepts**

| Term | Meaning |
|---|---|
| Person | The owner of the inbox. Always in control. |
| Helper | Someone the person named: name, relationship, email and/or phone + carrier, a sharing level. |
| Sharing level | `ask` — only when the person presses **Ask for help**. `schedule` — appointments and dates only (friends). `needs` — what needs the person, plus heads-ups. `all` — the full brief, same as *Email me my brief*. |
| Heads-up | A one-line message sent right after a check when something specific happened (A3c). Only at `needs`/`all`. |
| Digest | The recurring "here is how Mom's week looks" message. Says *all fine* when quiet. |
| Sent log | Every message ever sent to a helper, verbatim, viewable by the person. |

**Consent and dignity rules (non-negotiable, tested)**

1. Only the person's own screen can add a helper; the bridge may add one only at Full access and the person sees a
   Today notice for seven days: *"Sarah now gets a copy of what needs you. Change this."*
2. Helpers never receive: email bodies, passwords, sign-ins, attachments, the People list, or anything from a
   message flagged `sensitivity` beyond subject + sender (the existing `sensitiveNotices` rule).
3. Every send is logged with the full text; the person can read the log and can **Pause all helpers** in one press.
4. **Ask for help** waits 10 seconds with a visible *Cancel* before sending (the Gmail undo-send pattern; there is no
   unsend for email).
5. Adding a helper sends the helper one hello message saying what they will get and that the person can stop it.
6. The README promise changes from "only ever sends to *you*" to "only ever sends to you and the helpers you name."

**"Who is setting this up?"** — Onboarding step 0 gains one question under the welcome text: *Me* / *Someone I'm
helping*. Choosing the second pre-fills a helper on step 3 (name, relationship, email/phone, level `needs`) and sets
`setupBy: 'someone_else'`. The person is told at first run, in Simple words: *"Sarah set this up for you. She gets a
short note when something needs you. Press here to change that."* That line stays on Today for seven days.

### A2. Flows and copy

Copy is given as `key: Simple / Standard / Pro`. Missing variants fall back to Standard (`t()` in
`src/renderer/src/copy.ts`).

**(a) Ask for help** — a button on every *Needs you*, *Waiting on you*, *Promises* and *This week* row on Today, and
on each *Needs you* row of the phone page. Opens a small inline form: helper picker (pre-selected when there is one),
optional note (one line), **Send** / **Cancel**.

| Key | Simple | Standard | Pro |
|---|---|---|---|
| `help.button` | Ask for help | Ask for help | Ask |
| `help.prompt` | Send this to {name}? You can add a note. | Send "{title}" to {name} with an optional note. They get the title, the next step, and your note — not the email itself. | Send to {name} |
| `help.sending` | Sending to {name} in {n} seconds. | Sending to {name} in {n} s… | → {name} in {n}s |
| `help.cancel` | Don't send | Cancel | Cancel |
| `help.sent` | Sent to {name}. | Sent to {name} at {time}. See everything you've sent under Setup → Trusted helpers. | Sent · {name} · {time} |
| `help.none` | First, add a helper. Press Setup, then Trusted helpers. | No helper yet — add one under Setup → Trusted helpers. | No helper. Setup → Helpers. |

Message body (email; SMS uses the first 150 characters via `smsText`-style truncation):

```
Subject: {Person} needs a hand: {title}
{Person} asked InboxScout to send you this.

What: {title}
Next step: {nextStep}
Why now: {whyNow}
{Person}'s note: {note}

Reply to this email to send {Person} a note back — it lands in their inbox and on their InboxScout screen.
You are getting this because {Person} added you as a trusted helper. {Person} can stop it any time.
```

**(b) Digest cadence** — per helper: `each_brief` (after every scheduled check), `weekly` (with the first brief on or
after the helper's weekday, default Monday), `off`. Manual "Check my email" runs never send a digest. When nothing
qualifies:

| Level | Quiet digest |
|---|---|
| `needs` | *All fine. Nothing needed {Person} this week.* |
| `schedule` | *No appointments coming up for {Person} this week.* |
| `all` | The normal brief (its own headline already says "You're all caught up"). |

Every digest ends with: *If this stops arriving, {Person}'s computer is probably off.* — silence from the app has to
mean something, and this line is what makes it mean the right thing.

**(c) Heads-ups** — computed after each *scheduled* or *catch-up* run from data the pipeline already produces;
sent at once to helpers at `needs`/`all`; one per trigger key per 7 days (`meta` key `helper:sent:<triggerKey>`).

| # | Trigger (existing data) | Exact condition | Message to helper |
|---|---|---|---|
| 1 | Sensitive request from a stranger | `Classification.sensitivity` includes `personal_private` **and** the sender is not in `people` or has `isNew`/tier `occasional` | *Someone {Person} doesn't usually hear from ("{fromName}", subject "{subject}") asked for private details. Worth a phone call.* |
| 2 | Payment or urgency pressure from a stranger | Subject+snippet matches the built-in `URGENT` regex (`src/main/ai/builtin.ts`) **or** a new `PRESSURE` regex (`gift card|wire|bitcoin|pay (now|today|immediately)|account (locked|suspended)|verify your (account|identity)`) **and** sender unknown as in #1 | *An email from "{fromName}" is pushing {Person} to pay or act fast. It looks like a scam. Please check with {Person}.* |
| 3 | An account keeps failing | `failingAccounts(ctx)` (`src/main/health/checks.ts`): `metaSyncFails(accountId)` ≥ `FAIL_THRESHOLD` (2) | *InboxScout can't read {Person}'s {label} email any more (it has failed {n} times). {Person} may need a new app password; the app says how under Settings → Health.* |
| 4 | Inner circle gone quiet | A `people` row with `tier = 'inner'` and `goingQuiet = true` (`quietDays > max(14, 2.5 × cadenceDays)`) | *{Person} usually hears from {name} every {cadence}; it has been {quietDays} days.* |
| 5 | A promise is overdue | `PromiseLine.overdue === true` in `brief.promises` | *{Person} told {to} "{text}" and the date has passed.* |
| 6 | Something urgent needs the person | `BriefIssue.severity === 'urgent'` and the issue was created in this run | *{title} — {nextStep}.* (title + next step only) |

Heads-ups never include a message body. #1 and #2 name sender and subject only. #3 fires from health data, not
from the brief, so it works even when the run produced no brief.

**(d) The helper's side — no app.** Helpers get email and/or SMS through the existing outbox. Replies are feasible
*without a server* because the digest is sent **from the person's own outbox account**, so a reply lands in the
person's inbox, which the pipeline already syncs. A new step in `run.ts` (after classification) looks for inbound
mail where `fromAddress` matches a helper and the subject starts with `Re:` and one of our subject prefixes, and
surfaces it as a Today card **Notes from your helpers** (`helper_notes`, read aloud at Simple, dismissed with Done).
Commands by email ("DONE 2") are **out of scope**: `From:` is spoofable and the app stays read-only. SMS replies go
to the carrier gateway and are not delivered back reliably; the SMS footer says *reply by email, not text*.

**(e) Friends** — level `schedule`: a digest of `brief.schedule.days` (title, day, time, `sourceLabel`) and
`schedule.overdue`; no issues, no promises, no heads-ups except #4 when the friend *is* the quiet person (skipped —
that would be odd) — so, no heads-ups at all. Copy: *"Here is what {Person} has coming up this week."*

### A3. Data model

```ts
// src/shared/types.ts — additions
export type HelperLevel = 'ask' | 'schedule' | 'needs' | 'all'
export type HelperCadence = 'each_brief' | 'weekly' | 'off'
export interface Helper {
  id: string
  name: string
  /** Free text: "daughter", "neighbour", "friend". Shown in copy, never parsed. */
  relationship: string
  email: string            // '' when SMS only
  phone: string            // '' when email only
  carrier: string          // key of SMS_GATEWAYS, '' when email only
  level: HelperLevel
  cadence: HelperCadence
  /** 0–6, used when cadence is weekly. */
  weekday: number
  paused: boolean
  addedBy: 'person' | 'helper_setup' | 'bridge'
  createdAt: string
}
export interface HelperSend {
  id: string
  helperId: string
  kind: 'hello' | 'ask' | 'digest' | 'headsup'
  channel: 'email' | 'sms'
  sentAt: string
  subject: string
  text: string             // exactly what went out (plain text)
  triggerKey: string | null
  status: 'sent' | 'failed' | 'cancelled'
  error: string | null
}
// AppSettings additions (DEFAULT_SETTINGS values in comments)
//   helpers: Helper[]                       // []
//   helpersPaused: boolean                  // false
//   setupBy: 'me' | 'someone_else' | null   // null
//   helperNoticeUntil: string | null        // null — Today shows the "X gets a copy" line until this date
```

`loadSettings` already spreads `DEFAULT_SETTINGS` first, so existing databases get the new fields with no
migration. `HelperSend` rows live in a new table `helper_sends` (`src/main/db/index.ts`, additive `CREATE TABLE IF
NOT EXISTS`), not in settings, because the log grows.

`Brief` gains `helperNotes?: { from: string; text: string; receivedAt: string; messageId: string }[]`.

### A4. Delivery reuse

| Need | Existing function | Note |
|---|---|---|
| Pick an outbox | `pickOutbox(accounts, null)` (`src/main/delivery/email.ts`) | Needs a Gmail/Yahoo/iCloud **app-password** account. Sign-in-with-Google (`gmailapi`) and Outlook accounts cannot be the outbox today. |
| Send | `sendMail(outbox, password, to, subject, html, text)` | For SMS pass `html` as `undefined`-equivalent (see C-14). |
| SMS address | `smsAddress(phone, carrier)` | Returns null on bad input — surface as a settings error, not a silent skip. |
| Truncate for SMS | new `smsClip(text, 150)` next to `smsText` | `smsText` is headline-specific; keep it. |
| No outbox available | **Local alternative:** `delegateMailto`-style `mailto:` via `openExternal` ("Open in my mail app — press Send"), and a health item saying which account to add. | Never a server relay. |

New module `src/main/helpers/deliver.ts`: `composeAsk()`, `composeDigest()`, `composeHeadsups()` (pure, tested),
`sendToHelper(deps, helper, kind, subject, text, html)` (writes `helper_sends`, tries email then SMS, never throws).
New `src/main/helpers/headsups.ts`: `detectHeadsups(input): Headsup[]` (pure; input = new classifications + messages,
people rows, brief, failing accounts, now). New `src/main/helpers/notes.ts`: `findHelperNotes(messages, helpers)`.

Hook points in `src/main/pipeline/run.ts`: after step 4b (`brief.helperNotes = findHelperNotes(...)`) and in step 6
next to the existing delivery block (`if (trigger !== 'manual' && !settings.helpersPaused) { digests; headsups }`).
Manual *Ask for help* goes through a new IPC/op, not the pipeline.

### A5. Bridge ops (`src/main/api/ops.ts`) and phone

| Op | write | Input | Returns |
|---|---|---|---|
| `helper_list` | no | — | helpers without phone/email digits beyond a masked form (`s***@gmail.com`) |
| `helper_add` | yes | `{ name, relationship, email?, phone?, carrier?, level, cadence? }` | the helper; sets `helperNoticeUntil` = now + 7 d and sends the hello |
| `helper_update` | yes | `{ id, patch }` (level, cadence, weekday, paused) | the helper |
| `helper_remove` | yes | `{ id }` | `{ ok }` |
| `helper_ask` | yes | `{ helperId, title, nextStep?, whyNow?, note? }` | `{ sendId, sendsAt }` — 10-second delay applies here too |
| `helper_cancel` | yes | `{ sendId }` | `{ cancelled }` |
| `helper_log` | no | `{ limit? }` | recent `HelperSend` rows |
| `helper_pause_all` | yes | `{ paused }` | `{ paused }` |

Do **not** add `helpers` to `SETTINGS_ALLOWLIST`; helpers change only through these ops so every path logs and
sends the hello. `PHONE_OPS` (`src/main/api/phone.ts`) gains `helper_list`, `helper_ask`, `helper_cancel` — the phone
page gets the same *Ask for help* button per *Needs you* row. MCP picks the ops up automatically (`tools/list` maps
`ops`).

### A6. Settings registry rows (`src/shared/settingsRegistry.ts`, group `get`)

The helper list itself is a "richer card" (like `vipSenders`), exempt in `tests/settingsRegistry.test.ts`. Plain rows:

| key | label | what | why | who | caution |
|---|---|---|---|---|---|
| `helpersPaused` | Pause my helpers | When on, nothing is sent to any helper — no digests, no heads-ups, and Ask for help is greyed out. | Off, because you added helpers to hear from you. | Turn it on when you are travelling with them or just want a quiet week. | — |
| `setupBy` | Who set this up | Me, or someone helping me. When someone else set it up, they are usually your first helper. | Set once during setup. | Change it if the helper who set it up should no longer get anything. | — |
| (card) Trusted helpers | Trusted helpers | People who get a short note when something needs you. Each has a sharing level; you can see every message ever sent. | Empty until you add someone. Never passwords, never full emails. | Anyone who wants a family member or friend to have their back. | Helpers see the titles of what needs you. Use "Ask only" if that is too much. |

Level picker copy: *Ask only — only when I press Ask for help* · *Appointments only — good for a friend* · *What
needs me — plus a heads-up about scams, a broken account, or someone gone quiet* · *Everything — the same brief I
get.*

### A7. Health check impact (`src/main/health/checks.ts`)

New `helpersCheck`: `ok` when no helpers; `warn` *"You have helpers but no account that can send mail. Add a Gmail,
Yahoo, or iCloud account with an app password, or your helpers will not hear from InboxScout."* when
`pickOutbox()` is null; `warn` when the last `helper_sends` row for a helper is `failed` with the error in plain
words; `fail` never (helpers are never fatal). No automatic repair: sending is not a "safe" repair.

### A8. Tests

- `tests/helpers.test.ts`: `composeAsk/Digest/Headsups` copy contains no body text, no addresses of third parties;
  quiet digest text per level; SMS clip ≤ 155 chars; `detectHeadsups` fires each of #1–#6 exactly once with fixtures,
  respects the 7-day key, ignores known senders for #1/#2; `findHelperNotes` matches `Re:` + prefix only.
- `tests/bridge.test.ts`: `helper_*` ops respect read-only; `helper_add` masks contact details in `helper_list`;
  `update_settings` cannot touch `helpers`.
- `tests/phone.test.ts`: `helper_ask` allowed, `helper_add` refused from the phone.
- `tests/copy.test.ts`: the `help.*` Simple variants pass automatically.
- `tests/health.test.ts`: helpers check with/without outbox.
- `tests/settingsRegistry.test.ts`: new keys explained; helper card exempt.

### A9. Implementation plan

| File | Change | Est. |
|---|---|---|
| `src/shared/types.ts` | `Helper`, `HelperSend`, `AppSettings` fields, `Brief.helperNotes` | 0.5 h |
| `src/main/db/index.ts`, `src/main/db/repo.ts` | `helper_sends` table; `insertHelperSend`, `listHelperSends`, `updateHelperSend` | 1 h |
| `src/main/helpers/deliver.ts` | compose + send + 10-s pending queue (`Map<sendId, Timeout>`) | 3 h |
| `src/main/helpers/headsups.ts` | six detectors + `PRESSURE` regex + dedupe keys | 3 h |
| `src/main/helpers/notes.ts` | helper reply detection | 1 h |
| `src/main/pipeline/run.ts` | hook points (notes after 4b; digests/heads-ups in step 6, scheduled/catch-up only) | 1.5 h |
| `src/main/api/ops.ts`, `src/main/api/phone.ts` | eight ops; phone allow-list | 2 h |
| `src/main/ipc.ts`, `src/preload/index.ts`, `src/preload/api.d.ts` | `helpers:*` channels mirroring the ops | 1.5 h |
| `src/main/health/checks.ts` | `helpersCheck` | 1 h |
| `src/shared/settingsRegistry.ts` | rows above | 0.5 h |
| `src/renderer/src/copy.ts` | `help.*`, `helpers.*` strings | 1 h |
| `src/renderer/src/views/Helpers.tsx` (new, under Setup) | list, add/edit form, level picker, sent log, Pause all | 5 h |
| `src/renderer/src/views/Today.tsx` | Ask for help per row + pending/cancel bar; `helper_notes` card; 7-day notice | 3 h |
| `src/renderer/src/views/Onboarding.tsx` | "Who is setting this up?" on step 0; pre-filled helper on step 3 | 2 h |
| `src/main/api/phoneApp.ts` | Ask button + helper picker | 2 h |
| `docs/HELPERS.md`, README line, `integrations/hermes/README.md` | docs | 1.5 h |
| Tests (A8) | | 5 h |
| **Total** | | **≈ 35 h** |

Out of scope (would need a server): push notifications to a helper's phone; a helper web page; reply-by-SMS;
verified identity of the helper. Local alternatives are, respectively: SMS via the carrier gateway; the emailed
digest; reply by email; the hello message plus the sent log.

---

## Part B — Conversation: "Ask about your mail…"

### B1. Shape

A single-line box under the Today hero (`Ask about your mail…`, Simple: `Ask me anything about your email`) and at
the top of the phone page. Enter or the **Ask** button submits. Answers appear in a small transcript (last 5
exchanges, not persisted) with source chips (subject · sender · date) that open the message in *Inbox review*
(desktop) or expand inline (phone). A *🔊* button on each answer speaks it via `speak()` (`useLevel.ts`); at Simple
every answer is spoken automatically.

Two engines behind one function `ask(question): Answer`:

1. **Local answerer** (`src/main/ask/local.ts`) — always runs first, must return in < 2 s: intent rules over the
   question, FTS over mail, and lookups over the latest brief, issues, people, schedule, promises.
2. **AI answerer** (`src/main/ask/ai.ts`) — only when `settings.ai.provider !== 'builtin'` and a key/endpoint is
   configured; `generateText` with tools; hard budget 8 s. The local answer is shown immediately and *replaced* when
   the AI answer arrives (the transcript row says *thinking…* under the local answer meanwhile). If the AI throws,
   times out, or the provider cannot call tools (some Ollama/LM Studio models), the local answer simply stands.

```ts
// src/shared/types.ts
export interface AskSource { messageId?: string; label: string }   // "Dentist · Dr. Patel · Tue"
export interface AskAction { kind: 'open_draft' | 'open_message' | 'go_to' | 'speak'; mailto?: string; messageId?: string; tab?: string }
export interface Answer {
  text: string
  sources: AskSource[]
  actions: AskAction[]
  engine: 'local' | 'ai'
  /** True when the local engine only found keyword hits and is not sure. Pro shows "unsure"; Simple never shows it. */
  unsure: boolean
}
```

### B2. Local answerer — intents

Ordered rules; the first match wins; otherwise fall through to FTS. `toFtsQuery()` (new in `repo.ts`) turns free
text into a safe FTS5 query: keep `[\p{L}\p{N}]+` tokens, drop stop-words, quote each token, join with a space
(implicit AND); retry with `OR` when AND yields nothing. Today `searchMessages` passes raw text to `MATCH`, so
`Jane's` or `write back?` raises an FTS syntax error that `ipc.ts` swallows into `[]`.

| Intent | Pattern (case-insensitive) | Data | Answer shape |
|---|---|---|---|
| `wrote_back` | `did (the )?(\w+) (write|get|reply|respond)` | people (name/address match) → latest inbound message from them; `brief.waitingOnThem` | *Yes — Dr. Patel wrote on Tuesday: "Confirming your 2:00…"* / *Not yet. You wrote to them 4 days ago.* |
| `owe` | `what do i owe|bills?|due (this|next) (week|month)|how much` | `brief.skillSections` where `skillId === 'bills'`; issues with `$`; schedule events with sourceLabel Bills | List with amounts and dates; total when every line has an amount. |
| `when_is` | `when('s| is) (the |my )?(.+)` | schedule events whose title matches; else FTS + `parseLooseDate` (`src/main/reports/exports.ts`) | *Dentist: Tuesday at 2:00 pm (from Dr. Patel's email of Sep 2).* |
| `waiting` | `who('s| is) waiting|what do i (need to|have to) (reply|answer)` | `brief.waitingOnYouDetails` | Up to 5 lines with Draft reply actions. |
| `promises` | `what did i promise|did i say i would` | `brief.promises` | Overdue first. |
| `tell` | `^(tell|let|email|write|reply to) (\w+) (that |i'?ll |i will |i )?(.+)` | people → address; reply subject = latest thread with them | `open_draft` with `replyMailto(address, subject, name)` whose body is the person's words in first person. |
| `whats_new` | `what('s| is) new|anything (important|urgent)|what needs me` | `brief.headline`, `topIssues[0..3]` | Same text as `briefToSpeech(brief, {short:true})`. |
| `from_x` | `anything from (.+)|(email|mail) from (.+)` | people → address; FTS on `from_address` | Latest 3 from that sender. |
| `schedule_day` | `what('s| is) (on |happening )?(today|tomorrow|monday…sunday|this week)` | `brief.schedule.days` by label/date | Day's events, then overlaps. |
| `health` | `is (anything|something) wrong|why (didn't|hasn't)` | `healthStatus()` | Items with status ≠ ok, in their own `detail` words. |
| `read` | `read (it|that|this) (to me|aloud)` | — | `speak` action with the last answer or the short brief. |
| fallback | anything else | FTS top 5 (subject, from, date, snippet ≤ 160 chars) | *Here is what I found about "{q}":* + lines; `unsure: true`. |

Name matching: `people.name` or first token of `addresses`, case-insensitive prefix, then `Classification.people`.
Two candidates → ask *"Which Jane — Jane Park or Jane Ruiz?"* with two chips (no free-text follow-up needed).

### B3. AI answerer

Uses the existing `resolveModel(settings.ai, apiKey)` (`src/main/ai/provider.ts`) and the Vercel AI SDK v5
`generateText` with tools (the codebase already depends on `ai@^5` and uses `generateObject`).

```ts
// src/main/ask/ai.ts
import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'

export const ASK_SYSTEM = `You are InboxScout, a calm assistant that answers questions about ONE person's own email, using only the tools provided.
Rules:
- Answer in plain words, at most three short sentences, then a short list if needed. Lead with the answer.
- Use the tools to look things up; never guess a date, amount, or name. If the tools return nothing, say so.
- Cite what you used: end with "From: <subject> — <sender> — <date>" lines, one per source, max 3.
- You can NEVER send email. To write to someone, call draft_reply; it opens a draft the person must send themselves. Say that.
- NEVER repeat passwords, codes, account numbers, card numbers, or ID numbers, even if a message contains them. Say "that message contains private details" and offer to open it.
- Do not change settings, accounts, or anything on the computer. You have no tools for that.
- Today is {today}. The person's name is {ownerName}. Dates in tool results are ISO; say them as weekday + day.`

export function askTools(ctx: AskCtx) {
  return {
    search_mail: tool({
      description: 'Full-text search over the person\'s mail. Returns up to 8 hits: id, subject, from, date, snippet.',
      inputSchema: z.object({ q: z.string(), limit: z.number().int().min(1).max(8).optional() }),
      execute: async ({ q, limit }) => redact(ctx.searchMail(toFtsQuery(q), limit ?? 8))
    }),
    read_message: tool({
      description: 'Read one message (first 1500 characters) by id from search_mail.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => redact(ctx.readMessage(id, 1500))
    }),
    get_brief: tool({
      description: 'The latest brief, compact: headline, topIssues (title, nextStep, whyNow), waitingOnYou, deadlines, skill sections.',
      inputSchema: z.object({}),
      execute: async () => ctx.compactBrief()
    }),
    list_issues: tool({
      description: 'Open items that need the person: title, severity, next step, deadline.',
      inputSchema: z.object({}),
      execute: async () => ctx.openIssues()
    }),
    get_schedule: tool({
      description: 'Dated things across every inbox for the next 14 days plus overdue items.',
      inputSchema: z.object({ day: z.string().optional().describe('YYYY-MM-DD to narrow to one day') }),
      execute: async ({ day }) => ctx.schedule(day)
    }),
    list_people: tool({
      description: 'Find a person in the circle by name: name, address, role, last seen, going quiet.',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => ctx.findPeople(name)
    }),
    list_promises: tool({
      description: 'Commitments the person made in their own sent mail, with due dates.',
      inputSchema: z.object({}),
      execute: async () => ctx.promises()
    }),
    draft_reply: tool({
      description: 'Open a reply draft in the person\'s own mail app. Never sends. Body must be in the person\'s voice, first person, short.',
      inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string().max(1200), name: z.string() }),
      execute: async (a) => ({ opened: true, mailto: ctx.mailto(a) })
    })
  }
}

export async function askAi(ctx: AskCtx, question: string, signal: AbortSignal): Promise<Answer> {
  const { text, steps } = await generateText({
    model: ctx.model,
    system: ASK_SYSTEM.replace('{today}', ctx.today).replace('{ownerName}', ctx.ownerName),
    prompt: question,
    tools: askTools(ctx),
    stopWhen: stepCountIs(4),
    abortSignal: signal
  })
  return { text, sources: sourcesFrom(steps), actions: actionsFrom(steps), engine: 'ai', unsure: false }
}
```

`redact()` (`src/main/ask/redact.ts`) masks `password\s*[:=]\s*\S+`, 13–19-digit runs, `\d{3}-\d{2}-\d{4}`, and
6-digit codes preceded by `code|otp|pin` before any text leaves the tools. Tool results are capped (8 hits × 160-char
snippets; brief compacted to ≈ 1.5 k tokens) so one round-trip stays under the budget.

### B4. Twelve example questions

| # | Question | Engine path | Expected behaviour |
|---|---|---|---|
| 1 | Did the dentist write back? | local `wrote_back` (people "dentist" → role service / name match; else FTS "dentist") | *Yes — Dr. Patel wrote Tuesday: "See you at 2:00."* + source chip. If nothing inbound after the person's last mail: *Not yet. You wrote on Sep 2.* |
| 2 | What do I owe this month? | local `owe` | Bills lines with amounts and due dates; total if all have amounts; *Nothing due that I can see* otherwise. |
| 3 | Tell Jane I'll sign it Friday | local `tell` → `open_draft` | Opens the mail app with To: Jane, Re: latest thread, body *"Hi Jane, I'll sign it Friday. Best, {owner}"*. Chat says *I opened a draft to Jane. Read it, then press Send in your mail app.* Two Janes → chips. |
| 4 | When is the school thing? | local `when_is` (schedule title ~ "school"), else FTS + `parseLooseDate` | *Parent conference: Thursday 2:30 pm (from Lincoln Elementary, Sep 3).* |
| 5 | Who is waiting on me? | local `waiting` | Up to 5 names + subjects, each with *Draft reply*. |
| 6 | Anything from the bank? | local `from_x` (FTS on from_address/subject "bank") | Latest 3, with the sensitive rule: *One of these contains private details — open it to read.* |
| 7 | What did I promise Sam? | local `promises` filtered by name | *You told Sam "I'll send the contract by Friday" on Sep 2 — overdue.* + Follow up action. |
| 8 | What's on Friday? | local `schedule_day` | Friday's events, overlaps flagged. |
| 9 | Is anything wrong? | local `health` | Health `detail` strings for non-ok items, or *Everything is working.* |
| 10 | Read it to me | local `read` | Speaks the last answer, or the short brief when none. |
| 11 | Why is the invoice from Acme urgent? | AI (needs reasoning): `list_issues` → `search_mail("Acme invoice")` → `read_message` | *Acme's invoice is 30 days past due and they've asked twice — the second email says service pauses Monday.* + 2 sources. Local fallback: FTS hits with `unsure`. |
| 12 | Summarise what happened with the roof repair | AI: `search_mail` → `read_message` ×2 | Three-sentence timeline with sources. Local fallback: the 5 most recent matching subjects, oldest first. |

### B5. Safety rules (enforced in code, not just the prompt)

1. The ask ops receive a **read-only tool set**: no `resolve_issue`, no settings, no desktop, no assistant. `draft_reply`
   returns a `mailto:`; the renderer opens it with `openExternal` — the same boundary as *Draft reply* today.
2. Secrets are never in reach: `AskCtx` is built from `db` only, never `SecretStore`.
3. `redact()` runs on every tool result and on the final answer text.
4. The transcript is in memory only; nothing is written to the database or the log except a count (`recordFeature(db,'ask')`).
5. The AI call has `abortSignal` at 8 s and `stepCountIs(4)`; a failure never surfaces as an error to a Simple user —
   the local answer is already on screen.
6. Bridge/phone exposure: one read-only op `ask` (`{ q }` → `Answer`); rate-limited to 1 in-flight per client.

### B6. Latency budget

| Step | Budget | How |
|---|---|---|
| Intent match + lookups | ≤ 50 ms | Regex + in-memory `latestBrief` (cached per run in `ask/local.ts`, invalidated on `run:finished`). |
| FTS | ≤ 200 ms on 50 k messages | `messages_fts` MATCH with `ORDER BY rank LIMIT 8`; new index on `messages(date)` (C-11). |
| Local answer on screen | **< 2 s** worst case | Single IPC round trip; renderer shows the answer as it arrives. |
| AI answer | **< 8 s** | 1–3 tool steps of ≈ 1.5 k tokens each; abort at 8 s; local answer stands. |
| Speech | immediate | `speechSynthesis` in renderer; OS voice (`speakWithOs`) only for scheduled runs, unchanged. |

### B7. Voice input — assessment

- *Read it to me* exists (renderer `speechSynthesis`, main `speakWithOs`). Speech **out** is solved.
- Speech **in** via Chromium's `webkitSpeechRecognition` does not work in Electron: Chromium streams the audio to
  Google's speech service and needs Google API keys (`GOOGLE_API_KEY`, `GOOGLE_DEFAULT_CLIENT_ID/SECRET`) baked into
  the build; Electron ships without them, so recognition starts and fails with a `network` error. Adding keys would
  also send the person's voice to Google, against the local-first promise. **Not an option.**
- **Available now, zero code:** OS dictation types into the chat box because it is a normal `<input>`: Windows
  `Win+H`, macOS press *Fn* twice (or the mic key), Linux depends on the desktop. The Simple hint under the box says
  so: *"You can also press the microphone key on your keyboard and talk."*
- **Later (out of scope for v1.4):** push-to-talk with a local `whisper.cpp` binary run as a child process like
  `voice.ts` does for TTS, with `ggml-tiny.en` (~75 MB) or `base.en` (~148 MB) downloaded on first use behind an
  explicit *Download voice (150 MB)* button. Capture via `getUserMedia` in the renderer → WAV → IPC → whisper →
  text into the box. Fully local; no keys.

### B8. Files and tests

| File | Change | Est. |
|---|---|---|
| `src/main/db/repo.ts` | `toFtsQuery()`; `searchMessages` uses it; `searchMessagesFrom(address)`; `latestInboundFrom(address)` | 1.5 h |
| `src/main/ask/local.ts` | intents, name resolution, answer composition | 6 h |
| `src/main/ask/ai.ts`, `src/main/ask/redact.ts` | system prompt, tools, `askAi`, redaction | 4 h |
| `src/main/ask/index.ts` | `ask(deps, q, { onLocal, onAi })` orchestration, cache, abort | 2 h |
| `src/main/ipc.ts`, preload, `api.d.ts` | `ask:question` (returns local, streams AI via `ask:answer` event) | 1.5 h |
| `src/main/api/ops.ts`, `src/main/api/phone.ts` | read-only `ask` op; phone allow-list | 1 h |
| `src/renderer/src/views/AskBox.tsx` (new), `Today.tsx` | box, transcript, chips, actions, auto-speak at Simple | 5 h |
| `src/main/api/phoneApp.ts` | box + transcript on the phone page | 2 h |
| `src/renderer/src/copy.ts` | `ask.placeholder`, `ask.thinking`, `ask.nothing`, `ask.draftOpened`, `ask.private` | 0.5 h |
| `docs/ASK.md` | | 1 h |
| Tests: `tests/ask-local.test.ts` (all 12 questions against a fixture DB, each < 2 s), `tests/ask-redact.test.ts`, `tests/ask-ai.test.ts` (tool schemas; a fake model that calls `draft_reply` yields an `open_draft` action and never a send), `tests/db.test.ts` (`toFtsQuery` with quotes, apostrophes, `AND`, emoji) | | 5 h |
| **Total** | | **≈ 30 h** |

---

## Part C — Quality and speed sweep (top 15)

Measured against the code as it stands; each row is one PR-sized change.

| # | Area | File | Change | Expected effect |
|---|---|---|---|---|
| 1 | Catch-up loop spams failures | `src/main/index.ts` (setInterval → `scheduler.apply` every 5 min), `src/main/scheduler.ts` | `apply()` re-arms cron *and* re-evaluates `shouldCatchUp` every 5 min; `lastRunAt` only updates on success, so a failing account triggers a catch-up run — and an OS notification "scan failed" — every 5 minutes. Only call `apply()` when `JSON.stringify(schedule)` changed; store `lastAttemptAt` in meta and back off catch-ups (15 min, 1 h, 6 h). | No repeated auth attempts against a locked account (which also inflates `metaSyncFails` and triggers reauth), no notification storm. |
| 2 | Settings clobbered by a run | `src/main/pipeline/run.ts` (`saveSettings(db, { ...settings, lastRunAt })`) | The run writes back the settings object it loaded at start; any change made in Preferences during a 60-s run is lost. Write `lastRunAt` with `repo.setMeta(db,'last-run-at')` (and read it in `loadSettings`), or reload before saving. | Zero lost settings; also removes the second `saveSettings` race with `applyAutoProfile`. |
| 3 | First brief with an AI helper | `src/main/pipeline/run.ts` (classify loop), `src/main/ai/classify.ts` | Chunks are classified strictly one after another (`for … await`). Run up to 3 chunks concurrently with a tiny pool; keep `withAiFallback` per chunk. | First brief on a 150-message initial sync: ~8 serial calls → ~3 rounds; roughly 2.5× faster classify phase. |
| 4 | Don't pay the AI for obvious noise | `src/main/pipeline/run.ts` | Pre-filter with `classifyMessageHeuristically`: when `NOISE_SENDER` or `providerHints.category ∈ {promotions, social, forums}` and not `important`, keep the heuristic result and skip the AI batch for those. | 40–60 % fewer messages sent to the AI on typical inboxes; faster and cheaper, same brief. |
| 5 | Gmail initial fetch | `src/main/mail/gmail.ts` (`fetchMessages`: 4 workers × `messages/{id}?format=full`) | Use the Gmail batch endpoint (`POST https://gmail.googleapis.com/batch/gmail/v1`, multipart, 50 per call) for `format=full`. | 300 round trips → 6; first sync of a Gmail account from ~40 s to ~8 s on a home connection. |
| 6 | Per-run memory and DB time | `src/main/pipeline/run.ts` (`messagesSince(db,120)` = up to 4000 rows with 20 KB bodies; `recentThreadMessages` loads every message body from 30 days twice), `src/main/db/repo.ts` | Add `messagesSinceLite()` selecting everything except `body_text`; people engine, reply tracker, promises need bodies only for `fromMe` messages — load those separately. | ~80 MB of strings per run avoided on a mature DB; people/reply phases 5–10× faster. |
| 7 | 4000 single-row queries per run | `src/main/pipeline/run.ts` (`categoryOfStored` → `repo.getClassifications(db,[id])[0]` per message) | New `repo.categoryMap(db, ids): Map<string, Category>` with one `IN (…)` query per 500 ids. | People + inbox summaries phase from seconds to tens of ms. |
| 8 | Missing index | `src/main/db/index.ts` | `CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date)`; also `idx_classifications_deadline ON classifications(deadline)`. `messagesSince`, `recentThreadMessages`, `recentMessagesWithClassification`, `recentDeadlines` all filter/sort on `date` with no index. | Full scans → range scans; matters from ~20 k messages up (Pro users with 3 inboxes). |
| 9 | Today flashes empty after every run | `src/renderer/src/App.tsx` (`<Today key={\`t${refreshKey}\`}>`), `Today.tsx` | Remount on `refreshKey` resets `latest` to `undefined` → "📬 Opening your brief…" flash, and loses `expanded`, `inboxFilter`, and the undo toast. Keep the previous brief in state, refetch on `run:finished`, and drop the key. | Brief updates in place; the Simple user's "Show me everything" no longer collapses after a check. |
| 10 | Perceived speed during a check | `Today.tsx`, `App.tsx`; data from `repo.listRuns` (`started_at`/`finished_at`) | Replace the greyed "Checking…" button with a 5-segment bar labelled from `RunProgress.phase` (*Step 2 of 5 · Sorting 42 new messages*) and an estimate from the last successful run's duration. | Runs over 10 s stop looking hung (NN/G 10-s rule); no new backend work. |
| 11 | Voice keeps talking after leaving Today | `Today.tsx` (`readAloud`) | `speechSynthesis.speak` is never cancelled on unmount; switching tabs mid-read leaves the voice running with no Stop button. Add `useEffect(() => () => window.speechSynthesis.cancel(), [])`. Same for `speak()` in `useLevel.ts` on level change. | The one control older adults need most — Stop — always works. |
| 12 | Raw errors on screen | `App.tsx` (`Problem: ${r.error}`), `run.ts` error strings, `index.ts` notification body | New `src/shared/errors.ts` `plainError(message, level)`: `AUTH_ERROR_RE` → *"{account} didn't accept the password. Press Fix it for me, or add a new app password under Setup → Email accounts."*; `ENOTFOUND|ECONNRESET|ETIMEDOUT` → *"No internet right now. I'll try again at {next slot}."*; "No API key … Open Connect AI" → the screen is called *AI helper* now. Show the raw text behind *Show details* at Standard/Pro only. | Error copy meets HUMAN-FACTORS 1.5 (what happened → likely reason → the button); no stale screen names. |
| 13 | Search breaks on punctuation | `src/main/db/repo.ts` (`searchMessages`), `src/main/ipc.ts` (`messages:search` swallows the throw) | `toFtsQuery()` from B2; use it in the Review search, the `search_mail` op, and Ask. | "Jane's invoice?" returns results instead of nothing, silently. |
| 14 | SMS with an HTML part | `run.ts` step 6, `ipc.ts` `delivery:test` | `sendMail(…, '<p>text</p>', text)` sends multipart to carrier gateways; several (Verizon, AT&T) render the HTML part as an attachment or drop it. Pass `html` as `undefined` for gateway addresses (make the param optional in `sendMail`). | Texts arrive as plain 1-segment messages everywhere; the same path serves helpers' SMS. |
| 15 | Accessibility on Today | `Today.tsx` (`Why` uses `className="ghost tiny"` — 11 px, ~19 px tall on the most-used explain control), `styles.css` (`.today-grid` `auto-fit` at Standard) | Retire `.tiny` on `Why` (`ghost`, `min-height:36px`); fixed two-column grid at Standard with slot order (Needs you / Waiting / Promises left; This week / Circle / skills right) per HUMAN-FACTORS 3.3; add `J/K` row focus and `D` for Done at Standard/Pro; add a skip link to `main`. | WCAG 2.5.8 on the Why button; cards stop reflowing when the window or zoom changes; keyboard users get the same speed the Pro copy already promises. |

Two quality items worth a line even though they are not speed: (a) the built-in `withAiFallback` flips the whole
run to the built-in engine on the *first* AI error, including a transient 429 — one retry with a 2-s backoff on
`429|5\d\d` before setting `aiDown` keeps briefs smarter on busy free tiers; (b) `index.ts` notification bodies
("212 new messages scanned, 2 issues need attention") use words the Simple deny-list forbids — move `COPY` to
`src/shared/copy.ts` as ADAPTIVE-UI §7 already asks, and pick the variant from the stored level.

Suggested order: 1, 2, 9, 11 (bugs, < 1 day together) → 13, 8, 7, 6 (speed, one day) → 3, 4, 5 (AI/first brief,
one to two days) → 10, 12, 14, 15 (polish, two days).
