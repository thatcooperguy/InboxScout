# Ask about your mail… (v1.4, Part B)

A single line under the Today hero — *Ask about your mail…* (Simple: *Ask me anything about your email*) — and
at the top of the phone page. Type a question, press Enter or **Ask**, and an answer appears in a small
transcript (the last five exchanges, never saved) with source chips (subject · sender · date), action buttons,
and a 🔊 button that reads the answer aloud. At Simple every answer is spoken automatically.

Spec: `docs/design/FAMILY-AND-CONVERSATION.md`, Part B.

## How it works

One function, two engines, behind `ask(deps, question, { onLocal, onAi })` in `src/main/ask/index.ts`:

1. **Local answerer** — `src/main/ask/local.ts`. Always runs first and answers in well under two seconds: a
   short list of intent rules over the question, full-text search over the mail, and lookups over the latest
   brief, open issues, the People list, the schedule, and promises. Pure code; no network; works with the
   built-in engine and no AI account at all.
2. **AI answerer** — `src/main/ask/ai.ts`. Only when *Settings → AI helper* is something other than
   *Built-in* and a key or local endpoint is configured. The Vercel AI SDK's `generateText` with eight
   read-only tools, at most four steps (`stopWhen: stepCountIs(4)` — the installed `ai@5.0.253` has
   `stepCountIs`), and a hard **8-second** budget (`abortSignal` plus a timer race). The local answer is shown
   immediately and the row says *thinking…* underneath; when the AI answer arrives it replaces the local one.
   If the AI throws, times out, or the model cannot call tools (some Ollama / LM Studio models), nothing
   happens — the local answer already stands. A Simple user never sees an error.

### The local intents (first match wins)

| Intent | Example | Data |
|---|---|---|
| `wrote_back` | Did the dentist write back? | People / senders by name → newest inbound vs. newest sent |
| `owe` | What do I owe this month? | Bills skill section, issues with `$`, bill-ish schedule events; total when every line has an amount |
| `when_is` | When is the school thing? | Schedule titles; else FTS + `parseLooseDate` on the message |
| `waiting` | Who is waiting on me? | `brief.waitingOnYouDetails`, up to 5, each with a *Draft reply* |
| `promises` | What did I promise Sam? | `brief.promises`, overdue first, optional name filter, *Follow up* |
| `tell` | Tell Jane I'll sign it Friday | People → address; reply subject = latest thread; opens a draft in the person's words |
| `whats_new` | What's new? | `briefToSpeech(brief, { short: true })` |
| `from_x` | Anything from the bank? | People → address, else sender name/address match, else FTS; latest 3; sensitive messages hide their snippet |
| `schedule_day` | What's on Friday? | `brief.schedule.days` by label/date; overlaps flagged |
| `health` | Is anything wrong? | `healthStatus()` items that are not ok, in their own words |
| `read` | Read it to me | A `speak` action with the last answer, or the short brief |
| `attachment` (v1.5) | What was in the pdf from Ron? / What did the invoice say? | People → that sender's newest message with a file that was read (else the newest message with attachments, else FTS over the files' text); the file's summary and facts, *Open it* |
| fallback | anything else | FTS top 5 (subject, sender, date, snippet ≤ 160 chars), `unsure: true` |

Names resolve against `people.name`, the first token of an address, then senders in the mail (case-insensitive
prefix). Two people match → *"Which Jane — Jane Park or Jane Ruiz?"* with two chips that re-ask the question
with the full name (an `ask` action; no free-text follow-up needed).

`toFtsQuery()` in `src/main/db/repo.ts` turns any text into a query FTS5 accepts — `[\p{L}\p{N}]+` tokens,
stop-words dropped, each token quoted, implicit AND, with an OR retry when AND finds nothing — so `Jane's` or
`write back?` no longer raise syntax errors (spec C-13). `searchMessages` uses it for every caller.

### The AI tools (all read-only)

`search_mail`, `read_message`, `get_brief`, `list_issues`, `get_schedule`, `list_people`, `list_promises`, and
`draft_reply`. `draft_reply` returns a `mailto:`; the renderer opens it with `openExternal`, exactly like the
*Draft reply* button on Today. The tool set is built from the database only — `AskCtx` never sees the
`SecretStore`; the only thing that crosses into it is the resolved model.

`redact()` (`src/main/ask/redact.ts`) runs on every tool result and on the final answer: `password: …`,
13–19-digit runs, `123-45-6789`, and six-digit codes after *code / otp / pin* are masked before any text leaves
the tools or reaches the screen. Tool results are capped (8 hits × 160-character snippets; the brief compacted)
so one round-trip stays inside the budget.

## What it can never do

- **Send email.** There is no send tool and no send op. Every "write to…" becomes a draft in the person's own
  mail app that they read and send themselves.
- **Change anything.** No settings, accounts, sign-ins, desktop, files, or Assistant. The bridge and the phone
  see one read-only op, `ask`, limited to one question in flight per client.
- **Reach the keys.** The ask engine is handed a model, never the secret store.
- **Remember the conversation.** The transcript lives in the renderer (or the phone page) and is gone when it
  closes. The only thing written is a feature count (`recordFeature(db, 'ask')`) for the layout level.
- **Repeat secrets.** Redaction runs in code, not only in the prompt.

## The twelve example questions

| # | Question | Engine | What you get |
|---|---|---|---|
| 1 | Did the dentist write back? | local `wrote_back` | *Yes — Dr. Patel wrote Tuesday: "Confirming your…"* + source chip; or *Not yet. You wrote to Dr. Patel 4 days ago.* |
| 2 | What do I owe this month? | local `owe` | Bill lines with amounts and dates; a total when every line has one; *Nothing due that I can see.* |
| 3 | Tell Jane I'll sign it Friday | local `tell` | Opens a draft to Jane, *Re:* her latest thread, body *Hi Jane, I'll sign it Friday. Best, …*; chat says *I opened a draft to Jane. Read it, then press Send in your mail app.* Two Janes → chips. |
| 4 | When is the school thing? | local `when_is` | *Parent conference: Thursday, Sep 10 at 2:30 pm (from Lincoln Elementary, Thursday).* |
| 5 | Who is waiting on me? | local `waiting` | Up to 5 names + subjects, each with *Draft reply*. |
| 6 | Anything from the bank? | local `from_x` | Latest 3; *One of these contains private details — open it to read.* |
| 7 | What did I promise Sam? | local `promises` | *You told Sam "I'll send the contract by Friday" Wednesday — due Friday — overdue.* + *Follow up*. |
| 8 | What's on Friday? | local `schedule_day` | Friday's events, overlaps flagged. |
| 9 | Is anything wrong? | local `health` | Health details for anything not ok, or *Everything is working.* |
| 10 | Read it to me | local `read` | Speaks the last answer, or the short brief. |
| 11 | Why is the invoice from Acme urgent? | AI (`list_issues` → `search_mail` → `read_message`) | A reasoned answer with sources; local fallback: FTS hits marked *unsure*. |
| 12 | Summarise what happened with the roof repair | AI (`search_mail` → `read_message` ×2) | A short timeline with sources; local fallback: the matching subjects, oldest first. |

All twelve run against a fixture inbox in `tests/ask-local.test.ts`, each under two seconds.

## Voice input

Speech **out** already works (🔊 uses `speechSynthesis`; scheduled runs use the OS voice). Speech **in**
through Chromium's `webkitSpeechRecognition` does not work in Electron: it streams audio to Google's service
and needs Google API keys baked into the build, which Electron does not ship — and adding them would send the
person's voice to Google, against the local-first promise. Not an option.

What works today with zero code: the box is a normal `<input>`, so OS dictation types into it — Windows
**Win+H**, macOS press **Fn** twice (or the mic key), Linux depends on the desktop. The Simple hint under the
box says so: *"You can also press the microphone key on your keyboard and talk."* A fully local push-to-talk
(`whisper.cpp` as a child process, model downloaded on request) is a later item.

## Integration

### Desktop (Today.tsx — not touched by the ask work; the integrator mounts the box)

`src/renderer/src/views/AskBox.tsx` is a standalone component: props `{ level, onGoTo? }`. Mount it directly
under the hero, before the message/undo banners:

```tsx
import AskBox from './AskBox'

// inside Today(), right after the closing </div> of <div className="today-hero">…</div>:
<AskBox level={level} onGoTo={onGoTo} />
```

Nothing else is needed on the renderer side: the component talks to `window.inboxScout.ask(q, id)` and
listens on `window.inboxScout.onAskAnswer(cb)` (both in the preload), opens `open_draft` actions with the
existing `openExternal`, and speaks with `speak()` from `useLevel.ts`.

### Main process

- `ipc.ts` registers **`ask:question`** (`{ q, id? }` → `{ id, answer, aiPending }`, the local answer) and
  broadcasts **`ask:answer`** (`{ id, answer }`) when the AI answer arrives. Already wired.
- **Cache invalidation.** `local.ts` caches the parsed latest brief per run; call `invalidateAskCache()` when
  a run finishes. `ipc.ts` does this inside the `afterRun` hook (which `index.ts` already awaits after every
  run), so no change to `index.ts` is required. If a future refactor stops calling `afterRun`, add:

  ```ts
  import { invalidateAskCache } from './ask/index'
  // in runNow(), next to broadcast('run:finished', result):
  invalidateAskCache()
  ```

  The cache also checks the newest report id on every read (one indexed row), so a stale brief cannot survive
  a finished run even without the call.

### Bridge and phone

- `src/main/api/ops.ts`: read-only op **`ask`** (`{ q }` → `Answer`), local + AI awaited within the 8-second
  budget through `OpsDeps.ask` (wired in `ipc.ts`); without that hook it answers with the local engine alone.
  One in flight per client (429 otherwise).
- `src/main/api/phone.ts`: `ask` is on `PHONE_OPS`. `src/main/api/phoneApp.ts` renders the box and a
  five-exchange transcript at the top of the page; source chips expand inline; `open_draft` becomes a
  `mailto:` link (auto-opened for *Tell …*); no 🔊 on the phone.

### Types

`AskSource`, `AskAction`, and `Answer` live in `src/shared/types.ts`. `AskAction` carries the spec's kinds plus
`ask` (the "which Jane" chips: `question` is re-asked), `label`, `text` (for `speak`), and `auto` (run as soon
as the answer arrives — the local *Tell …* draft, the AI's `draft_reply`, and *Read it to me*).

## Files

| File | Role |
|---|---|
| `src/main/ask/local.ts` | intents, name resolution, answer composition, brief cache + `invalidateAskCache()` |
| `src/main/ask/ai.ts` | `ASK_SYSTEM`, `buildAskCtx`, `askTools`, `askAi`, `sourcesFrom`, `actionsFrom` |
| `src/main/ask/redact.ts` | `redact()` / `redactText()` |
| `src/main/ask/index.ts` | `ask()`, `askAndWait()`, `askBoth()`, the 8-second budget, the remembered last answer |
| `src/main/db/repo.ts` | `toFtsQuery`, `searchMessages` (safe), `searchMessagesFrom`, `latestInboundFrom`, `latestSentTo`, `findSendersByName` |
| `src/main/ipc.ts`, `src/preload/index.ts`, `src/preload/api.d.ts` | `ask:question` / `ask:answer`, `ask()` / `onAskAnswer()` |
| `src/main/api/ops.ts`, `phone.ts`, `phoneApp.ts` | the `ask` op, the phone allow-list, the phone box |
| `src/renderer/src/views/AskBox.tsx`, `copy.ts` | the desktop box; `ask.*` copy keys |
| `tests/ask-local.test.ts`, `ask-redact.test.ts`, `ask-ai.test.ts`, `db.test.ts`, `bridge.test.ts`, `phone.test.ts` | tests |
