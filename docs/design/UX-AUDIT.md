# InboxScout UX audit

Date: 2026-09-06. Scope: the renderer as it exists today, including the "evolving UI" (`uiLevel`) and the registry-driven Preferences that landed during this audit. No code was changed by the audit.

**Snapshot.** Line numbers refer to commit `e3bba14` ("Evolving UI foundation"). While this was being written, a parallel session was already applying items from it — some committed to a stash (`stash@{0}`), some uncommitted in the working tree at 02:15 UTC. §6.4 records what I saw applied, so a reader can tell "still open" from "landed but not merged". Where an owner decision overrides a recommendation (the Assistant's "Do it all" default), it is recorded as such and the recommendation is kept for the record only.

Files audited line by line:

- `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, `src/renderer/src/main.tsx`
- `src/renderer/src/views/` — `Onboarding`, `Today`, `Reports`, `People`, `Setup`, `Accounts`, `Skills`, `AiSettings`, `Assistant`, `SetupAssistant`, `Settings` (incl. `BridgeDetails`), `ProfilePicker`, `Dashboard`, `Review`
- `src/shared/types.ts` (`AppSettings`, `DEFAULT_SETTINGS`), `src/shared/settingsRegistry.ts`, `src/shared/adapt.ts`, `src/main/usage.ts`
- Strings that reach the screen from the main process: `src/main/ai/provider.ts` (provider notes), `src/main/mail/imap.ts` (`PROVIDER_PRESETS.help`), `src/main/agent/policy.ts` (recipe names), `src/main/delivery` (carriers).

Two personas were walked through every screen:

- **Persona A — "Ruth, 80" and "Sam, 10"**, sharing the family PC. Reads 14-px text with effort, mouse only, does not know what IMAP, an app password, OAuth, a webhook, a token, or a model is. Two similar-sounding choices are a coin flip. A screen with nothing to press means "it's broken" and the app gets closed.
- **Persona B — "Dana, CEO"**, three inboxes (personal Gmail, Workspace, board Outlook), ~200 emails/day, ten minutes at 7:30 a.m. Wants the bottom line first, wants to know which inbox, wants to correct the machine in one click, and will not type her real Google password into a desktop app.

Method: Nielsen's 10 heuristics; WCAG 2.2 AA with the 44-px target guidance from Apple and Microsoft; NN/g research on seniors, children, progressive disclosure, toggles, and confirmation; calm-technology principles; the BLUF executive-brief format. Contrast ratios were computed from the hex values in `styles.css`, not estimated. Links in §8.

---

## 1. Executive summary — the twelve things that matter most

| # | Finding | Hurts | Where |
|---|---|---|---|
| 1 | **First run dead-ends on "App password".** Onboarding step 2 offers only email + 16-character app password: no Google/Microsoft sign-in, no "let the assistant do it", no Outlook, and the help URL is plain text. Ruth cannot finish; Dana's Workspace admin may block app passwords. | A, B | `Onboarding.tsx` L110-152 |
| 2 | **Preferences silently discards unsaved edits.** Every registry row waits for "Save settings" at the bottom (`Settings.tsx` L261); "← Back to Setup" (`Setup.tsx` L22) and the sidebar tabs throw edits away with no warning. Profile choice (L78) and skill checkboxes save instantly. Nobody can predict which is which. | A, B | `Settings.tsx`, `Setup.tsx` |
| 3 | **Destructive actions with no confirmation on 17-px targets**: "Disconnect & forget password", "Forget key", "Forget" (saved sign-in), "New token". | A, B | `Accounts.tsx` L146, `AiSettings.tsx` L149, `Assistant.tsx` L139, `Settings.tsx` L30 |
| 4 | **Simple layout can render an empty Today.** `hasAnything` (`Today.tsx` L109-117) counts non-overdue promises, new faces, pulse, and "others owe you" — all of which Simple hides — so the grid can be blank with neither cards nor "You're all caught up". | A | `Today.tsx` L109-117 vs L236, L309, L330, L343 |
| 5 | **Three things are called helper/assistant** ("AI helper", "Assistant", "Connect helper") side by side on the Setup hub. | A, B | `Setup.tsx` L50-64 |
| 6 | **The explanations are the least readable text.** `.hint` (`#7b8494` on white) is 3.77:1 at 12 px; it carries every "what this does" line, every card's "Why am I seeing this?", every subtitle. Keyboard focus on inputs is a 1.17:1 outline. | A | `styles.css` L6, L93, L104 |
| 7 | **Two controls fight over the same outcome.** `uiLevel` (registry L107-122) and `simpleMode` "Advanced tools" (registry L136-145) both decide whether Details / Inbox review appear (`App.tsx` L99-104). | A, B | `App.tsx`, `settingsRegistry.ts` |
| 8 | **Booleans render as `<select>`s with sentence-long options**; option text like "Full — also check email now, connect accounts, save sign-ins…" is clipped by the native control. Five different selection idioms exist (select, checkbox, chip, card border, badge). | A, B | `Settings.tsx` L116, `Assistant.tsx` L116-120, `Skills.tsx`, `Review.tsx` |
| 9 | **Risky defaults and a password prompt in the wrong place.** `assistantAutonomy: 'full'` and `bridgeAccess: 'full'` ship as defaults; Accounts asks for "Your Google password" inline. (Owner decision recorded during the audit: "Do it all" stays first and recommended for the Assistant — the mitigation is then the visible log, the Stop button, and moving password capture out of the account flow.) | A, B | `types.ts` L361-362, `Accounts.tsx` L227-232 |
| 10 | **The "why" affordances are the smallest targets in the app.** Card ⓘ buttons (`Today.tsx` L10) and "Why?" (`Settings.tsx` L156) are `.ghost.tiny` ≈ 17 px; the ⓘ glyph is 11 px. | A | `Today.tsx`, `Settings.tsx` |
| 11 | **Simple hides the People tab** (`App.tsx` L101) — the one screen a grandparent would use daily ("Mom has gone quiet"). | A | `App.tsx` |
| 12 | **Jargon leaks** in a dozen places: "scan", "run", "IMAP", "OAuth client ID", "bearer token", "MCP", "REST", "model override", "promotions/noise", "cold pitch", `catchup`, `succeeded`, "Hermes" in a search placeholder. | A | listed per screen |

The ideas are already right for both personas: one big button, a brief instead of an inbox, "Everything has a sensible default", read-only promise repeated, "Let InboxScout figure it out" first, a registry that refuses to show a setting without a "what" and a "why", and an adaptive level that changes at most weekly and always with a note and a way back. The remaining work is consistency, copy, target size, and a few missing paths — not a redesign.

---

## 2. Global: app shell, level system, stylesheet

### What works
- Four plain tabs; Details and Inbox review only appear at Pro or when asked (`App.tsx` L99-104). Real progressive disclosure.
- The level switch note (`App.tsx` L122-134) explains itself ("switched to the Simple layout — large text, a retiree profile. One big button…") and offers "Sounds good" / "Keep it the way it was". The rule (`adapt.ts` L94-109) waits 7 days and 3 sessions and announces once. This is textbook calm technology.
- Simple layout CSS (`styles.css` L149-155): 34-px title, 20-px headline, 17-px list items, 44-px ghost buttons, single column capped at 720 px. Exactly what Persona A needs.
- Whole-UI zoom for text size (`App.tsx` L41). `label.field` wraps inputs so labels are associated for free.
- One accent, one destructive, one success colour; emoji icons scale with zoom.

### Confusing or unexplained
- **Two "check email" buttons on one screen**: sidebar "✉ Check my email" (`App.tsx` L118) and hero "✉ Check my email now" (`Today.tsx` L148). Same action, different words. Hide the sidebar one on Today or make the labels identical.
- **Progress lives in a 12-px grey line at the bottom of a dark sidebar** (`App.tsx` L116, `styles.css` L44, 4.53:1). During a multi-minute run this is the only feedback; errors ("Problem: …") land there too. Move to a content-side banner at 15 px with `role="status"` (WCAG 4.1.3).
- **Blank window while loading**: `return <div />` at `App.tsx` L84 and `Today.tsx` L96. On a slow PC Ruth sees white for seconds and double-clicks the icon again.
- **Level flash**: `level` defaults to `'standard'` until `uiLevel()` resolves (`App.tsx` L98), so a Simple user briefly sees the dense layout every launch.
- **Level note grammar**: reasons are lowercase fragments joined by ", " ("— 3 inboxes connected, a business profile."). Fine for Dana, odd for Ruth. Render as a sentence: "because you have 3 inboxes and a business profile".
- **Level note uses `.success`** (green, 4.39:1). It is information, not success; use a neutral panel.
- **Tab label ≠ page title** in four places: tab "Details" → `<h1>Dashboard`; tab "My briefs" → "No reports yet."; hub "AI helper" → `<h1>Connect AI`; hub "What to watch for" → "What should InboxScout watch for?". Nielsen #4/#6: what you clicked is what you get.
- **Simple hides People** (`App.tsx` L101) but the Today "Your circle" card still shows "going quiet" lines with nowhere to act on them.

### Accessibility (measured)

Contrast, from `styles.css` values:

| Pair | Ratio | WCAG 1.4.3 / 1.4.11 | Used by |
|---|---|---|---|
| `--ink-faint #7b8494` on white | **3.77:1** | Fail (12-13 px text needs 4.5) | `.hint`, `.sub`, `th`, `.empty`, `.hub-btn .sub`, `.provider-card p`, every registry "what" line, every card ⓘ text |
| `--ink-faint` on `--paper` | **3.64:1** | Fail | page subtitles |
| `--ink-faint` on `--surface` | **3.35:1** | Fail | `.pill.low`, `.pill.promotions_noise`, `.badge.muted` "default" |
| `--good` on `--good-soft` | **4.39:1** | Fail (just) | `.success`, `.pill.personal`, `.badge` "chosen for you", the level-switch note |
| `#9a6a12` on `#fdf3e0` | **4.29:1** | Fail | `.pill.medium` |
| `--red` on `--red-soft` | 4.60:1 | Pass | `.error`, urgent pills |
| `--blue` ↔ white | 7.10:1 | Pass | buttons, links, `.badge.you` |
| sidebar `#b3bac7` on `#1e2430` | 7.97:1 | Pass | nav |
| sidebar status `#828b9c` | 4.53:1 | Pass (barely) | progress line |
| focus outline `--blue-soft` on white (`styles.css` L93) | **1.17:1** | Fail (needs 3:1) | `input:focus, select:focus` |
| `.today-card.attention` border `#e8b4b0` (L127) | 1.75:1 | Fail as the *only* urgency cue | Needs-you card |
| selected card border `--line`→`--blue` | 7.1:1 | Pass, but border-only | provider, profile, recipe, kind cards |

Fix: `--ink-faint: #5f6879` (≈5.6:1); `--good: #22663f`; `.pill.medium { color: #7a5100 }`; `.badge` and `.badge.muted` inherit those; focus → `:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px }` on every interactive element.

Target size (WCAG 2.2 2.5.8 = 24 px minimum; 2.5.5 / Apple HIG 44 pt / Microsoft 40 epx recommended):

| Control | Height | Verdict |
|---|---|---|
| `button.tiny` (`styles.css` L85) | **≈17-19 px** | Fails 24 px. Used for: Disconnect, Forget key, Forget sign-in, New token, Show/Hide token, "Why?" (`Settings.tsx` L156), "↺ Back to automatic" (L182), card ⓘ (`Today.tsx` L10), People Always important / Not important, Review chips and Fix buttons, Reports "Open file", SetupAssistant step jumps |
| `button.ghost` (L80) | ≈28 px (44 px in Simple, L154) | Passes 24, fails 44 outside Simple. "Done ✓", "Draft reply", "Read it to me", "Cancel" |
| `button.primary` (L74) | ≈32 px | Same |
| sidebar tab / `input, select` | ≈36 px | Same |
| `.skill-row input[type=checkbox]` (L142); "Show everything" checkbox (`Settings.tsx` L201, browser default ≈13 px) | 22 px / 13 px | Fail 24 px |
| `.back-link` (L139, `padding: 0`) | ≈17 px | Fail |
| `.big-btn`, `.hub-btn` | 53 px / 90+ px | Pass |

Fix: `min-height: 40px` on `.ghost`/`.primary` at every level (44 in Simple, already there); retire `.tiny` or give it `min-height: 36px` with a 44-px padded hit area; checkboxes 24 px; `.back-link` padded to 40 px.

Other global gaps:
- **Keyboard**: real `<button>`/`<input>` everywhere (good), but no `aria-current="page"` on the active tab; chips lack `aria-pressed`; ⓘ toggles lack `aria-expanded` (the "Why?" one has it — copy that); no Enter-to-submit in Onboarding/Accounts forms; no shortcut for the main action.
- **Reliance on colour** (1.4.1): overdue schedule lines are red-only (`Today.tsx` L264); attention card is pink-border-only (L188); selected cards are border-only (`ProfilePicker.tsx` L44, `Assistant.tsx` L161, `SetupAssistant.tsx` L58); active Review chip is fill-only (`Review.tsx` L45); selected report is bold-only (`Reports.tsx` L36).
- **Motion**: `scrollIntoView({ behavior: 'smooth' })` (`Assistant.tsx` L54) ignores `prefers-reduced-motion`.
- **Forced-colours / Windows High Contrast** (common for older adults): every border/box-shadow selection state vanishes. Add `@media (forced-colors: active)` or an explicit "Selected ✓" text.
- **Base 14 px** (`styles.css` L20). NN/g and Apple recommend ≥16 px body for older adults; Simple already scales the Today screen but not Setup pages, Settings rows, or the sidebar.
- **Emoji in button labels** ("✉ Check my email now", "✍ Draft reply", "🔊 Read it to me") are read aloud as "envelope", "writing hand". Wrap in `<span aria-hidden="true">`.
- **Heading outline**: `<h1>` then `<h3>` everywhere (no `<h2>`); the Today ⓘ text is a `<div>` inside a `<span>` inside an `<h3>` (`Today.tsx` L9-14) — invalid nesting, and the explanation becomes part of the heading for screen readers.

---

## 3. Screen-by-screen

Each screen: works → confusing/unexplained → jargon table → too many choices → missing "what does this do" → unclear buttons → inconsistent patterns → accessibility → dead ends → persona notes.

### 3.1 Onboarding (`views/Onboarding.tsx`)

**Works**: three numbered cards, 560 px wide, "Step 1 of 3 — …" headings, "Set up later" (L79) and "Skip for now" (L148). Honest step-0 copy: "it can never send or delete anything". Step 3 says what happens next ("scan every morning at 7:30 and save your brief to Documents").

**Confusing / unexplained**
- Step 1 (L86-108) shows the full 52-profile picker on first run. The auto card is preselected but five collapsible groups with 10-11 cards each remain. Ruth: "do I have to pick one?" Show only the auto card + "Choose myself ▸".
- Step 2 (L110-152): "App password" with no explanation of what it is, why the normal password won't work, or how to get one. The only help is `preset.help` — "Requires 2-Step Verification. Create an app password at myaccount.google.com/apppasswords." — rendered as plain text (L122), **not a link**.
- Step 2 omits **Outlook / Microsoft** (Accounts has it), **Sign in with Google**, and **Let the assistant do it** — the three easiest paths are missing at the moment they matter most.
- "Next" (L104) sits under the whole picker; with a group open it scrolls off-screen.
- Step 3 claims "save your brief to Documents" while `reportsDir` defaults to `''`; verify the resolved path matches the copy.
- "Skip for now" jumps to "Step 3 of 3 — You're set" (L156) with nothing connected. Ruth believes it worked.

**Jargon → replacement**

| Current (line) | Replace with |
|---|---|
| "Somewhere else (IMAP)" (L119) | "Another email service" |
| "App password" (L128) | "App password — a special 16-character password your email service makes just for apps (not your usual password)" + button **"How do I get one?"** that opens the provider page |
| "IMAP server" (L138) | "Incoming mail server (ask your email provider)" |
| "Testing connection…" (L145) | "Connecting…" |
| "Step 3 of 3 — You're set ✓" (L156) | "All set" / when skipped: "Almost there — connect your email any time from Setup" |
| "Run my first scan" (L165) | "Check my email now" (the words on the big button they'll see next) |

**Too many choices**: 52 profile cards (see above).
**Missing explanations**: what an app password is; that it is stored encrypted on this computer (Accounts says so, Onboarding doesn't); why 2-Step Verification is needed.
**Unclear buttons**: "Skip for now" → misleading step 3.
**Inconsistent**: "Where is your email?" (L113) vs Accounts "Email provider"; "Somewhere else (IMAP)" vs "Other (IMAP)".
**Accessibility**: Enter doesn't submit; no password reveal; `.primary` 32 px; error below the fold on small windows.
**Dead ends**: Gmail without 2-Step Verification (no explanation); Outlook users (no option).
**A**: cannot finish alone. **B**: can, but with three app passwords — needs the Google/Microsoft buttons here.

### 3.2 Today (`views/Today.tsx`)

**Works**: headline first (BLUF); cards appear only when non-empty; "You're all caught up" (L176-183); inline "Done ✓", "✍ Draft reply", "✍ Follow up" with the honest hint "opens your own mail app… you review and send" (L233). Simple: three items per card, only overdue promises, only today/tomorrow, "Read it to me" promoted to a big button (L152). Pro: "📋 Copy for my assistant" (L165). Per-card "Why am I seeing this?" (L6-16) is the right idea.

**Confusing / unexplained**
- **Empty-grid dead end in Simple** (finding #4): `hasAnything` (L109-117) is true when the only content is a non-overdue promise, a new face, a pulse entry, or "others owe you"; Simple renders none of those, so the user sees the hero and nothing else. Compute `hasAnything` from the *rendered* set, or fall back to the all-clear card.
- **Card order is code order**, and `auto-fit` grid reflows by width, so "Needs you" can sit beside "Your circle". Dana wants a strict order with Needs-you full width; Ruth wants at most 3-4 cards (Simple gets this).
- **No counts** in card headers ("Needs you (4)"). Dana scans counts first.
- **No link to the email**. `BriefIssue.sources` and `PromiseLine.messageId` exist in `types.ts` but are never rendered. Both personas ask "which email is this?".
- **Inbox chips are labels, not filters** (L136-144), hidden in Simple. Dana cannot say "show me the board inbox".
- "Last checked 9/6/2026, 7:31:12 AM" (L133) — seconds. "Last checked today at 7:31 am".
- `exportMsg` (L174) never dismisses, and **errors render in green** (`className="success"` whatever `r.ok` was, L66, L71).
- "🔒 Sensitive items noticed" (L375) is shown in Simple; Ruth reads "sensitive" as "danger". Rename and gate.
- "Regulars:" (L285) unexplained → "Every week:".
- "How things are going" (L332) lists project names Ruth never named; the ⓘ text helps, but only if she finds the 11-px glyph.
- The ⓘ toggles between "ⓘ" and "✕" (L11) — two symbols, no words. Use "Why?" / "Hide" like Settings does (L157).

**Jargon → replacement**

| Current | Replace |
|---|---|
| "Export list (CSV)" (L163) | "Save as spreadsheet" |
| "Copy for my assistant" (L166) | "Copy as text" (title: "paste into a note, a message, or another AI") |
| "Regulars: …" (L285) | "Every week: …" |
| "Sensitive items noticed" (L375) | "Private or confidential mail spotted" |
| "How things are going" (L332) | "Topics I'm following" |
| "Others owe you a reply" (L345) / "Waiting for your reply" (L209) | "You're waiting on them" / "They're waiting on you" (parallel) |
| "Connect an email account in Setup, then check your email to get your first brief." (L128) | "First, connect your email." + a **button** "Connect my email" that opens Setup → Email accounts |

**Too many choices**: Standard/Pro can show 11 cards + 5 buttons. Group Read / Calendar / Spreadsheet / Copy under one "More ▾" outside Simple.
**Unclear buttons**: "Done ✓" resolves the issue permanently with no undo → 5-second Undo toast (NN/g: undo beats confirmation for cheap actions). "Check my email now" while running only greys out; show phase text in the hero.
**Inconsistent**: check-after ("Done ✓") vs icon-before ("✍ Draft reply"); "‼" prefix for conflicts but colour-only for overdue.
**Accessibility**: overdue colour-only (L264); ⓘ 17 px and nested in `<h3>`; ghost 28 px outside Simple; no `<h2>`; no `role="status"` on `exportMsg`.
**Dead ends**: no-accounts headline has no button; Simple empty grid.
**A**: nearly there — fix the empty grid, gate Sensitive, make ⓘ a word, add the empty-state button. **B**: order, counts, source links, inbox filter, keyboard path, "reading time: 2 min".

### 3.3 My briefs (`views/Reports.tsx`)

**Works**: list left, brief right, latest auto-selected, "Save as PDF", sandboxed iframe.
**Confusing**: page "My briefs" vs "No reports yet." (L28) vs "Run a scan…" (L60) — three words for one thing. List rows "Daily — 9/6/2026, 7:31:12 AM" (L36) in a 260-px column. Full file path in the toolbar (L49). Iframe fixed at `calc(100vh - 180px)` (`styles.css` L106) → double scrollbars at 1.4× zoom. `pdfMsg` errors green (L25).
**Replace**: "No reports yet." → "No briefs yet."; "Run a scan to generate your first brief." → "Press Check my email to get your first brief."; row → "Today, 7:31 am" + "Weekly" pill; "Saved to <path>" → "Saved in your Reports folder — Open · Show folder"; "Open file" → "Open".
**Accessibility**: selected item bold-only; iframe `title="report"` → "Your brief for Sep 6".
**Dead end**: empty state has no button.
**B**: search across briefs; "compare with last week".

### 3.4 People (`views/People.tsx`)

**Works**: zero setup; tiers; search; two-button correction with built-in undo; explains inner-circle rule (L45-46).
**Confusing**: `unknown` role is a bare "👤" (L11). Meta line (L67) packs seven facts in 12-px grey. "⭐ Always important ✓ · undo" (L77) mixes state and action in one label. "Not important" (L85) writes `quietPeople`, while Skills has "Important people" (`vipSenders`) and "Never bother me about" (`mutedSenders`) — three lists, two screens, overlapping meanings.
**Replace**: "👤" → "👤 Someone"; "Not important" → "Lower priority" with a one-line hint "still shown, never called urgent"; meta → "Colleague · writes most weeks · last heard Sep 1" (counts in a tooltip).
**Accessibility**: both buttons `.tiny`.
**Dead end**: empty state "Check your email once…" (L50) without a button. Hidden entirely in Simple (`App.tsx` L101).
**B**: filter by inbox; sort by "waiting on me"; click to last thread.

### 3.5 Setup hub (`views/Setup.tsx`)

**Works**: six big cards, one-line descriptions, "Everything has a sensible default. Change only what you want." (L38), back link on every sub-page.
**Confusing**: "AI helper" (L52), "Assistant" (L57), "Connect helper" (L62) — three near-identical mental models; two of the three descriptions mention app passwords and Google/Microsoft setup. "Connect helper" is an installer's one-time chore presented as a first-class card.

**Rename (one name per concept; use it on the card, the `<h1>`, in Onboarding, and in hints):**

| Today | Proposed | Why |
|---|---|---|
| "AI helper" / `<h1>Connect AI` | **Smarter sorting (AI)** | Says what you get |
| "Assistant" | **Web chores** — "InboxScout drives a browser for you" | Names the job |
| "Connect helper" | **Sign-in setup for Google & Microsoft (one-time, advanced)** | Names the chore and its audience |
| "Preferences" | **Settings** | The word everyone else uses |
| "What to watch for" / `<h1>What should InboxScout watch for?` | **What to watch for** on both | |

**Too many choices**: six equal cards. Simple: Email accounts, What to watch for, Settings + "More setup options ▸". Hide Sign-in setup unless Pro or a provider is unconfigured.
**Accessibility**: `.back-link` 17 px tall.
**Dead end / data loss**: back link from Settings with unsaved edits (see 3.11).

### 3.6 Email accounts (`views/Accounts.tsx`)

**Works**: "Read-only access — InboxScout can never send, delete, or change your mail." (L130). The Microsoft device-code flow (L186-212) — 22-px code, one "Open the Microsoft sign-in page" button, "Waiting for you…" — is the best flow in the app; copy it for Google. The green "Let the assistant do it" card (L221-239) is a novel help path.

**Confusing / unexplained**
- Connected rows show `gmailapi · imap.gmail.com` (L142). Say "Gmail (signed in with Google)".
- "**Best for Gmail: Sign in with Google**" (L174) shows even when no Google client is configured; pressing it errors. Its hint names "docs/GOOGLE.md" as plain text and "whoever installed InboxScout". Gate it on configuration.
- The Gmail branch renders `error` **twice** (L180 inside the Google card and L261 below).
- The assistant card asks for "**Your Google password**" inline (L227-232). Even with the encryption note this is the pattern people are trained to refuse; Dana distrusts the whole app from here. Move password saving to Web chores → collapsed "Saved sign-ins (advanced)"; here offer only "you'll sign in yourself in its window".
- "(Needs an AI helper — free Gemini or Groq works.)" (L225) is a chicken-and-egg loop for a user who arrived from Onboarding; the button (L234-236) is enabled even when no AI is connected (the view never checks `aiReady`).
- "Connected you@… ✓ (Gmail signals on)" (L57) — "signals" is internal vocabulary.
- After connecting, no "Now press Check my email".

**Jargon → replacement**

| Current | Replace |
|---|---|
| "Other (IMAP)" (L169) | "Another email service" |
| "IMAP server" (L252) / "Port" (L257) | "Incoming mail server" / "Port (usually 993)" |
| "App password" (L241) | as in Onboarding, with "How do I get one?" opening the provider page |
| "Disconnect & forget password" (L146) | "Remove" → confirm: "Remove you@…? InboxScout forgets its password and stops reading this inbox. Your emails are untouched." |
| "(Gmail signals on)" (L57) | "(better sorting from Gmail's own labels)" |
| "Testing connection…" (L264) | "Connecting…" |
| "Uses Google's own sign-in page (no app password) and gives InboxScout Gmail's Promotions/Social/Updates labels and Important markers for much better sorting." (L176-178) | "Sign in on Google's page — no app password, and better sorting." |

**Too many choices**: for Gmail, three stacked ways to connect (blue card, green card, manual field) plus the provider select. Present one ordered choice: "Easiest — Sign in with Google" / "Let InboxScout get the app password" / "I have an app password", one visible at a time.
**Unclear buttons**: "Disconnect & forget password" — `.tiny`, no confirmation (WCAG 3.3.4; NN/g confirmation dialogs).
**Inconsistent**: "Cancel" position differs between Outlook and Gmail branches; blue vs green tinted cards with no legend.
**Accessibility**: nested cards; no password reveal (Microsoft inclusive-design guidance); error not `role="alert"`.
**Dead ends**: Google button when unconfigured; assistant button when no AI.

### 3.7 What to watch for — Skills (`views/Skills.tsx`)

**Works**: 22-px checkboxes inside `label` rows (L40-54), icon + name + description, instant save, "Each one adds a section to your brief" (L38).
**Confusing**: pills "custom" (L48) and "sends to your agent" (L49) — Ruth: "what agent?". People lists as free-text `<textarea>` split on newlines *and* commas (L32) with "matched loosely" documented only in a code comment. Checkboxes save instantly; textareas need "Save people lists" (L87) — two rules on one screen. Overlaps People (3.4). "🧩 Custom watchers… Drop a JSON file… docs/SKILLS.md" (L93-108) at the same weight as everything else.
**Replace**: "custom" → "yours"; "sends to your agent" → "also sent to your company's AI" (show only when a webhook is set); "Custom watchers (for businesses and power users)" → "Your own watchers (advanced)", collapsed.
**Accessibility**: checkbox 22 px; textareas have no associated label (the `<h3>` isn't linked) → `aria-labelledby`.
**B**: per-inbox watcher toggles.

### 3.8 Smarter sorting — AiSettings (`views/AiSettings.tsx`)

**Works**: "works out of the box… no account needed" (L63); "✨ Found on this computer" with one "Use it" button (L69-81); keys "encrypted on this computer"; active card outlined.
**Confusing / too many choices**: **12 provider cards** of equal weight (L82-156), each with "Model: gemini-2.5-flash" (L89). Pressing "Connect" **immediately opens the browser** (L40) with no warning. Provider notes from `provider.ts` ("Requires billing setup.", "Any OpenAI-compatible server (self-hosted, llama.cpp, vLLM…)") are fine under "Other providers", not on the front. After connecting, the primary button still says "Reconnect" (L140), which reads like something is wrong. `<h1>Connect AI` (L62) vs hub "AI helper".
**Replace**: "Connect any AI backend for smarter sorting and briefs" (L64) → "Add a free AI for smarter sorting and briefs"; "Model: …" hidden below Pro; "Paste your API key" (L101) → "Paste the key here" + "A key is a long code the website gives you — like a password just for InboxScout."; "Forget key" (L149) → "Remove key" + confirm; three verbs "Use this / Connect / Use it" → "Use"; "That key did not work." → "That key didn't work. Check it was copied completely, then try again."
**Layout**: one recommended card (Gemini: "Free, takes a minute") + detected local AI + "Other providers ▸" collapsed. Button copy "Get a free key — opens your browser".
**Unclear buttons**: "Forget key" may silently drop back to built-in; say so.
**Accessibility**: 24 tab stops before anything else; in-card error not announced.
**Dead end**: no route back to *why* you came ("the Assistant needs this"); pass a reason and show "Once connected, go back to Web chores".

### 3.9 Web chores — Assistant (`views/Assistant.tsx`)

**Works**: contract up front (L98-101); status headings in plain words ("🙋 Your turn", "❓ Quick question", L227-233); big "✓ I'm done — Continue" (L238); live log; "the AI never sees a password" (L123-124).
**Confusing / risky**
- Autonomy is a `<select>` (L116-120) with 90-110-character options; native selects clip them. Must be three radio cards.
- "Full (recommended)" (L117) is both the label and the shipped default; on a family PC that means the browser may leave the site and pass risky pages without asking. Recommend `signin`.
- Saved sign-ins (L127-153): placeholder-only inputs ("email address", "password", L146-147), no reveal, no site name, a ghost "Save". A password manager with none of its affordances. Collapse under "Saved sign-ins (advanced)" with real labels.
- Six recipes + "Something else"; four are owner-only ("Register the Google sign-in app (one-time, owner)"). Split "For you" / "For whoever set up this computer".
- `▶ Start` is disabled until the URL matches `^https?://` (L214); Ruth types "amazon.com". Accept bare domains.
- "⚠ Stopped" for `failed` and "⏹ Stopped" for `stopped` (L231-232) — same word, two outcomes.
- "Captured so far: googleClientId ✓" (L259) — raw keys.
- The `!aiReady` banner (L103-108) has no button.

**Jargon → replacement**

| Current | Replace |
|---|---|
| "🎚 How much should it do on its own?" + "Autonomy" (L113, L115) | "Before it starts: how much may it do alone?" (drop "Autonomy") |
| "Full (recommended) — signs in with my saved sign-ins and keeps going; only verification codes come to me" | Radio card **Do it all** — "Signs in for me and keeps going. Only asks for verification codes." |
| "Sign in for me — but pause on payment/delete pages so I can say yes" | Radio card **Sign in, but ask first** (recommended) — "Signs in for me. Stops and asks before paying, deleting, or leaving the site." |
| "Careful — hand every sign-in and risky page to me" | Radio card **I'll do the sign-ins** — "Opens the page; I sign in and approve anything risky myself." |
| "Saved sign-ins" (L128) | "Website passwords InboxScout may use (advanced)" |
| "Captured so far: googleClientId ✓" (L259) | "Saved so far: Google app ID ✓" (map keys to plain names) |
| "Close assistant window" (L278) | "Close its browser window" (SetupAssistant says "Close helper window" — pick one) |

**Unclear buttons**: "Forget" (L139) `.tiny`, no confirm, on a password. "Save" (L148) with no indication where.
**Inconsistent**: recipe selection = card border; autonomy = select; sign-ins = inline inputs.
**Accessibility**: log box (L262) has no `aria-live`, so "Your turn" is never announced; smooth scroll ignores reduced motion; unlabeled inputs.
**Dead end**: page usable-looking with `!aiReady`, Start disabled, no fix button.

*In progress at time of writing (uncommitted in the working tree):* autonomy rendered as three radio cards with the §3.9 copy inside a `<fieldset>`/`<legend>` ("Do it all" kept first and "(recommended)" by owner decision); saved sign-ins moved under "Advanced: let it sign in for me ▸" with real labels, a Show/Hide toggle, Enter-to-save, and an inline "Forget it / Keep it" confirm; `normalizeUrl` accepts bare domains and shows "It will open https://…"; "⚠ Couldn't finish" / "⏹ Stopped by you"; `role="log" aria-live="polite"` on the log with follow-only-when-at-bottom scrolling and `prefers-reduced-motion`; "Saved so far: Google app ID ✓"; "Close its browser window"; `aria-pressed` on recipe cards; 40-px action buttons. Still open after that change: the `!aiReady` banner has no button; the owner-only recipes are not separated from the personal ones.

### 3.10 Sign-in setup — SetupAssistant (`views/SetupAssistant.tsx`)

**Works**: honest framing (L51-54); per-provider status "✅ Ready (included in this build)" (L62); step list with time estimate (L69); "Prefer to do it yourself?" (L112-115).
**Confusing**: correct installer vocabulary ("app registration", "Google Cloud", "Microsoft Entra", "Client ID/secret") shown to end users. Fix by **audience gating**: hide the hub card unless Pro or a provider is unconfigured; Accounts explains "not set up in this copy".
**Add one plain sentence** at the top: "Google and Microsoft each need a free one-time registration so their sign-in buttons work. You do this once per computer."
**Unclear buttons**: "Redo setup" (L104) — replaces IDs? Say "Redo (replaces the saved IDs)". "Close helper window" (L108) vs Assistant's wording.
**Accessibility**: selected provider card border-only (L58); step jumps `.tiny` (L80).
**Dead end**: after "saved. You can close the companion window." (L98) no "Now connect your Gmail".

### 3.11 Settings — Preferences (`views/Settings.tsx` + `shared/settingsRegistry.ts`)

**Works**
- The registry (`settingsRegistry.ts` L4-7): "nothing can appear without a plain 'what it does' and 'why it's set this way'". `what` always visible (`Settings.tsx` L160), `why`/`who` on request (L161-177).
- Badges "chosen for you / default / you set this" (L155) and "↺ Back to automatic" (L181-185) give the user a model of *who decided*. Search across labels and explanations (L198, registry L380-387). "Show everything" (L199-203) reveals hidden rows. `showWhen` hides dependent fields (weekday, carrier, token, port).
- Profile suggestion banner ("Your mail looks like **Nurse**… Switch / No thanks", L215-227) — explains, offers, lets you decline. Exemplary.
- Level explanation on request (L170-175): "Right now: Simple — because of large text, the retiree profile."

**Confusing / unexplained**
- **Save model still mixed.** Registry rows wait for "Save settings" (L261); `uiLevel` is applied only on save (L106); profile choice applies instantly (L78); "Send test email/text" *silently saves everything* first (L91). Leaving the page loses edits. Autosave per row (the registry makes this trivial: `change` → debounced `setSettings`) with inline "Saved ✓", or block navigation.
- **Bridge on/off shows nothing until Save**: `BridgeDetails` reads `info.enabled` from the main process (L15) while the group condition uses local `settings.bridgeEnabled` (L255); toggling On shows an empty row until the user scrolls down and saves.
- **`simpleMode` "Advanced tools"** (registry L136-145) and **`uiLevel` "How much to show"** (L107-122) both control the Details/Inbox-review tabs (`App.tsx` L102). Remove the `simpleMode` row (derive it from level) or make it Pro-only with "overrides the level".
- **`kind: 'folder'`** (registry L222) falls into the `default:` text input (`Settings.tsx` L142-143) — still a bare path field with no "Choose folder…".
- **`kind: 'toggle'` renders a `<select>`** (L116) with sentence options and five variants of "(recommended)". A switch with the label on the left and `what` beneath is the standard idiom (NN/g toggle guidelines).
- **"↺ Back to automatic"** (L183) appears on *every* non-default row, including "Email me the brief" and "Google client secret", where there is nothing automatic; its tooltip reads "Back to: true" / "Back to: " (L182). Use "Back to default" for unmanaged rows, "Let InboxScout choose" for managed ones, and never print raw `true`/blank.
- **"Why?" is `.tiny`** (L156) — the primary explanation affordance is the smallest target on the page.
- **Group naming vs content**: "What I get" holds `storeFullBodies` and `reportsDir` (storage/privacy); "Helpers & other agents — The Assistant, Hermes, and voice" (registry L41) but voice (`speakBriefs`) is in "What I get". "Advanced — Only if you know why you are here" is good.
- **Search placeholder** "Search settings: voice, text size, Hermes, schedule…" (L198) — "Hermes" is jargon for Ruth.
- **`assistantAutonomy` shown at Simple** (no `minLevel`, registry L227-239) with `why: 'Full is what "just works"'`; a grandparent's Settings page should not lead with browser-automation policy.
- **Two labels for one setting**: "How far the Assistant goes on its own" (registry L230) vs "How much should it do on its own?" (`Assistant.tsx` L113).
- **Profile card side effect**: choosing a profile resets `enabledSkillIds` (L80) — not stated.
- **"Show everything" checkbox** (L201) is the 13-px browser default.
- **Missing from the registry** (so unsearchable and unexplained here): `vipSenders`, `mutedSenders`, `quietPeople` (Skills/People), `enabledSkillIds` (Skills), `ai.provider` (AI page), `ai.customBaseUrl` (AI custom card only), `profileId` (picker). Add read-only "lives in …" rows so search finds them.

**Jargon → replacement (registry strings)**

| Current (registry line) | Replace |
|---|---|
| "Advanced tools" (L139) | remove row, or "Show the sorting tools (overrides the level)" at Pro |
| "Quiet insights" (L149) | "Extra cards on Today" |
| "Text me the headline" (L169) | "Text me the one-line summary" |
| "Phone carrier — Which carrier's text gateway to use." (L179-180) | "Your mobile carrier — needed because texts go through the carrier's free email-to-text service. Not all carriers deliver these reliably; send a test." |
| "Keep full email text on this computer" (L209) | "Keep a copy of email text on this computer" |
| "How far the Assistant goes on its own" (L230) | "Web chores: how much may it do alone?" (same words as the Assistant page) |
| "Agent bridge" (L243) | "Let other AI tools on this PC use InboxScout" |
| "Send each brief to an agent" (L267) | "Also send each brief to another program (web address)" |
| "Agent webhook token — Sent as a bearer token…" (L277-278) | "Secret to send with it — so the other program knows it's really InboxScout" |
| "AI model override" (L289) | "AI model (leave blank for the recommended one)" |
| "Ollama address" (L299) | "Local AI address (Ollama)" |
| "Microsoft app ID" / "Google client ID" / "Google client secret" (L308, L318, L328) | "Microsoft app ID" / "Google app ID" / "Google app secret" — all with "(from Sign-in setup)" |
| "Agent bridge port" (L337) | "Bridge port number" |
| `why: 'Blank means off.'` (L269), `why: 'Optional.'` (L279) | real reasons — see §5 |
| BridgeDetails "REST: … MCP: … Spec: …" (`Settings.tsx` L22-24) | keep, Pro-only, labelled "For developers" |

**Too many choices**: at Standard the page shows ~20 rows in five cards plus the profile picker. The level gating is the right tool; tighten `minLevel` so Simple shows: profile (auto card only), Check automatically + time, How much to show, Text size, Say it out loud, Email me the brief. Everything else Standard/Pro.
**Missing explanations**: mostly solved by the registry; remaining gaps are the seven unlisted keys above and the side effects (profile switch, New token, Forget key).
**Unclear buttons**: "New token" (L30) invalidates every configured agent, no confirm; "Switch" (L220) resets skills silently; "Send test text" gives no feedback for 10-30 s.
**Inconsistent**: toggle-as-select ×9, select ×6, time, text path, password; "(recommended)" appears in nine option strings with three punctuation styles.
**Accessibility**: long option strings clipped; hints 3.77:1; badges 4.39:1 and 3.35:1; `.tiny` Why? / Back / Show / Hide / New token; `<pre>` YAML unlabelled; no `fieldset/legend` for schedule.
**Dead ends**: none, but Simple users who reach it see "Helpers" (autonomy) before anything they care about.

*In progress at time of writing:* the stash carries per-row autosave (`change` → `setSettings` immediately, "Saved ✓" with `role="status"`, a "Changes are saved as you make them" footer, and no Save button), which closes finding #2 for this page once merged. The working tree additionally has `<h1>Settings</h1>`, a "New key… → Every connected tool will need the new key. [Yes, make a new key] [Keep it]" confirm in `BridgeDetails`, and two helpers — `scheduleSummary()` ("InboxScout will check every day at 7:30 AM.") and `riskyNow()` — that are defined but not yet rendered. Still open after both: toggles as `<select>`, `.tiny` "Why?"/"Back", `kind: 'folder'` as a text field, `BridgeDetails` reading server state, the `simpleMode`/`uiLevel` overlap, and the seven keys missing from the registry.

### 3.12 Details — Dashboard (`views/Dashboard.tsx`)

**Works**: counts in headers; "Nothing needs your attention right now."
**Confusing**: `<h1>Dashboard` (L20) ≠ tab "Details". Raw enums: severity pills lowercase (L35); trigger `manual | scheduled | catchup | cli` (L75); status `succeeded | failed` (L77); "12 msgs" (L79); trend glyphs ▲▼▬ with no legend (L16); "Pulse (3 active)" (L48); "Connect an email account and an AI provider, then press Run now." (L24) — the app works without an AI provider and there is no "Run now" button; raw ISO deadline.
**Replace**: "Dashboard" → "Details"; "Pulse" → "Topics"; "Recent runs" → "Recent checks"; `catchup` → "Catch-up", `cli` → "Command line", `manual` → "You pressed the button", `scheduled` → "On schedule"; `succeeded` → "OK"; "msgs" → "emails"; "Run now" → "Check my email".
**Accessibility**: trend by glyph only — add text.
**B**: this is her screen — wants per-inbox columns, `whyNow`, "Open in mail".

*In progress at time of writing (uncommitted):* a rewrite that adopts this section — `<h1>Details`, `TRIGGER_LABEL`/`STATUS_LABEL`/`SEVERITY_LABEL` maps ("You pressed the button", "Finished", "Didn't finish", "Important"), "Topics (n active)", a "▲ more activity · ▬ steady · ▼ quieting down" legend with `aria-label` on each glyph, table headers, "n emails looked at", friendly dates, "Showing 8 of 23", and an "Opening…" state. Still open: per-inbox columns, `whyNow`, "Open in mail".

### 3.13 Inbox review (`views/Review.tsx`)

**Works**: "corrections teach it your preferences" (L56); three chip groups; search on Enter; Fix column shows only the *other* two categories.
**Confusing**: "Sorted as: promotions / noise" (L118, a string replace); Fix buttons "→ promotions/noise" (L126, a different replace); "FYI", "Cold pitch" (L92, L95) vs the good "Receipts & orders" (L94); "Type: Any" vs "Show: All"; `sensitive` pill unexplained (L119); 120 rows, no count, no "14 matches"; corrections give no feedback and no undo; "Search all synced mail…" (L61).
**Replace**: "promotions / noise" → "Ads & noise"; "→ work" → "Move to Work"; "FYI" → "Just information"; "Cold pitch" → "Sales pitch"; "Sorted as" → "Filed under"; "Fix" → "Wrong? Move to"; placeholder → "Search your mail…"; add "Showing 120 most recent · 14 matches"; "run a scan first" (L98) → "press Check my email first".
**Accessibility**: chips and Fix buttons `.tiny`; no `aria-pressed`; active chip fill-only.
**B**: keyboard (arrow rows, W/P/N to refile), bulk select, "why was this filed here?".

---

## 4. Cross-cutting standards to adopt

1. **One name per concept, everywhere.** brief (not report/scan/run) · "Check my email" (not Run now) · Settings (not Preferences) · Smarter sorting (AI) · Web chores · Sign-in setup. Tab label == `<h1>` == hub card.
2. **One control per data type.** Boolean → switch, label left, `what` beneath, saved instantly. ≤4 options → radio cards, one line each (never a `<select>` with sentences). Lists → chips with an add box. Paths → read-only + "Choose…". Secrets → password field with reveal.
3. **One save rule.** Autosave with inline "Saved ✓"; side-effecting changes state the effect; destructive ones confirm; navigation never loses edits.
4. **Every setting has two lines** ("What this does" / "Why we picked this") — the registry already enforces this; §5 supplies reviewed copy for every key, including the seven the registry lacks.
5. **Destructive = confirm; cheap = undo.** Remove account, remove key, forget sign-in, new token → confirm. Done ✓, refile → undo toast.
6. **Level gating is the disclosure mechanism.** Simple: Today (≤4 cards), My briefs, People, Setup (3 cards), Settings (6 rows). Standard: + Details, Inbox review, texts/Drive, storage, "Other providers". Pro: + Developer bridge, Advanced IDs, Sign-in setup, custom watchers, Copy as text. Auto stays as designed (weekly, announced, revertible) — and keeps People visible at every level.
7. **Contrast & size floor.** Text ≥ 4.5:1, UI ≥ 3:1, 2-px `--blue` focus ring on `:focus-visible`, every clickable ≥ 40 px (44 in Simple), base 16 px in Simple across *all* screens, not just Today.
8. **Status is announced and errors are red.** `role="status"` on progress/saved/exported; `role="alert"` on errors; never `.success` for a failure.

---

## 5. Settings inventory (`AppSettings`, `src/shared/types.ts` L276-323)

Reviewed copy, written to be shown verbatim as the `label` / `what` / `why` of each registry row (or as the hint under the control where the setting lives elsewhere). "Default" is `DEFAULT_SETTINGS` today; where the audit recommends a different default, the "Why" is written for today's value and the change is listed in §6.

| Key | Where it lives today | Default | What this does | Why we picked the default |
|---|---|---|---|---|
| `profileId` | Settings → Who is this inbox for; Onboarding step 1 (`ProfilePicker`) | `general` | Tells InboxScout what kind of life and work your mail is about, so it knows what counts as urgent and what to track. | "General" fits everyone until InboxScout has seen enough mail to suggest a closer match. |
| `profileAuto` | same ("Let InboxScout figure it out" card); registry `Choose my profile for me` | `true` | Lets InboxScout pick the best profile from what your mail looks like after each check, instead of you choosing from 52. | Most people don't know which profile fits; real mail is the best clue, and you can lock a choice any time. |
| `schedule.frequency` | registry `Check my email automatically` | `daily` | How often InboxScout checks your email on its own: every day, once a week, or only when you press the button. | A short daily brief is the whole point; weekly is there for light inboxes. |
| `schedule.hour` / `schedule.minute` | registry virtual key `schedule.time` | `7:30` | The time of day the automatic check runs. If the computer was asleep, it runs as soon as it wakes. | Early enough to read with coffee, late enough that overnight mail has arrived. |
| `schedule.weekday` | registry `Which day` (weekly only) | `1` (Monday) | Which day the weekly check runs. | Monday morning sets up the week. |
| `ai.provider` | Setup → AI helper (not in registry) | `builtin` | Which "brain" sorts your mail and writes the brief: the free built-in one, or an AI service you connect. | Built-in needs no account and never sends mail off this computer; connect an AI whenever you want smarter results. |
| `ai.model` | registry `AI model override` | `''` | Forces a specific model name for the connected AI service. Blank uses the one we recommend. | Each service's recommended model is tested with InboxScout; change it only if you know a model you prefer. |
| `ai.ollamaBaseUrl` | registry `Ollama address` | `http://127.0.0.1:11434/v1` | Where to find Ollama if you run a free AI on this computer. | This is Ollama's standard address on your own PC. |
| `ai.customBaseUrl` | AI page → Custom card only (not in registry) | `''` | The address of your own OpenAI-compatible AI server, if you run one. | Blank because almost nobody has one; the Custom card asks for it when needed. |
| `simpleMode` | registry `Advanced tools` (inverted) | `true` | Hides the Details and Inbox review tabs so the app stays to four tabs. (Superseded by "How much to show" — see §6.) | Fewer tabs is easier at first; the Pro layout shows them anyway. |
| `uiLevel` | registry `How much to show`; `App.tsx` level class; switch note | `auto` | How much of InboxScout to show. Simple: one big button and only what needs you. Standard: the full brief. Pro: everything at a glance for several inboxes. Auto picks from how you use it, changes at most once a week, and always tells you. | The right amount differs for a grandparent and a CEO and changes as you settle in; Auto starts calm and only shows more once you've used it. |
| `storeFullBodies` | registry `Keep full email text on this computer` | `true` | Keeps a copy of each email's text on this computer so you can search it and the brief can re-check details. Off keeps only short previews. | Search and follow-ups need the text; it stays on this computer and is only sent to an AI service if you connect one. |
| `launchAtLogin` | registry `Start with the computer` | `true` | Starts InboxScout quietly when you sign in to the computer. | Scheduled briefs can only run if the app is open. |
| `reportsDir` | registry `Where briefs are saved` | `''` (= Documents/InboxScout/Reports) | The folder where each brief is saved as a file you can open, print, or share. | Documents is where people look for their files. |
| `lastRunAt` | shown as "Last checked …" on Today; not a choice | `null` | Records when the last check finished. | — |
| `enabledSkillIds` | Setup → What to watch for (not in registry) | `null` (= profile's defaults) | Which watchers add sections to your brief: bills, appointments, deliveries, deals, and so on. | Each profile turns on the watchers people like you use most; tick or untick any of them. |
| `vipSenders` | Skills → Important people; People → "Always important" (not in registry) | `[]` | People whose mail is always treated as important, whatever it says. | Empty until you name someone; InboxScout also learns your inner circle on its own. |
| `mutedSenders` | Skills → Never bother me about (not in registry) | `[]` | Senders whose mail is filed as noise and kept out of your brief. | Empty until you name one; the sorter already catches most ads by itself. |
| `textSize` | registry `Text size`; `App.tsx` zoom | `normal` | Makes everything in the app bigger: Normal, Large, or Extra large. Large sizes also nudge the layout toward Simple. | Normal matches most screens; choose Large if you lean in to read. |
| `microsoftClientId` | registry `Microsoft app ID`; Sign-in setup | `''` | The ID Microsoft gave this copy of InboxScout so "Sign in with Microsoft" works. | Blank unless whoever installed InboxScout registered it; official builds include one. |
| `googleClientId` | registry `Google client ID`; Sign-in setup | `''` | The ID Google gave this copy of InboxScout so "Sign in with Google" works. | Same as above. |
| `googleClientSecret` | registry `Google client secret`; Sign-in setup | `''` | The matching secret for the Google ID. Kept encrypted on this computer. | Same as above. |
| `deliverEmailTo` | registry `Email me the brief` | `''` (off) | Emails each brief to this address, sent from one of your own connected accounts. | Off until you ask, so nothing leaves this computer by default. |
| `smsPhone` | registry `Text me the headline` | `''` (off) | Texts you the one-line summary after each check. | Off until you ask. |
| `smsCarrier` | registry `Phone carrier` | `''` | Your mobile carrier — needed because texts go through the carrier's free email-to-text service. | No default: carriers differ and a wrong one fails silently, so send a test after choosing. |
| `googleDriveExport` | registry `Save briefs to Google Drive` | `false` | Also saves each brief as a Google Doc and keeps a Google Sheet of open items. Needs "Sign in with Google". | Off so your briefs stay on this computer unless you choose otherwise. |
| `speakBriefs` | registry `Say it out loud` | `false` | Reads a short summary aloud when a scheduled brief is ready, even with the window closed. | Off because a talking computer at 7:30 am surprises people; turn it on if you prefer listening. |
| `insightsEnabled` | registry `Quiet insights` | `true` | Adds cards to Today about your circle, this week's dates, promises you made, and each inbox. They only appear when there's something to say. | On because they cost nothing when quiet and are the most-loved part of the brief. |
| `quietPeople` | People → "Not important" (not in registry) | `[]` | People you've marked as lower priority; their mail is still shown but never called urgent. | Empty until you mark someone. |
| `bridgeEnabled` | registry `Agent bridge` | `false` | Lets other AI tools on this computer (like Hermes) use InboxScout as a tool. | Off so nothing on your PC can read your brief unless you switch it on. |
| `bridgePort` | registry `Agent bridge port` | `47311` | The local door number other tools use to reach InboxScout. Only reachable from this computer. | An unusual number that nothing else uses. |
| `bridgeAccess` | registry `What other agents may do` | `full` | Whether other tools may only read (brief, search, status) or also act (check email, connect accounts, save sign-ins, change settings, drive the Assistant). | Full, because the bridge is off unless you enable it, and people who enable it usually want their agent to act. |
| `assistantAutonomy` | registry `How far the Assistant goes on its own`; Assistant page | `full` | How far the Assistant's browser may go alone: do everything, sign in but ask before risky steps, or hand every sign-in to you. Verification codes always come to you. | Full so chores finish without interruptions; every step is visible and Stop is always one click away. |
| `agentWebhookUrl` | registry `Send each brief to an agent` | `''` (off) | Sends each new brief to another program's web address after every check. | Off until you give an address, so nothing is sent anywhere by default. |
| `agentWebhookToken` | registry `Agent webhook token` | `''` | A secret sent along with the brief so the other program knows it really came from InboxScout. | Blank because most programs on your own computer don't need one. |

Not in the registry today (unsearchable, unexplained on the Settings page): `ai.provider`, `ai.customBaseUrl`, `enabledSkillIds`, `vipSenders`, `mutedSenders`, `quietPeople`, `profileId`.

---

## 6. Prioritized fix list

P0 = blocks a persona, loses data, or breaks trust. P1 = makes "grandparent or CEO" real. P2 = polish.

### P0

| # | File · component | Change |
|---|---|---|
| P0-1 | `views/Onboarding.tsx` · step 2 (L110-152) | Add "Sign in with Google" / "Sign in with Microsoft" (reuse `signInGoogle`/`signInOutlook`; show only when configured) above the app-password form; make `preset.help` a real "How do I get an app password?" button; add Outlook to the list; password reveal; Enter submits; branch step 3 copy when skipped. |
| P0-2 | `views/Settings.tsx` L98-109, L261; `views/Setup.tsx` L22 | Autosave per row (`change` → debounced `setSettings` + inline "Saved ✓" with `role="status"`), or intercept `setSub('hub')` and sidebar navigation with "Unsaved changes — Save / Discard". Stop `testDelivery` (L91) from saving silently. |
| P0-3 | `views/Today.tsx` L109-117 | Compute `hasAnything` from what the current level will render (or fall back to the all-clear card when the grid renders zero cards). |
| P0-4 | `views/Accounts.tsx` L146; `views/AiSettings.tsx` L149; `views/Assistant.tsx` L139; `views/Settings.tsx` L30 | Inline confirm ("Remove you@…? [Remove] [Keep]") and upgrade from `.tiny` to `.ghost` ≥ 40 px. |
| P0-5 | `src/shared/types.ts` L361-362; `settingsRegistry.ts` L231-238, L254-255; `views/Assistant.tsx` L117 | `assistantAutonomy` default → `'signin'` (move "(recommended)" there); `bridgeAccess` default → `'read'`; rewrite `why` lines accordingly. |
| P0-6 | `views/Accounts.tsx` L227-232 | Remove the inline "Your Google password" field; keep only "you'll sign in yourself in its window". Disable "Let the assistant do it" (L234) when `aiReady` is false, with a button to Smarter sorting. |
| P0-7 | `styles.css` L93 + new rule | `button, input, select, textarea, [role=button] { &:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px } }`; delete the `--blue-soft` outline. |
| P0-8 | `styles.css` L6, L12, L70, L68/L71, L167-168 | `--ink-faint: #5f6879`; `--good: #22663f`; `.pill.medium { color: #7a5100 }`; low/noise pills and `.badge.muted` use `--ink-soft`. Re-measure. |
| P0-9 | `styles.css` L74-85, L139, L142; `views/Settings.tsx` L201 | `.ghost, .primary { min-height: 40px }` at all levels; `.tiny { min-height: 36px; padding: 6px 10px }` (or delete `.tiny` and its 30 usages); checkbox 24 px; `.back-link { padding: 10px 0 }`. |
| P0-10 | `views/Accounts.tsx` L172-184, L180/L261 | Render the Google card only when a Google client is configured (expose from `setupInfo`); otherwise one line "Sign in with Google isn't set up in this copy — use an app password, or ask whoever set up InboxScout." Remove the duplicate error banner. |
| P0-11 | `views/Today.tsx` L174, L66, L71; `views/Reports.tsx` L25 | `className={ok ? 'success' : 'error'}`; auto-dismiss success after 6 s; `role="status"`. |
| P0-12 | `App.tsx` L84, L98; `views/Today.tsx` L96 | Replace `<div />` with "📬 InboxScout — opening…"; don't render the layout until `ui` resolves (avoids the Standard→Simple flash). |
| P0-13 | `settingsRegistry.ts` L136-145; `App.tsx` L102 | Remove the `simpleMode` row (derive from level), or make it Pro-only labelled "Show the sorting tools (overrides the level)". |

### P1

| # | File · component | Change |
|---|---|---|
| P1-1 | `views/Setup.tsx` L40-69 | Rename per §3.5; order Email accounts / What to watch for / Settings first; "More setup options ▸" for Smarter sorting, Web chores, Sign-in setup in Simple; hide Sign-in setup unless Pro or unconfigured. Make every `<h1>` equal its hub/tab label (`AiSettings.tsx` L62, `Dashboard.tsx` L20, `Skills.tsx` L37, `Settings.tsx` L193). |
| P1-2 | `App.tsx` L99-104 | Keep the People tab at Simple. |
| P1-3 | `views/Settings.tsx` L111-145 | Render `kind: 'toggle'` as a switch (label left, `what` beneath); `kind: 'select'` with ≤4 options as radio cards; `kind: 'folder'` as read-only path + "Choose folder…" (new IPC). Drop "(recommended)" from option strings — the badge already says "default". |
| P1-4 | `views/Settings.tsx` L156-158, L181-185 | "Why?" and "Back" as `.ghost` ≥ 36 px; label "↺ Back to default" for unmanaged rows, "Let InboxScout choose" for managed; never show raw `true`/blank in the tooltip. |
| P1-5 | `views/Settings.tsx` L15, L255 | Show `BridgeDetails` from local state after the toggle (or autosave), with "starting…" until `info.running`. |
| P1-6 | `settingsRegistry.ts` | Apply the §5 copy; add `minLevel: 'standard'` to `assistantAutonomy`; add read-only "lives in …" rows for the seven missing keys; move `storeFullBodies`/`reportsDir` to a "Storage & privacy" group; move `speakBriefs` to "Looks & comfort" or fix the Helpers blurb; search placeholder without "Hermes". |
| P1-7 | `views/Assistant.tsx` L112-126 | Autonomy as three radio cards (copy in §3.9); same component summarised read-only in Accounts. Collapse Saved sign-ins under "advanced" with real labels, a site field, and reveal. |
| P1-8 | `views/Today.tsx` L6-16, L186-384 | ⓘ → word button "Why?" / "Hide", `.ghost`, `aria-expanded`, explanation rendered as a `<p>` *after* the `<h3>`; fixed card order with Needs-you full width; counts in headers; "Open email" links from `sources`/`messageId`; Undo toast on Done; gate "Sensitive" at Simple; "More ▾" for the export buttons outside Simple. |
| P1-9 | `views/Today.tsx` L136-144; `types.ts` | Inbox chips become filters; add `accountId` to `BriefIssue` and `waitingOnYouDetails` in the pipeline. |
| P1-10 | `views/Onboarding.tsx` L86-108 | Auto card only + "Choose myself ▸"; add a "Text size: Normal / Large" choice on step 0. |
| P1-11 | `views/AiSettings.tsx` L82-156 | Recommended card + detected local AI + "Other providers ▸"; "Get a free key — opens your browser"; connected state as text + "Change key". |
| P1-12 | `views/People.tsx`, `views/Skills.tsx` L59-89 | Move the three people lists into People as chip lists with an add box; Skills links there; `unknown` → "Someone"; buttons "Always important" / "Lower priority" ≥ 40 px. |
| P1-13 | `App.tsx` L108-119, L122-134 | `aria-current="page"` on active tab; `role="status"` on `.status`; move progress to a 15-px content banner; hide the sidebar run button on Today (or identical labels); level note in a neutral panel with sentence-case reasons. |
| P1-14 | `views/Review.tsx`, `views/Dashboard.tsx` | Plain labels for every enum (§3.12/3.13); chips ≥ 36 px with `aria-pressed`; result counts; undo after refile. |
| P1-15 | `views/Assistant.tsx` L146-147, L214, L231-232, L262 | Real `<label>`s; accept bare domains; "Couldn't finish" vs "Stopped by you"; `aria-live="polite"` on the log. |
| P1-16 | `styles.css` | `@media (prefers-reduced-motion: reduce)`; `@media (forced-colors: active)` with a text "Selected ✓" for cards; `.level-simple` base `font-size: 16px` for *all* screens and the sidebar. |
| P1-17 | `views/Settings.tsx` L78-83, L220 | Before `chooseProfile`, state "Switching resets What to watch for to this profile's defaults — Keep my list / Reset". |

### P2

| # | File · component | Change |
|---|---|---|
| P2-1 | `views/Reports.tsx` | Friendly dates + "Weekly" pill; "Saved in your Reports folder — Open · Show folder"; iframe grows with content; `title` per brief; search across briefs. |
| P2-2 | `views/Today.tsx` | "Reading time: 2 min" under the headline; keyboard shortcut for Check my email; "Last checked today at 7:31 am". |
| P2-3 | `views/SetupAssistant.tsx` | Plain first sentence; "Redo (replaces the saved IDs)"; "Now connect your Gmail" after capture; step jumps ≥ 36 px; unify "Close … window" wording with Assistant. |
| P2-4 | `views/Skills.tsx` L48-49, L92-108 | Collapse "Your own watchers (advanced)"; show "sends to your agent" only when a webhook is set; `aria-labelledby` on textareas. |
| P2-5 | `settingsRegistry.ts` L176-186; `views/Settings.tsx` L240-254 | Carrier hint per §5; "Sent — texts can take a minute" feedback. |
| P2-6 | `views/Dashboard.tsx` | Show `whyNow`; per-inbox column; "Open in mail". |
| P2-7 | all views | `<span aria-hidden="true">` around decorative emoji; `<h2>` per card group. |
| P2-8 | `views/Accounts.tsx` L142, L266 | Friendly provider names; "Now press Check my email" after connecting; one Cancel position. |
| P2-9 | `shared/adapt.ts` L118-122 | Level blurbs mention "your circle" for Pro but People is hidden at Simple — align once P1-2 lands. |

### 6.4 Fix status observed at time of writing (02:15 UTC)

"Stashed" = present in `stash@{0}`, not in the working tree. "Working tree" = uncommitted edits present now. "Open" = not seen anywhere. Re-check against `git log` before relying on this column.

| Fix | Status | Evidence |
|---|---|---|
| P0-1 Onboarding sign-in paths | Open | — |
| P0-2 Settings autosave / unsaved-changes guard | Stashed | `Settings.tsx` "Apply on change (no Save button to forget)" |
| P0-3 Simple empty-grid dead end | Open | `hasAnything` unchanged in both versions |
| P0-4 Confirm on destructive actions | Partly: Disconnect (stashed, "Disconnect… → Yes, disconnect / Keep it"); Forget sign-in (working tree); New key (working tree). Forget key on the AI page still open | `Accounts.tsx`, `Assistant.tsx`, `Settings.tsx` diffs |
| P0-5 Defaults `signin` / `read` | **Declined for the Assistant by owner decision** ("Full stays first and recommended"); `bridgeAccess` still `'full'` | `Assistant.tsx` comment on `AUTONOMY_OPTIONS` |
| P0-6 Remove inline Google password in Accounts | Open | `Accounts.tsx` L227-232 unchanged |
| P0-7 `:focus-visible` ring | Stashed | `styles.css` L93-94 (3-px `--blue`) |
| P0-8 Contrast tokens | Partly stashed: `--ink-faint: #5b6473` (5.97:1 on white, 5.32:1 on `--surface`), `.hint` 13 px, sidebar status `#a9b1bf` 13 px (7.20:1), base 15 px. `--good` (4.39:1) and `.pill.medium` (4.29:1) still open | `styles.css` stash |
| P0-9 Target sizes | Partly: `.tiny` → 13 px / `min-height: 32px` (stashed) — still under 40; Assistant action buttons 40 px (working tree). `.ghost`/`.primary` at Standard/Pro, checkboxes, `.back-link` open | `styles.css` L85, `Assistant.tsx` `actionBtn` |
| P0-10 Gate the Google card | Open | — |
| P0-11 Green error banners | Open | `Today.tsx` L174/L187, `Reports.tsx` L25 |
| P0-12 Loading placeholder / level flash | Placeholder stashed ("📬 InboxScout — opening…", `role="status"`); level flash open | `App.tsx` stash L110-116 |
| P0-13 `simpleMode` vs `uiLevel` | Open | `App.tsx` L134 still `level === 'pro' \|\| !settings.simpleMode` |
| P1-1 Names (Settings, Smarter sorting, Details) | Partly: `<h1>Settings` and `<h1>Details` (working tree); "Setup → Smarter sorting" in the Assistant banner; hub cards and AI page unchanged | diffs |
| P1-7 Autonomy radio cards; sign-ins collapsed | Working tree | `Assistant.tsx` diff |
| P1-8 Today: Undo on Done, `whyNow`, `sources` at Pro, "Delegate" at Pro | Stashed (12-s Undo with `reopenIssue`; "Because: …"; "From: …"; "↗ Delegate") | `Today.tsx` stash L90-107, L217-225 |
| P1-13 `aria-current`, `role="status"` on progress, keyboard R / 1-6 / / | Stashed; sidebar run button and status hidden at Simple | `App.tsx` stash L52-75, L143-157 |
| P1-14 Dashboard plain labels | Working tree | `Dashboard.tsx` diff |
| P1-15 Assistant labels, bare domains, "Couldn't finish", `aria-live` | Working tree | `Assistant.tsx` diff |
| P1-16 `prefers-reduced-motion` | Stashed (global) + working tree (Assistant scroll) | `styles.css` L95 |
| Level-aware copy table (`src/renderer/src/copy.ts`, `SIMPLE_JARGON` test) | Working tree, wired into `App.tsx` only; `Today.tsx` still uses literals | `copy.ts`, `tests/copy.test.ts` |

---

## 7. What already meets the bar (keep, and reuse as patterns)

- Microsoft device-code flow (`Accounts.tsx` L186-212) — big code, one button, honest waiting text.
- Profile suggestion banner (`Settings.tsx` L215-227) — explain, offer, allow decline.
- Level switch note (`App.tsx` L122-134) + restraint rules (`adapt.ts` L94-109) — calm, revertible, explained.
- Registry contract (`settingsRegistry.ts` L4-7) and the "chosen for you / default / you set this" badges.
- "Draft reply opens your own mail app… you review and send" (`Today.tsx` L233) — consequence stated before the click.
- Simple-level CSS (`styles.css` L149-155).

---

## 8. References

- WCAG 2.2: [1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) · [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) · [2.4.11 Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) · [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) · [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html) · [3.3.4 Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) · [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- Nielsen Norman Group: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [Usability for Senior Citizens](https://www.nngroup.com/articles/usability-for-senior-citizens/) · [Children's UX](https://www.nngroup.com/articles/childrens-websites-usability-issues/) · [Toggle-Switch Guidelines](https://www.nngroup.com/articles/toggle-switch-guidelines/) · [Checkboxes vs. Radio Buttons](https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/) · [Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/) · [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) · [Empty States](https://www.nngroup.com/articles/empty-state-interface-design/) · [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/) · [Placeholders in Form Fields Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/) · [Listboxes vs. Dropdown Lists](https://www.nngroup.com/articles/listbox-dropdown/) · [Simplicity vs. Choice](https://www.nngroup.com/articles/simplicity-vs-choice/) · [The Inverted Pyramid](https://www.nngroup.com/articles/inverted-pyramid/)
- Apple Human Interface Guidelines: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [Layout — 44×44 pt minimum hit target](https://developer.apple.com/design/human-interface-guidelines/layout)
- Microsoft: [Inclusive Design](https://inclusive.microsoft.design/) · [Guidelines for targeting (40×40 epx)](https://learn.microsoft.com/en-us/windows/apps/design/input/guidelines-for-targeting) · [Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/)
- GOV.UK Design System: [Question pages — one thing per page](https://design-system.service.gov.uk/patterns/question-pages/) · [Writing for GOV.UK](https://www.gov.uk/guidance/content-design/writing-for-gov-uk) · [plainlanguage.gov guidelines](https://www.plainlanguage.gov/guidelines/)
- Calm technology (Amber Case): [calmtech.com principles](https://calmtech.com/) — require the smallest possible amount of attention; inform without alarming.
- Executive briefing: [BLUF — Bottom Line Up Front](https://en.wikipedia.org/wiki/BLUF_(communication)); one page, decisions-needed first.
- Media queries: [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) · [`forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
