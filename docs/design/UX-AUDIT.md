# InboxScout UX audit

Date: 2026-09-06. Scope: the renderer as it exists today. No code was changed.

Files audited, line by line:

- `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, `src/renderer/src/main.tsx`
- `src/renderer/src/views/` — `Onboarding`, `Today`, `Reports`, `People`, `Setup`, `Accounts`, `Skills`, `AiSettings`, `Assistant`, `SetupAssistant`, `Settings` (incl. `BridgeCard`), `ProfilePicker`, `Dashboard`, `Review`
- `src/shared/types.ts` (`AppSettings`, `DEFAULT_SETTINGS`)
- Strings that reach the screen from the main process: `src/main/ai/provider.ts` (provider notes), `src/main/mail/imap.ts` (`PROVIDER_PRESETS.help`), `src/main/agent/policy.ts` (recipe names), `src/main/delivery` (carrier list).

Two personas were walked through every screen:

- **Persona A — "Grandma Ruth / Sam, 10"**: shares the family PC, reads at 14px with effort, uses a mouse only, does not know what IMAP, an app password, OAuth, a webhook, or a model is. Anything with two similar-sounding choices is a coin flip. If a screen has nothing to press, she closes the app.
- **Persona B — "Dana, CEO"**: three inboxes (personal Gmail, work Google Workspace, a board Outlook), ~200 emails/day, ten minutes at 7:30 a.m. Wants the bottom line first, wants to know which inbox, wants to correct the machine fast, and will not give an app her real Google password.

Method: Nielsen's 10 heuristics, WCAG 2.2 AA (with the AAA target-size guidance from Apple/Microsoft), NN/g guidance on seniors, children, progressive disclosure and toggles, calm-technology principles, and the BLUF executive-brief format. Contrast ratios below were computed from the exact hex values in `styles.css`, not estimated.

---

## 1. Executive summary — the ten things that matter most

| # | Finding | Who it hurts | Where |
|---|---|---|---|
| 1 | **First run dead-ends on "App password".** Onboarding step 2 offers only email + 16-character app password; no Google/Microsoft sign-in, no "let the assistant do it", no clickable help. Ruth cannot finish; Dana's Workspace account may block app passwords entirely. | A, B | `Onboarding.tsx` L246-288 |
| 2 | **Preferences silently discard unsaved changes.** Nine fields need "Save settings" at the very bottom; "← Back to Setup" and the sidebar tabs throw them away with no warning. Meanwhile profile choice, bridge on/off and skill checkboxes save instantly. Nobody can predict which is which. | A, B | `Settings.tsx`, `Setup.tsx` L22 |
| 3 | **Destructive actions with no confirmation and 17-px targets**: "Disconnect & forget password", "Forget key", "Forget" (saved sign-in), "New token". | A, B | `Accounts.tsx` L218, `AiSettings.tsx` L493, `Assistant.tsx` L137, `Settings.tsx` L50 |
| 4 | **Three things are called helper/assistant** ("AI helper", "Assistant", "Connect helper") and sit side by side on the Setup hub. Ruth cannot tell them apart; Dana wastes clicks. | A, B | `Setup.tsx` L50-64 |
| 5 | **Hint text fails contrast** — `#7b8494` on white is 3.77:1 at 12px (needs 4.5:1). Hints carry most of the explanations in the app, so the explanations are the least readable text. Keyboard focus on inputs is a 1.17:1 outline (invisible). | A | `styles.css` L235, L224 |
| 6 | **Booleans are rendered five different ways**: `<select>` Yes/No, `<select>` On/Off, checkbox, chip, selected card. Long option strings ("Full — also check email now, connect accounts, save sign-ins, change preferences, run the Assistant") get clipped by the native `<select>`. | A, B | `Settings.tsx`, `Skills.tsx`, `Review.tsx` |
| 7 | **Risky defaults**: `assistantAutonomy: 'full'` and `bridgeAccess: 'full'` are the shipped defaults, and Accounts invites the user to type their real Google/Yahoo/Apple password. | A, B | `types.ts` L361-362, `Accounts.tsx` L300-305 |
| 8 | **The Today screen has no "for Dana" layer**: no per-inbox filter, no counts in card headers, no source link back to the email, cards in code order rather than urgency order, no keyboard shortcuts. | B | `Today.tsx` |
| 9 | **Jargon leaks everywhere**: "scan", "run", "IMAP", "OAuth client ID", "bearer token", "MCP", "REST", "model override", "promotions_noise", "cold pitch", "transactional", "trigger: catchup", "succeeded". | A | many, listed per screen |
| 10 | **Two screens are silent while loading** (`return <div />`) and three success banners show errors in green. | A | `App.tsx` L74, `Today.tsx` L59, `Today.tsx` L128, `Reports.tsx` L364 |

The good news: the product's *ideas* are already right for both personas — one big button, a brief instead of an inbox, "Everything has a sensible default", read-only promise repeated, "Let InboxScout figure it out" first. The work is consistency, copy, and a few missing paths, not a redesign.

---

## 2. Global: app shell and stylesheet

### What works
- Sidebar with four plain tabs in Simple Mode; "Details" and "Inbox review" hidden until asked for (`App.tsx` L12-21). This *is* progressive disclosure.
- One accent color, one destructive color, one success color. Emoji as icons are cheap and legible at any zoom.
- `label.field` wraps every input, so labels are programmatically associated (WCAG 1.3.1, 3.3.2) for free.
- Text-size preference zooms the whole UI (`App.tsx` L37) — a real accessibility feature with a three-line implementation.
- `.big-btn` is 53px tall, 18px bold: exactly what Persona A needs for the main action.

### What is confusing or unexplained
- **Two "check email" buttons on the same screen** with different labels: sidebar "✉ Check my email" (`App.tsx` L101) and hero "✉ Check my email now" (`Today.tsx` L111). Ruth asks "which one?". Keep the sidebar one everywhere except Today; on Today hide it (or make both identical).
- **Status line** (`App.tsx` L99) is 12px grey (`#828b9c`, 4.53:1 — barely passes) tucked at the bottom of a dark sidebar. Progress ("Starting…", phase detail, "Problem: …") is the only feedback during a run that can take minutes. Errors land here too. It should be a banner on the content side, in 14-15px, with `role="status"` (WCAG 4.1.3).
- **Blank screen while loading**: `if (onboarding === null || settings === null) return <div />` (`App.tsx` L74) and `if (latest === undefined) return <div />` (`Today.tsx` L59). On a slow family PC Persona A sees a white window for 1-3 seconds and may double-click the icon again. Show the brand and "Opening…".
- Tab labels vs page titles disagree: tab "Details" → page "Dashboard"; tab "My briefs" → list says "No reports yet."; hub "AI helper" → page "Connect AI"; hub "What to watch for" → page "What should InboxScout watch for?". Every page `<h1>` must equal the label that got the user there (Nielsen #4, consistency; #6, recognition over recall).

### Accessibility (measured)

Contrast, computed from `styles.css`:

| Pair | Ratio | WCAG 1.4.3 AA (4.5:1 text / 3:1 large & UI) | Where used |
|---|---|---|---|
| `--ink-faint #7b8494` on white | **3.77:1** | Fail (12-13px text) | `.hint`, `.sub`, `th`, `.empty`, `.today-card .next` fallbacks — i.e. every explanation |
| `--ink-faint` on `--paper` | **3.64:1** | Fail | page subtitles |
| `--ink-faint` on `--surface #f2f2ec` | **3.35:1** | Fail | `.pill.low`, `.pill.promotions_noise` (11px bold) |
| `--good #2e7d4f` on `--good-soft` | **4.39:1** | Fail (just) | `.success` banners, `.pill.personal` |
| `#9a6a12` on `#fdf3e0` | **4.29:1** | Fail | `.pill.medium` |
| `--red` on `--red-soft` | 4.60:1 | Pass | `.error`, `.pill.urgent` |
| `--blue` on white / white on `--blue` | 7.10:1 | Pass | buttons, links |
| sidebar `#b3bac7` on `#1e2430` | 7.97:1 | Pass | nav |
| sidebar status `#828b9c` on `#1e2430` | 4.53:1 | Pass (barely) | status line |
| focus outline `--blue-soft` on white | **1.17:1** | Fail 1.4.11 (needs 3:1) | `input:focus, select:focus` L224 |
| card border `--line` on white | 1.41:1 | n/a for decoration, but fails as the *only* selection indicator | `.provider-card.active`, selected `hub-btn` |
| attention-card border `#e8b4b0` | 1.75:1 | Fail as the only "this is urgent" cue | `.today-card.attention` |

Fix: `--ink-faint` → `#5f6879` (≈5.6:1 on white) and keep `--ink-soft` for secondary text; `--good` → `#22663f`; medium pill text → `#7a5100`; focus outline → `2px solid var(--blue)` + `outline-offset: 2px` on `:focus-visible` for **every** interactive element, not just inputs (WCAG 2.4.7, 2.4.11).

Target size (WCAG 2.2 2.5.8 requires 24×24 px minimum at AA; 2.5.5 / Apple HIG / Microsoft recommend 44×44 / 40×40):

| Control | Computed height | Verdict |
|---|---|---|
| `button.tiny` (11px text, 2px padding) | **≈17-19px** | Fails even 24px AA. Used for destructive actions (Disconnect, Forget, New token), People "Always important / Not important", Review "Fix" buttons, Report "Open file". |
| `button.ghost` | ≈28px | Passes AA, fails 44px target for Persona A. Used for "Done ✓", "Draft reply", "Read it to me". |
| `button.primary` | ≈32px | Same. |
| sidebar tab button | ≈36px | Same. |
| `input, select` | ≈36px | Same. |
| `.skill-row input[type=checkbox]` | 22px | Fails 24px AA (label click area saves it, but the visual box is tiny). |
| `.big-btn`, `.hub-btn` | 53px / 90px+ | Pass. |

Fix: raise `.ghost` and `.primary` to `min-height: 40px`, retire `.tiny` (use `.ghost` with `min-height: 36px` and a 44px hit area via padding), checkbox 24px.

Other global accessibility gaps:
- **Keyboard**: all controls are real `<button>`/`<input>`/`<select>`, so Tab works, but: no visible focus on buttons beyond the browser default (which `outline: none` does not remove here, but the custom input outline is invisible); no `aria-current="page"` on the active sidebar tab; Review chips have no `aria-pressed`; no skip-to-content; no keyboard shortcut for "Check my email" (Persona B expects `Ctrl/Cmd+R`-like); Enter in the Onboarding/Accounts password field does not submit.
- **Reliance on color** (WCAG 1.4.1): overdue schedule lines are red text only (`Today.tsx` L216); the "attention" card is a pink border only; selected profile/recipe/provider cards are a blue border only (no check mark unless `auto`); the active Review chip is fill only (text is the same). Add a prefix ("Overdue:", "‼"), a "✓ Selected" label, or an icon in each case.
- **Motion**: `scrollIntoView({ behavior: 'smooth' })` in Assistant ignores `prefers-reduced-motion`.
- **Forced-colors / high-contrast mode** (Windows, used heavily by older adults): border-only selection states and `box-shadow` rings vanish. Add `@media (forced-colors: active)` fallbacks or use an explicit "Selected" text.
- **Base font 14px**. NN/g and Apple recommend ≥16px body for older adults; the "Large" preset (16.8px) should be the default when the auto-detected profile is in the `life` group (retiree, etc.), and the very first Onboarding screen should offer "Make text bigger" before anything else.
- **Emoji inside button labels** ("✉ Check my email now", "✍ Draft reply") are read aloud by screen readers as "envelope", "writing hand". Wrap decorative emoji in `<span aria-hidden="true">`.
- **Placeholders as the only example** ("you@example.com", "16-character app password") disappear on typing; fine as examples, but never as the label (NN/g placeholders). Accounts is fine; Assistant's sign-in inputs at L145-146 use placeholder-only labels ("email address", "password") — add real labels.

---

## 3. Screen-by-screen

Each screen: what works → confusing/unexplained → jargon table → too many choices → missing "what does this do" → unclear buttons → inconsistent patterns → accessibility → dead ends → persona notes.

### 3.1 Onboarding (`views/Onboarding.tsx`)

**What works**
- Three numbered steps, one card each, ≤560px wide, generous whitespace. "Step 1 of 3 — …" headings. "Set up later" and "Skip for now" exist.
- Step 0 copy is honest and short: "it can never send or delete anything".
- Step 3 tells the user what will happen next ("scan every morning at 7:30 and save your brief to Documents").

**Confusing / unexplained**
- Step 1 shows the full 52-profile picker to a first-time user. The "Let InboxScout figure it out" card is selected by default, but five collapsible groups with 10-11 cards each are still on screen. Persona A does not know whether she must pick one. Persona B is fine but it is still a speed bump. → Show only the auto card + a small "Choose myself" link that reveals the picker (progressive disclosure).
- Step 2: "App password" is presented with no explanation of what it is, why the normal password does not work, or how to get one. The only help is `preset.help` text ("Requires 2-Step Verification. Create an app password at myaccount.google.com/apppasswords.") — a URL that is **not a link** and cannot be clicked. This is the single biggest first-run cliff.
- Step 2 omits **Outlook / Microsoft** entirely (Accounts has it), and omits **Sign in with Google** and **Let the assistant do it**, both of which exist on the Accounts screen. So the easiest paths are hidden at the moment they matter most.
- Step 3 says "save your brief to Documents" but `reportsDir` default is `''` — verify that copy matches the resolved folder, or say "your Documents folder" only when true.
- "Next" on Step 1 is below the whole picker; when the picker is open the button scrolls off-screen.

**Jargon → replacement**

| Current string (file:line) | Replace with |
|---|---|
| "Somewhere else (IMAP)" (L255) | "Another email service" |
| "App password" (L264) | "App password (a special 16-character password your email service makes for apps — not your normal password)" plus a **"How do I get one?"** link that opens the provider page |
| "IMAP server" (L275) | "Incoming mail server (ask your email provider)" |
| "Run my first scan" (L301) | "Check my email now" (same wording as the big button everyone will see next) |
| "Testing connection…" (L281) | "Connecting…" |
| "Step 3 of 3 — You're set" (L292) | "All set" (drop the check mark suffix logic; say "Connected: you@…" as a line instead) |

**Too many choices in one place**: 52 profile cards in Step 1 (see above).

**Missing explanations**: what an app password is; why 2-Step Verification is required; that the password is stored encrypted on this computer (Accounts says this; Onboarding does not).

**Unclear buttons**: "Skip for now" on Step 2 → goes to Step 3 which says "You're set" even though nothing is connected; Persona A believes it worked. Step 3 should branch: "You haven't connected an email yet — you can do it any time from Setup → Email accounts."

**Inconsistent patterns**: "Where is your email?" here vs "Email provider" in Accounts; "Somewhere else (IMAP)" vs "Other (IMAP)".

**Accessibility**: Enter does not submit; error banner appears below the fold on small windows; the picker's group toggle buttons are `ghost` (28px).

**Dead ends**: a Gmail user without 2-Step Verification cannot proceed and is not told why; Outlook users have no option at all.

**Persona A**: cannot finish alone today. **Persona B**: can, but with app passwords for three inboxes (Workspace admins often disable them) — she needs the Google/Microsoft buttons here.

### 3.2 Today (`views/Today.tsx`) — the home screen

**What works**
- Headline first (BLUF), then cards that only appear when non-empty; "You're all caught up" state with a big check. This is calm technology done right: the screen is quiet when life is quiet.
- Inline actions on items: "Done ✓", "✍ Draft reply", "✍ Follow up", with an honest hint ("opens your own mail app… you review and send").
- "Read it to me" — real, cheap accessibility.
- Inbox chips (L99-107) when more than one inbox — the seed of the CEO view.

**Confusing / unexplained**
- Card **order is code order**, not importance order: Needs you → Waiting for your reply → Promises → This week → Circle → skill sections → How things are going → Others owe you → Done recently → Personal → Sensitive. With CSS grid `auto-fit` the visual order also reflows by width, so "Needs you" can land beside "Your circle". Persona B wants a strict order with the attention card full-width at the top; Persona A wants fewer cards (max 3-4 in Simple).
- **No counts** in headers ("Needs you (4)"). Dana scans counts before reading.
- **No link to the source email**. `BriefIssue.sources` exists in the type but is never rendered. Both personas ask "which email is this from?".
- **No per-inbox filter**. The chips are informational only. Dana with three inboxes cannot say "show me the board inbox".
- "Last checked 9/6/2026, 7:31:12 AM" — `toLocaleString()` with seconds. Say "Last checked today at 7:31 am" / "yesterday at 7:31 am".
- Export success message (`exportMsg`, L128) never dismisses and **errors are rendered in green** (`className="success"` regardless of `r.ok`).
- "📄 Export list (CSV)" and "📅 Add dates to calendar" sit next to "Read it to me" as equal-weight buttons. For Persona A, CSV is noise; for Persona B, both belong under a "Share / Export" menu.
- "Sensitive items noticed — A heads-up only — nothing is hidden." Good intent, but Persona A reads "sensitive" as "danger". Rename "🔒 Private or confidential mail spotted".
- "How things are going" (pulse) shows project names Persona A never named. Explain once: "Topics InboxScout is following in your mail".
- "Regulars:" (L237) in the This-week card — unexplained. "Repeats every week:".

**Jargon → replacement**

| Current string | Replace with |
|---|---|
| "Export list (CSV)" (L122) | "Save as spreadsheet" (and move under a "More" menu in Simple) |
| "Regulars: …" (L237) | "Every week: …" |
| "Sensitive items noticed" (L326) | "Private or confidential mail spotted" |
| "How things are going" (L283) | "Topics I'm following" (Persona A) / keep "Pulse" only in Details |
| "Others owe you a reply" (L296) | "You're waiting on" |
| "Waiting for your reply" (L163) | "They're waiting on you" (parallel to the above) |
| "Connect an email account in Setup, then check your email to get your first brief." (L91) | "First, connect your email." + a button "Connect my email" that jumps to Setup → Email accounts (today the text is not a link) |

**Too many choices**: up to 11 cards plus 4 buttons. In Simple show at most: Needs you, They're waiting on you, This week, and one "More" card that lists the rest as one-line links.

**Unclear buttons**: "Done ✓" — done means what? It resolves the tracked issue permanently and it disappears with no undo. Add a 5-second "Undo" toast (NN/g: prefer undo over confirmation for low-cost actions). "Check my email now" while running is just disabled; show progress phases in the hero ("Reading your mail… 2 of 3 inboxes").

**Inconsistent patterns**: "Done ✓" (check after) vs "✍ Draft reply" (icon before); "‼" prefix for conflicts but colour-only for overdue.

**Accessibility**: overdue lines colour-only (L216); ghost buttons 28px; no heading levels between `<h1>Today` and card `<h3>` (skip `h2` — screen readers rely on the outline); `<ul>` items with buttons inside `<span>` are fine.

**Dead ends**: the "no accounts" headline has no button; the "brief exists but zero accounts" case (user disconnected) shows the old brief with no notice.

**Persona A**: this screen already nearly works — needs bigger cards, fewer of them, no CSV, and a button in the empty state. **Persona B**: needs order, counts, source links, inbox filter, keyboard `J/K`-style navigation or at least Tab order that goes item→action, and a "reading time: 2 min" line under the headline.

### 3.3 My briefs (`views/Reports.tsx`)

**What works**: list on the left, brief on the right, latest auto-selected; "Save as PDF"; sandboxed iframe.

**Confusing**
- Page is "My briefs" but empty state says "No reports yet." and the hint says "Run a scan". Three words for one thing (brief / report / scan).
- List items read "Daily — 9/6/2026, 7:31:12 AM": 260px column, seconds shown, weekly vs daily buried in the same text weight. Use "Today, 7:31 am", "Yesterday", "Mon Sep 1", with a "Weekly" pill.
- The iframe is `calc(100vh - 180px)` — fixed height regardless of content; Persona A at 1.4× zoom gets a tiny viewport with two scrollbars.
- "Saved to C:\Users\…\Documents\InboxScout\2026-09-06.html" — full path in the toolbar. Say "Saved in your Reports folder" with "Open" and "Show folder".
- `pdfMsg` errors render green (same bug as Today).

**Jargon**: "No reports yet." → "No briefs yet."; "Run a scan to generate your first brief." → "Press Check my email to get your first brief."; "Open file" → "Open".

**Accessibility**: selected item is bold only (1.4.1); iframe `title="report"` → "Your brief for Sep 6".

**Dead end**: empty state has no button (compare Today's).

**Persona B**: wants search across briefs, and "Compare with last week". Fine for P2.

### 3.4 People (`views/People.tsx`)

**What works**: zero setup; tiers (Inner circle / Regular / Occasional); search; two-button correction with undo built in; explains that inner-circle mail is always important.

**Confusing**
- `unknown` role renders as a bare "👤" with no word (L416) — Persona A sees a mystery icon. Use "👤 Someone".
- Meta line "💼 Colleague · 12 received · 3 sent · last 9/1/2026 · quiet for 21 days · new · 2 inboxes" — seven facts in 12px grey. Trim to "Colleague · writes most weeks · last heard Sep 1" and put the counts in a tooltip/Details.
- "⭐ Always important ✓ · undo" as one button label mixes state and action.
- "Not important" here writes `quietPeople`; Skills has "Never bother me about" (`mutedSenders`) and "Important people" (`vipSenders`) as free-text lists. Three lists, two screens, overlapping meanings, no cross-reference. Persona B will not know which one she set.

**Jargon**: "received / sent" fine; "last 9/1/2026" → "last heard Sep 1"; "quiet for 21 days" is good plain language, keep.

**Too many choices**: no.

**Unclear buttons**: "Not important" — does it hide their mail? Mute them? Today it lowers priority only. Say "Lower priority" / "Always important" and one-line hint under each tier card.

**Accessibility**: both correction buttons are `.tiny` (≈17px). Role emoji has no text alternative for `unknown`.

**Dead end**: empty state "Check your email once and your circle appears here." — no button.

**Persona B**: wants "Show only: Work inbox", sort by "waiting on me", and click-through to the last thread.

### 3.5 Setup hub (`views/Setup.tsx`)

**What works**: six large cards with one-line descriptions; "Everything has a sensible default. Change only what you want." — the right promise. Back link on every sub-page.

**Confusing**
- **"AI helper", "Assistant", "Connect helper"** are three cards with near-identical mental models ("something helps me"). Their descriptions overlap ("app passwords, Google/Microsoft setup" appears in two of them).
- "Connect helper" is an installer's one-time chore (register an OAuth app). It should not be a first-class card for end users; show it only when `!info.google.configured && !info.microsoft.configured` **and** the user is in Standard/Pro, otherwise fold it into Advanced.
- Card order puts "AI helper" and "Assistant" before "Preferences". Persona A never needs the middle three.

**Rename proposal (one name per concept, used everywhere: hub card, page title, onboarding, hints):**

| Today | Proposed | Why |
|---|---|---|
| "AI helper" / "Connect AI" | **"Smarter sorting (AI)"** | Says what you get, not what it is |
| "Assistant" | **"Web chores"** (subtitle: "InboxScout drives a browser for you") | Names the job |
| "Connect helper" | **"Sign-in setup for Google & Microsoft (one-time, advanced)"** | Names the chore and its audience |
| "Preferences" | **"Settings"** | Matches the sidebar-less world people know; "Preferences" is Mac-only |
| "What to watch for" | keep | Already plain |
| "Email accounts" | keep | |

**Too many choices**: six equal cards. In Simple: Email accounts, What to watch for, Settings — plus a quiet "More setup options" link revealing the other three.

**Accessibility**: `.hub-btn` is great (large, left-aligned). "← Back to Setup" is 14px text link with `padding: 0` — under 24px tall.

**Dead end / data loss**: pressing "← Back to Setup" from Preferences with unsaved edits loses them silently (see 3.11).

### 3.6 Email accounts (`views/Accounts.tsx`)

**What works**: "Read-only access — InboxScout can never send, delete, or change your mail." at the top. Microsoft device-code flow shows the code at 22px with a single "Open the Microsoft sign-in page" button and "Waiting for you…" — this is the best flow in the app; copy it for Google. The green "Let the assistant do it" card is a genuinely novel help path.

**Confusing / unexplained**
- Connected list shows `gmailapi · imap.gmail.com` (L214). Show "Gmail (signed in with Google)" / "Yahoo Mail".
- "**Best for Gmail: Sign in with Google**" is shown even when no Google client is configured; pressing it produces an error. Its hint says "Needs a one-time Google app setup by whoever installed InboxScout (docs/GOOGLE.md)" — Persona A does not know who installed it, and `docs/GOOGLE.md` is not a link. Hide the card when not configured, or replace the button with "Not available in this copy — use an app password below (or ask whoever set up InboxScout)".
- The Gmail branch renders the `error` banner **twice** (L253 inside the Google card and L334 below).
- The assistant card asks for "**Your Google password (optional…)**" in the main flow. Even with the encryption note, this is the exact pattern security training tells people to refuse; Persona B will distrust the whole app from here. Move password saving to the Web chores page under a clearly separate "Saved sign-ins" section, default collapsed, and in Accounts offer only "Let the assistant do it — you'll sign in yourself in its window".
- "(Needs an AI helper — free Gemini or Groq works.)" — for a user who arrived here from Onboarding this is a chicken-and-egg loop: they need AI to get an app password, and AI needs a key from a website. Say so plainly and link to it, or disable the button with "First connect a free AI in Setup → Smarter sorting".
- "Connected you@… ✓ (Gmail signals on)" — "signals" is internal vocabulary.
- After adding, the form closes but the page does not suggest "Now press Check my email".

**Jargon → replacement**

| Current | Replace |
|---|---|
| "Other (IMAP)" (L242) | "Another email service" |
| "IMAP server" / "Port" (L325-330) | "Incoming mail server" / "Port (usually 993)" |
| "App password" (L314) | as in Onboarding, with a "How do I get one?" link that opens `myaccount.google.com/apppasswords` etc. |
| "Disconnect & forget password" (L219) | "Remove" → confirm dialog: "Remove you@…? InboxScout will forget its password and stop reading this inbox. Your emails are not affected." |
| "(Gmail signals on)" (L130) | "(better sorting from Gmail's own labels)" |
| "Testing connection…" (L337) | "Connecting…" |
| "Uses Google's own sign-in page (no app password) and gives InboxScout Gmail's Promotions/Social/Updates labels and Important markers for much better sorting." | "Sign in on Google's page — no app password, and better sorting." |

**Too many choices**: for Gmail the form shows three ways to connect stacked vertically (Google sign-in card, assistant card, manual field) plus the provider select. Present them as one ordered choice: "Easiest → Sign in with Google", "Let InboxScout get the app password", "I have an app password". One visible at a time.

**Unclear buttons**: "Disconnect & forget password" — no confirmation, `.tiny` (≈17px), and destructive (WCAG 3.3.4; NN/g confirmation dialogs for irreversible actions). "Let the assistant do it" is enabled whenever an email is typed, even when `aiReady` is false (the view does not check).

**Inconsistent patterns**: Outlook branch uses "Cancel" inside a flex row; Gmail branch has "Cancel" at the bottom below three cards. Google card is blue-tinted, assistant card green-tinted — two tints with no legend.

**Accessibility**: nested `.card` inside `.card` inside a form; password field has no "show password" toggle (older adults mistype 16-char strings — Microsoft inclusive-design guidance recommends reveal); error banner not `role="alert"`.

**Dead ends**: Google button when unconfigured; assistant button when no AI.

### 3.7 What to watch for — Skills (`views/Skills.tsx`)

**What works**: big 22px checkboxes in `label` rows, icon + name + one-line description; changes apply instantly; "Each one adds a section to your brief" explains the consequence.

**Confusing**
- Two pills on skill names: "custom" and "sends to your agent". Persona A: "what agent?". Show "sends to your agent" only when a webhook is configured, with a tooltip.
- People lists as free-text `<textarea>` with "One name or email per line" — but the parser also splits on commas (L539) and the placeholder shows names ("Mom", "Dr. Patel") whose matching rules are undefined to the user ("matched loosely" is only in a code comment).
- Skill checkboxes save instantly; the two textareas need **"Save people lists"**. Same screen, two rules.
- "🧩 Custom watchers (for businesses and power users) — Drop a JSON file into the skills folder… See docs/SKILLS.md" — correct audience label, but the card sits at the same visual weight as everything else. Collapse under "Advanced".
- Overlap with People view (see 3.4): "Important people" here == "Always important" there; "Never bother me about" is a *different* list from "Not important". Consolidate: one People screen that owns all three, and Skills links to it.

**Jargon**: "custom" pill → "yours"; "sends to your agent" → "also sent to your company's AI"; "Custom watchers" → "Your own watchers (advanced)"; "JSON file" → keep but under advanced.

**Accessibility**: checkbox 22px (needs 24); textareas have no `<label>` (the `<h3>` is not associated) — add `aria-labelledby`.

**Dead end**: none.

**Persona B**: wants per-inbox skill toggles ("bills only from personal inbox").

### 3.8 Smarter sorting — AiSettings (`views/AiSettings.tsx`)

**What works**: "works out of the box… no account needed" up front; "✨ Found on this computer" auto-detection with a single "Use it" button; keys "encrypted on this computer". The active card is visibly outlined.

**Confusing / too many choices**
- **12 provider cards** in a grid, all equal weight, each with a "Model: gemini-2.5-flash"-style hint. Persona A cannot pick; Persona B can but shouldn't need to. NN/g "simplicity vs choice": show **one recommended path** ("Free, takes a minute: Google Gemini") + "Free, runs on this PC" (Ollama/LM Studio, only if detected) + "Other providers ▸" collapsed.
- Pressing "Connect" **immediately opens the browser** (`aiOpenKeyPage`, L389) with no warning. Persona A loses the app window behind the browser. Say what will happen on the button ("Get a free key — opens your browser") or show the explanation first.
- Provider notes come from main: "Requires billing setup.", "Very low cost.", "Any OpenAI-compatible server (self-hosted, llama.cpp, vLLM…)". Acceptable under "Other providers", not on the front.
- "Connected ✓ — Gemini is now doing the thinking." — nice. But then the card still says "Reconnect" as its primary button, which reads like something is wrong. Use "Connected ✓" as a non-button state + "Change key" ghost.
- Title "Connect AI" vs hub "AI helper" (see rename).

**Jargon → replacement**

| Current | Replace |
|---|---|
| "Connect any AI backend for smarter sorting and briefs" (L413) | "Add a free AI for smarter sorting and briefs" |
| "Model: gemini-2.5-flash" (L438) | Hide in Simple; "Uses: gemini-2.5-flash" in Pro |
| "Paste your API key" (L450) | "Paste the key here" with a one-line "A key is a long code the website gives you — it's like a password just for InboxScout." |
| "Forget key" (L498) | "Remove key" + confirm |
| "Use this" (local) vs "Connect" (cloud) vs "Use it" (detected) | one verb: "Use" |
| "That key did not work." | "That key didn't work. Check it was copied completely, then try again." (NN/g error guidelines: say what to do) |

**Unclear buttons**: "Forget key" — `.ghost` not `.tiny`, but no confirmation and it may silently switch the active provider back to built-in. Say so.

**Inconsistent**: `busy` shows "Testing…" here, "Testing connection…" in Accounts, "Waiting for Google…" in Google flow.

**Accessibility**: 12 cards × 2 buttons = 24 tab stops before reaching anything else; error inside a card is not announced.

**Dead ends**: none, but the page gives no way back to *why* you came (e.g. "the Assistant needs this") — pass a `reason` and show "Once connected, go back to Web chores".

### 3.9 Web chores — Assistant (`views/Assistant.tsx`)

**What works**: explains the contract up front ("opens its own browser window… you can watch… stop it any time"); status headings in plain words ("🙋 Your turn", "❓ Quick question"); the big "✓ I'm done — Continue" button; a running log; the "AI never sees a password" explanation.

**Confusing / risky**
- **Autonomy** is a `<select>` whose options are 90-110 characters ("Full (recommended) — signs in with my saved sign-ins and keeps going; only verification codes come to me"). Native selects clip; on a 1024px window the user sees "Full (recommended) — signs in with my saved sign…". This must be three radio cards.
- "Full" is labelled "(recommended)" and is the shipped default. For a family PC this means the browser may leave the target site and proceed through "risky pages" without asking. Recommend **"Sign in for me, ask before anything risky"** (`signin`) as default; Persona B's security team will insist, Persona A needs the pause.
- **Saved sign-ins** card asks for website email + password with placeholder-only labels and a "Save" ghost button. This is a password manager with none of the affordances (no reveal, no site name, no "which sites will this be used on"). Move under a collapsed "Saved sign-ins (advanced)" section with real labels and a site field.
- Six recipes + "Something else"; four of the six are owner-only chores ("Register the Google sign-in app (one-time, owner)", "Add a family member to the Google sign-in (owner)"). Persona A sees "owner" and freezes. Split into "For you" and "For whoever set up this computer".
- "Starting web address (it will stay on this site)" — fine. But `▶ Start` is disabled until a URL matching `^https?://` is typed, and Persona A types "amazon.com". Accept bare domains and prepend `https://`.
- Status heading "⚠ Stopped" for `failed` and "⏹ Stopped" for `stopped` — same word for two outcomes. Use "⚠ Couldn't finish" vs "⏹ Stopped by you".
- "Captured so far: googleClientId ✓ · googleClientSecret ✓" — raw keys.
- The error banner "The assistant needs an AI helper to think. Go to Setup → AI helper" has no button.

**Jargon → replacement**

| Current | Replace |
|---|---|
| "🎚 How much should it do on its own?" / "Autonomy" | "Before it starts, how much may it do alone?" / (drop the word "Autonomy") |
| "Full (recommended) — signs in with my saved sign-ins and keeps going; only verification codes come to me" | Radio card **"Do it all"** — "Signs in for me and keeps going. Only asks me for verification codes." |
| "Sign in for me — but pause on payment/delete pages so I can say yes" | Radio card **"Sign in, but ask first"** (recommended) — "Signs in for me. Stops and asks before paying, deleting, or leaving the site." |
| "Careful — hand every sign-in and risky page to me" | Radio card **"I'll do the sign-ins"** — "Opens the page; I sign in and approve anything risky myself." |
| "Saved sign-ins" | "Website passwords InboxScout may use (advanced)" |
| "Captured so far: googleClientId ✓" | "Saved so far: Google app ID ✓" (map keys to plain names) |
| "Close assistant window" | "Close its browser window" |

**Unclear buttons**: "Forget" (`.tiny`, no confirm) on a password; "Save" with no indication where it saved; "Answer" — fine.

**Inconsistent**: recipe selection uses card border; autonomy uses select; sign-ins use inline inputs.

**Accessibility**: the log box has no `aria-live`, so a screen-reader user never hears "Your turn"; `.tiny` Forget; smooth scroll ignores reduced motion; inputs L145-146 lack labels.

**Dead ends**: when `!aiReady` the whole page is usable-looking but Start is disabled with no button to fix it.

### 3.10 Sign-in setup — SetupAssistant (`views/SetupAssistant.tsx`)

**What works**: honest framing ("free, one-time… by whoever installs InboxScout"); status per provider ("✅ Ready (included in this build)"); step list with time estimate; "Prefer to do it yourself?" fallback.

**Confusing**: everything on this page is installer vocabulary — "app registration", "Google Cloud", "Microsoft Entra", "Client ID", "Client secret", "Application (client) ID". That is correct for its audience, so the fix is **audience gating**, not rewriting: hide the hub card unless `uiLevel` is `pro` or a provider is unconfigured and the user tried to use it; when hidden, the Accounts page's Google/Microsoft buttons explain "not set up in this copy".

**Jargon** (keep, but add one plain sentence at the top): "Google and Microsoft each need a free one-time registration so their sign-in buttons work. You only do this once per computer."

**Unclear buttons**: "Redo setup" — will it wipe the current IDs? Say "Redo (replaces the saved IDs)". "Close helper window" vs Assistant's "Close assistant window" — same action, different words.

**Accessibility**: the selected provider card is a border only; step-jump buttons are `.tiny`.

**Dead end**: after "captured… saved. You can close the companion window." there is no "Now connect your Gmail" button.

### 3.11 Settings — Preferences (`views/Settings.tsx`, `BridgeCard`, `ProfilePicker`)

**What works**: grouped cards (Comfort, Who is this inbox for, Schedule, Send me my brief, Storage & privacy, Advanced); "Everything here has a sensible default"; the profile suggestion banner ("Your mail looks like **Nurse**. …  Switch / No thanks") is exemplary — it explains, offers, and lets you decline; "InboxScout only ever sends to **you**".

**Confusing / unexplained**
- **Save model is mixed.** Instant: profile choice (L94), bridge on/off and access (L26, L36), token regenerate. Deferred until "Save settings" at the very bottom: everything else including the webhook URL inside the *same* bridge card. Leaving the page loses deferred edits. Persona A will change text size, see nothing happen, and leave. → Autosave every field on change with a small "Saved ✓" inline (NN/g: settings should apply immediately; the app already does this for skills and profile), or keep one explicit Save but block navigation with "You have unsaved changes".
- **"Show advanced tools (Details and Inbox review tabs)"** is stored as `simpleMode` inverted; the new `uiLevel` (`auto|simple|standard|pro`) in `types.ts` is not surfaced here at all. Replace this select with a "How much to show" control: Auto (recommended) / Simple / Standard / Pro, with one line each.
- Comfort card mixes a size select with three Yes/No selects whose *labels* are full sentences ("🔊 Speak a short summary out loud when a scheduled brief is ready") — label as sentence + option as "Yes — use the computer's voice" is two sentences for one bit.
- "Quiet insights — your circle, this week's schedule across inboxes, promises you made, and a per-inbox view" — 15-word label for an on/off.
- **Schedule** says "Only when I press Run now" but the button is called "Check my email". Time is a raw `<input type="time">` — fine on Windows, but there is no summary sentence ("Every day at 7:30 am") which is what Persona A needs to confirm.
- **Send me my brief**: phone field + carrier select + "texts go through your carrier's free email gateway" — Persona A does not know her carrier's name is required or why; Persona B knows it and knows email-to-SMS is unreliable. Add "Why do I need to pick a carrier?" one-liner and "Not all carriers deliver these reliably — send a test".
- "Also save briefs to Google Drive… Yes — needs "Sign in with Google" (re-sign-in to allow Drive)" — instruction inside an option string.
- **Storage & privacy**: "Reports folder" is a bare text path with no "Choose folder…" button; Persona A cannot type a path. "Keep full email text on this computer — Yes — enables search and re-analysis" — "re-analysis" is internal.
- **Agent bridge card**: "REST:", "MCP:", "Spec: /openapi.json · Events: /events", a YAML block, "Hermes: paste this into ~/.hermes/config.yaml". Correct audience (Pro), wrong placement (same weight as Text size). Move to a "Developer / agents" section visible only in Pro. Its on/off is a `<select>` "Off / On — other agents on this PC may call InboxScout" — the one place a real switch would be right.
- **Advanced**: "AI model override (blank = recommended default)", "Microsoft app ID (for Outlook.com / Hotmail sign-in — see docs/OUTLOOK.md)", "Google OAuth client ID", "Google OAuth client secret", "Ollama URL (local AI)". Correct for Pro; hide otherwise. `customBaseUrl` from `AiSettings` is not editable anywhere in Settings (only via the AI page's custom card) — inconsistent with `ollamaBaseUrl` being here.
- **ProfilePicker** inside Settings: the auto card says "Let InboxScout figure it out ✓ (recommended)" while the hint above says "(chosen automatically)"/"(locked by you)". Choosing a card **applies immediately** and re-runs skills defaults (`enabledSkillIds` reset, L96) — that side effect ("this will reset What to watch for to the profile's defaults") is not stated.
- Option text "(recommended)" appears in five different places with three punctuation styles.

**Jargon → replacement**

| Current (Settings.tsx) | Replace |
|---|---|
| "Preferences" (L127) | "Settings" |
| "Comfort" (L132) | "Reading & display" |
| "Show advanced tools (Details and Inbox review tabs)" (L156) | "How much to show" with options Auto / Simple / Standard / Pro (uses `uiLevel`) |
| "Quiet insights — your circle, this week's schedule across inboxes, promises you made, and a per-inbox view" (L149) | "Extra cards on Today (people, this week, promises, per-inbox)" |
| "Run automatically" (L191) | "Check my email automatically" |
| "Only when I press Run now" (L198) | "Only when I press Check my email" |
| "Text me the headline — phone number" (L240) | "Text me the one-line summary" |
| "Carrier (texts go through your carrier's free email gateway)" (L244) | "Your mobile carrier" + hint "Needed because texts are sent through the carrier's free email-to-text service." |
| "Keep full email text on this computer" (L277) | "Keep a copy of email text on this computer" + hint "Lets you search old mail and lets the brief re-check details. Turn off to keep only short previews." |
| "Reports folder" (L287) | "Where to save briefs" + "Choose folder…" button |
| "Start InboxScout when the computer starts" | keep |
| "AI model override (blank = recommended default)" (L309) | "AI model (advanced) — leave blank for the recommended one" |
| "Microsoft app ID (for Outlook.com / Hotmail sign-in — see docs/OUTLOOK.md)" | "Microsoft app ID (advanced — from Sign-in setup)" |
| "Google OAuth client ID" / "client secret" | "Google app ID" / "Google app secret" (advanced) |
| "Ollama URL (local AI)" | "Local AI address (Ollama)" |
| "🤝 Agent bridge (Hermes & friends)" | "Let other AI tools on this PC use InboxScout (developer)" |
| "Webhook bearer token (optional)" | "Secret to send with it (optional)" |
| "Also send each new brief to an agent webhook (e.g. Hermes) — URL, blank = off" | "Also send each brief to another program (web address) — leave blank for off" |

**Too many choices**: 20 fields on one page, six cards, equal weight. Split by `uiLevel`: Simple shows Reading & display, Schedule, Send me my brief (email only), Who is this inbox for. Standard adds texts, Drive, storage. Pro adds Developer and Advanced.

**Missing explanations**: every field. The inventory in §5 supplies the "What this does / Why this default" line for each; render it as the hint under the label.

**Unclear buttons**: "New token" (bridge) — invalidates every configured agent instantly, no confirm. "Switch" (profile suggestion) — resets skills silently. "Send test text" — no feedback for 10-30 s; say "Sent — it can take a minute to arrive".

**Inconsistent patterns**: `select` Yes/No ×6, `select` On/Off ×1, `select` with instructions in the option ×3, time input, free-text path. Standardise: booleans → switch with label left and a one-line hint; enumerations of ≤4 → radio cards; lists → chips.

**Accessibility**: long option strings clipped; hints 3.77:1; `input:focus` invisible; `.tiny` Show/Hide/New token; `<pre>` YAML block not labelled; no `fieldset/legend` for the schedule group.

**Dead ends**: none, but a Simple user who reaches this page has no reason to be here — the Setup hub should describe it as "Text size, schedule, delivery" only.

### 3.12 Details — Dashboard (`views/Dashboard.tsx`)

**What works**: three tables, counts in headers, "Nothing needs your attention right now." empty state.

**Confusing**: title "Dashboard" ≠ tab "Details". Raw enum values everywhere: severity pill "urgent/high/medium/low" lowercase; trigger `manual | scheduled | catchup | cli`; status `succeeded | failed`; "12 msgs". Trend glyphs ▲▼▬ with no legend. "Pulse (3 active)". "No runs yet. Connect an email account and an AI provider, then press Run now." — the app works without an AI provider, and the button is not "Run now". Deadline shown raw (`i.deadline` ISO string).

**Replace**: "Dashboard" → "Details"; "Pulse" → "Topics"; "Recent runs" → "Recent checks"; `catchup` → "Catch-up", `cli` → "Command line", `manual` → "You pressed the button", `scheduled` → "On schedule"; `succeeded` → "OK"; "12 msgs" → "12 emails"; "Run now" → "Check my email".

**Accessibility**: severity by colour + lowercase word — acceptable; trend by glyph only — add "up/steady/down" as `title` and text in Pro.

**Persona B**: this is her screen; wants per-inbox columns, "why" for each issue (whyNow exists in the brief type, not shown), and an "Open in mail" link.

### 3.13 Inbox review (`views/Review.tsx`)

**What works**: the promise "corrections teach it your preferences"; three chip groups; search on Enter; the Fix column shows only the *other* two categories.

**Confusing**: "Sorted as: promotions / noise" (string replace of the enum); Fix buttons "→ promotions/noise" (a different replace); chips "FYI", "Cold pitch", "Receipts & orders" (this one is good — do the same for the rest); "Type: Any" vs "Show: All" for the same concept; `sensitive` pill with no explanation; 120 rows with no count, no pagination, no "Search results (14)". Corrections have no feedback beyond the row re-rendering; no undo.

**Replace**: "promotions / noise" → "Ads & noise"; "→ work" → "Move to Work"; "FYI" → "Just information"; "Cold pitch" → "Sales pitch"; "Sorted as" → "Filed under"; "Fix" → "Wrong? Move to"; "Search all synced mail…" → "Search your mail…"; add "Showing 120 most recent · 14 matches".

**Accessibility**: chips are `.tiny` (≈17px) and lack `aria-pressed`; active chip is fill-only; table has headers — good; Fix buttons `.tiny`.

**Persona B**: needs keyboard (arrow through rows, W/P/N to refile), bulk select, and "why was this sorted here?".

---

## 4. Cross-cutting standards to adopt

1. **One name per concept, everywhere.** Brief (not report/scan/run), "Check my email" (not Run now/scan), Settings (not Preferences), "Smarter sorting (AI)", "Web chores", "Sign-in setup". Tab label == page `<h1>` == hub card title.
2. **One control per data type.** Boolean → switch (label left, hint below, saved instantly). ≤4 options → radio cards with one line each (never a `<select>` with sentences). Lists → chips with an add box. Paths → read-only text + "Choose…" button. Secrets → password field with reveal.
3. **One save rule.** Autosave with inline "Saved ✓"; destructive or side-effecting changes confirm first; never lose edits on navigation.
4. **Every setting gets two lines**: "What this does" and "Why we picked this" (table in §5), rendered as the hint under the control.
5. **Destructive = confirm or undo.** Remove account, remove key, forget sign-in, new token, Done ✓ (undo toast), Switch profile (state the side effect).
6. **Audience gating by `uiLevel`.** Simple: Today (≤4 cards), My briefs, People, Setup (3 cards). Standard: + Details, Inbox review, texts/Drive, AI page with "Other providers". Pro: + Developer bridge, Advanced IDs, Sign-in setup, custom watchers. Auto picks from usage (already in `src/main/usage.ts`) and announces the switch once with "Undo".
7. **Contrast & size floor.** Text ≥ 4.5:1, UI ≥ 3:1, focus ring 2px `--blue`, every clickable ≥ 40px tall (44 in Simple), base 16px in Simple.
8. **Status messages are announced** (`role="status"` / `aria-live="polite"`) and errors are red, never green.

---

## 5. Settings inventory (`AppSettings` in `src/shared/types.ts`)

Copy in the last two columns is written to be shown verbatim under each control. "Default" is the current `DEFAULT_SETTINGS` value. Where the audit recommends a *different* default, the "Why" line is written for the current default and the recommendation is in §6.

| Key | Where it lives today | Default | What this does | Why we picked the default |
|---|---|---|---|---|
| `profileId` | Settings → Who is this inbox for; Onboarding step 1 | `general` | Tells InboxScout what kind of life and work your mail is about, so it knows what counts as urgent and what to track. | "General" fits everyone until InboxScout has seen enough mail to suggest a better match. |
| `profileAuto` | same (the "Let InboxScout figure it out" card) | `true` | Lets InboxScout pick the best profile from what your mail looks like after each check, instead of you choosing. | Most people don't know which of 52 profiles fits; guessing from real mail is more accurate, and you can lock a choice any time. |
| `schedule.frequency` | Settings → Schedule | `daily` | How often InboxScout checks your email on its own: every day, once a week, or only when you press the button. | A short daily brief is the whole point; weekly is there for light inboxes. |
| `schedule.hour` / `schedule.minute` | Settings → Schedule → Time | `7:30` | The time of day the automatic check runs. | Early enough to read with coffee, late enough that overnight mail has arrived. |
| `schedule.weekday` | Settings → Schedule → Day (weekly only) | `1` (Monday) | Which day the weekly check runs. | Monday morning sets up the week. |
| `ai.provider` | Setup → AI helper | `builtin` | Which "brain" sorts your mail and writes the brief: the free built-in one or an AI service you connect. | Built-in works with no account and never sends mail off this computer; connect an AI whenever you want smarter results. |
| `ai.model` | Settings → Advanced → AI model override | `''` (blank) | Forces a specific model name for the connected AI service. Blank uses the one we recommend. | Each service's recommended model is tested with InboxScout; only change this if you know a model you prefer. |
| `ai.ollamaBaseUrl` | Settings → Advanced → Ollama URL | `http://127.0.0.1:11434/v1` | Where to find Ollama if you run a free AI on this computer. | This is Ollama's standard address on your own PC. |
| `ai.customBaseUrl` | Setup → AI helper → Custom card only | `''` | The address of your own OpenAI-compatible AI server, if you run one. | Blank because almost nobody has one; the Custom card asks for it when needed. |
| `simpleMode` | Settings → "Show advanced tools" (inverted) | `true` | Hides the Details and Inbox review tabs so the app stays to four tabs. | Fewer tabs is easier for everyone at first; turn it off when you want to see how mail was sorted. |
| `uiLevel` | not shown in the UI yet (`ui:setLevel` exists in `src/main/ipc.ts`) | `auto` | How much of InboxScout to show: Simple, Standard, Pro — or Auto, which picks from how you use it. | Auto starts simple and only reveals more when you've shown you use it, so nobody sees more than they need. |
| `storeFullBodies` | Settings → Storage & privacy | `true` | Keeps a copy of each email's text on this computer so you can search it and the brief can re-check details. Off keeps only short previews. | Search and follow-ups need the text; it stays on this computer and is never sent anywhere unless you connect an AI service. |
| `launchAtLogin` | Settings → Storage & privacy | `true` | Starts InboxScout quietly when you sign in to the computer. | Scheduled briefs can only run if the app is open. |
| `reportsDir` | Settings → Storage & privacy → Reports folder | `''` (= Documents/InboxScout) | The folder where each brief is saved as a file you can open, print, or share. | Documents is where people look for their files. |
| `lastRunAt` | internal (shown as "Last checked …" on Today) | `null` | Records when the last check finished. Not a choice — shown for information. | — |
| `enabledSkillIds` | Setup → What to watch for | `null` (= profile's defaults) | Which watchers add sections to your brief: bills, appointments, deliveries, deals, and so on. | Each profile turns on the watchers people like you use most; tick or untick any of them. |
| `vipSenders` | Setup → What to watch for → Important people; People → "Always important" | `[]` | People whose mail is always treated as important, whatever it says. | Empty until you name someone; InboxScout also learns your inner circle on its own. |
| `mutedSenders` | Setup → What to watch for → Never bother me about | `[]` | Senders whose mail is filed as noise and kept out of your brief. | Empty until you name one; the sorter already catches most ads on its own. |
| `textSize` | Settings → Comfort → Text size | `normal` | Makes everything in the app bigger: Normal, Large, or Extra large. | Normal matches most screens; pick Large if you lean in to read. |
| `microsoftClientId` | Settings → Advanced; Connect helper | `''` | The ID Microsoft gave this copy of InboxScout so "Sign in with Microsoft" works. | Blank unless the person who installed InboxScout registered it (official builds include one). |
| `googleClientId` | Settings → Advanced; Connect helper | `''` | The ID Google gave this copy of InboxScout so "Sign in with Google" works. | Same as above. |
| `googleClientSecret` | Settings → Advanced; Connect helper | `''` | The matching secret for the Google ID. Kept encrypted on this computer. | Same as above. |
| `deliverEmailTo` | Settings → Send me my brief | `''` (off) | Emails each brief to this address, sent from one of your own accounts. | Off until you ask, so nothing leaves this computer by default. |
| `smsPhone` | Settings → Send me my brief | `''` (off) | Texts you the one-line summary after each check. | Off until you ask. |
| `smsCarrier` | Settings → Send me my brief | `''` | Your mobile carrier, needed because texts go through the carrier's free email-to-text service. | No default — carriers differ and a wrong one silently fails. |
| `googleDriveExport` | Settings → Send me my brief | `false` | Also saves each brief as a Google Doc and keeps a Google Sheet of open items. Needs "Sign in with Google". | Off so your briefs stay on this computer unless you choose otherwise. |
| `speakBriefs` | Settings → Comfort | `false` | Reads a short summary out loud when a scheduled brief is ready. | Off because a talking computer at 7:30 am surprises people; turn it on if you prefer listening. |
| `insightsEnabled` | Settings → Comfort → Quiet insights | `true` | Adds cards to Today about your circle, this week's dates, promises you made, and each inbox. They only appear when there's something to say. | On because they cost nothing when quiet and are the most-loved part of the brief. |
| `quietPeople` | People → "Not important" | `[]` | People you've marked as lower priority; their mail is never called urgent. | Empty until you mark someone. |
| `bridgeEnabled` | Settings → Agent bridge | `false` | Lets other AI tools on this computer (like Hermes) use InboxScout as a tool. | Off so nothing on your PC can read your brief unless you switch it on. |
| `bridgePort` | not editable in the UI | `47311` | The local network door number other tools use to reach InboxScout. Only reachable from this computer. | An unusual number that nothing else uses. |
| `bridgeAccess` | Settings → Agent bridge → What may they do? | `full` | Whether other tools may only read (brief, search) or also act (check email, connect accounts, drive the Assistant). | Full, because the bridge is off unless you enable it, and people who enable it usually want their agent to act. |
| `assistantAutonomy` | Assistant → How much should it do on its own?; Accounts (read only) | `full` | How far the Assistant's browser may go alone: do everything, sign in but ask before risky steps, or hand every sign-in to you. | Full so chores finish without interruptions; every step is visible and Stop is always one click away. |
| `agentWebhookUrl` | Settings → Agent bridge | `''` (off) | Sends each new brief to another program's web address after every check. | Off until you give an address. |
| `agentWebhookToken` | Settings → Agent bridge (shown only when a URL is set) | `''` | A secret sent along with the brief so the other program knows it's from InboxScout. | Blank because most local programs don't need one. |

Fields with no UI today: `uiLevel`, `bridgePort`, `ai.customBaseUrl` (only via the AI page's custom card), `lastRunAt` (display only).

---

## 6. Prioritized fix list

P0 = blocks a persona or loses data/security trust. P1 = makes the "grandparent or CEO" goal real. P2 = polish.

### P0

| # | File · component | Change |
|---|---|---|
| P0-1 | `views/Onboarding.tsx` · step 2 | Add "Sign in with Google" and "Sign in with Microsoft" buttons (reuse `signInGoogle`/`signInOutlook` from Accounts, shown only when configured) above the app-password form; make `preset.help` URL a real "How do I get an app password?" button that opens it; add Outlook to the provider list; add a reveal toggle on the password field; submit on Enter. |
| P0-2 | `views/Settings.tsx` · `SettingsView`; `views/Setup.tsx` · back link | Autosave each field on change (call `setSettings` debounced, show inline "Saved ✓"), or gate `setSub('hub')` and sidebar navigation with an "Unsaved changes — Save / Discard" prompt. Remove the bottom-only "Save settings". |
| P0-3 | `views/Accounts.tsx` L218 · Disconnect; `views/AiSettings.tsx` L493 · Forget key; `views/Assistant.tsx` L137 · Forget; `views/Settings.tsx` L50 · New token | Add a confirm step (inline "Remove you@…? [Remove] [Keep]") and upgrade from `.tiny` to `.ghost` at ≥40px. |
| P0-4 | `src/shared/types.ts` `DEFAULT_SETTINGS`; `views/Assistant.tsx` L116 | Change `assistantAutonomy` default to `'signin'` and move "(recommended)" to that option; change `bridgeAccess` default to `'read'`. |
| P0-5 | `views/Accounts.tsx` L300-305 · assistant card | Remove the "Your Google password" field from the account flow. Offer only "Let InboxScout get the app password — you'll sign in yourself in its window". Saved sign-ins live only on the Web chores page under a collapsed advanced section. Also disable "Let the assistant do it" when `aiReady` is false and say why with a button to the AI page. |
| P0-6 | `styles.css` L224 (`input:focus`), add `:focus-visible` rule | `outline: 2px solid var(--blue); outline-offset: 2px;` on `button, input, select, textarea, [role=button]:focus-visible`. |
| P0-7 | `styles.css` `:root` | `--ink-faint: #5f6879`; `--good: #22663f`; `.pill.medium { color:#7a5100 }`; `.pill.low, .pill.promotions_noise { color: var(--ink-soft) }`. Re-run contrast after. |
| P0-8 | `styles.css` `.tiny`, `.ghost`, `.primary`, `.skill-row input[type=checkbox]` | `min-height: 40px` on ghost/primary (44px when `body[data-level=simple]`); delete `.tiny` or make it `min-height: 36px` with 44px hit area; checkbox 24px. |
| P0-9 | `views/Accounts.tsx` L245-257 · Google card | Render the card only when the Google client is configured (expose `googleConfigured` from `setupInfo`); otherwise show a one-line "Sign in with Google isn't set up in this copy — use an app password, or ask whoever set up InboxScout." Remove the duplicate `error` at L253 or L334. |
| P0-10 | `views/Today.tsx` L128, `views/Reports.tsx` L364 | Use `className={ok ? 'success' : 'error'}`; auto-dismiss success after 6 s; add `role="status"`. |
| P0-11 | `App.tsx` L74, `views/Today.tsx` L59 | Replace `<div />` with a centred "📬 InboxScout — opening…" placeholder. |

### P1

| # | File · component | Change |
|---|---|---|
| P1-1 | `views/Setup.tsx` · hub | Rename cards per §3.5; reorder Email accounts / What to watch for / Settings first; put Smarter sorting, Web chores, Sign-in setup behind "More setup options" in Simple; hide Sign-in setup unless Pro or a provider is unconfigured. Make every page `<h1>` match its hub/tab label. |
| P1-2 | `views/Settings.tsx` · Comfort card | Replace "Show advanced tools" select with a "How much to show" radio-card group bound to `uiLevel` (`ui:setLevel`), options Auto (recommended) / Simple / Standard / Pro, one line each. Keep `simpleMode` in sync or derive it. |
| P1-3 | `views/Settings.tsx` · all boolean `<select>`s (L143, L150, L158, L266, L279, L293), `BridgeCard` L24 | Replace with a shared `<Switch label hint>` component; the hint text comes from §5. |
| P1-4 | `views/Assistant.tsx` L113-120 · autonomy `<select>` | Three radio cards with the copy in §3.9; same component used in `Accounts` (read-only summary line). |
| P1-5 | `views/Today.tsx` · card order & headers | Force order: Needs you (full width) → They're waiting on you → This week → Promises → rest; add counts to `<h3>`; render `sources`/`messageId` as "Open email" links via `openExternal`/mail deep link; add "Undo" toast after "Done ✓"; in Simple cap at 4 cards + "Show more". |
| P1-6 | `views/Today.tsx` L99-107 · inbox chips | Make chips toggles that filter every card by `accountId` (schedule events and inboxes already carry it; add `accountId` to `BriefIssue`/`waitingOnYouDetails` in `types.ts` and the pipeline). |
| P1-7 | `views/Onboarding.tsx` · step 1 | Show only the auto card + "Choose myself ▸" that reveals `ProfilePicker`. Add a "Text size: Normal / Large" choice on step 0 for Persona A. |
| P1-8 | `views/AiSettings.tsx` · provider grid | Front: one recommended card (Gemini) + detected local AI + "Other providers ▸" (collapsed grid). Button copy "Get a free key — opens your browser". Connected card shows a non-button "Connected ✓" state plus "Change key". |
| P1-9 | `views/People.tsx`, `views/Skills.tsx` | Move Important people / Never bother me about lists into People as chip lists with an add box; Skills links there. Label `unknown` role "Someone". Buttons "Always important" / "Lower priority" at ≥40px. |
| P1-10 | `views/Settings.tsx` · Reports folder | Read-only path + "Choose folder…" (new IPC `dialog:chooseDir`). |
| P1-11 | `views/Settings.tsx` · Schedule | Add a summary sentence under the controls: "InboxScout will check every day at 7:30 am." |
| P1-12 | `views/Settings.tsx` · profile `chooseProfile` L94 | Before applying, state "Switching resets What to watch for to this profile's defaults" with Keep my list / Reset. |
| P1-13 | `App.tsx` sidebar | `aria-current="page"` on active tab; `role="status" aria-live="polite"` on `.status`; move run progress to a content-area banner at 15px; hide sidebar run button on Today or make both labels identical. |
| P1-14 | `views/Review.tsx`, `views/Dashboard.tsx` | Map every enum to plain labels (table in §3.12/3.13); chips get `aria-pressed` and ≥36px; add result counts. |
| P1-15 | `views/Assistant.tsx` L145-146, L261 | Real `<label>`s for sign-in inputs; `aria-live="polite"` on the log box; accept bare domains for `startUrl`; "⚠ Couldn't finish" vs "⏹ Stopped by you". |
| P1-16 | `styles.css` | `@media (prefers-reduced-motion: reduce)` disables smooth scroll; `@media (forced-colors: active)` gives selected cards a `border: 2px solid Highlight` and a text "Selected"; base `font-size: 16px` when `body[data-level=simple]`. |

### P2

| # | File · component | Change |
|---|---|---|
| P2-1 | `views/Reports.tsx` | Friendly dates ("Today, 7:31 am"), "Weekly" pill, "Saved in your Reports folder — Open · Show folder", iframe grows with content, `title` per brief, search across briefs. |
| P2-2 | `views/Today.tsx` | "Reading time: 2 min" under the headline; keyboard shortcut for Check my email; group Read/Calendar/Spreadsheet under a "More ▾" menu in Simple. |
| P2-3 | `views/SetupAssistant.tsx` | One plain sentence at the top; "Redo (replaces the saved IDs)"; after capture, a "Now connect your Gmail" button; step-jump buttons ≥36px. |
| P2-4 | `views/Skills.tsx` | Collapse "Your own watchers (advanced)"; show "sends to your agent" only when a webhook is set; associate textareas with labels. |
| P2-5 | `views/Settings.tsx` · Send me my brief | "Why do I need to pick a carrier?" hint; "Sent — texts can take a minute" feedback; move texts/Drive to Standard. |
| P2-6 | `views/Dashboard.tsx` | Rename to "Details"; show `whyNow`; per-inbox column; "Open in mail". |
| P2-7 | All views | Wrap decorative emoji in `<span aria-hidden="true">`; add `<h2>` per card group so the heading outline is Today → section → card. |
| P2-8 | `views/Accounts.tsx` | Show provider as a friendly name; after connecting, suggest "Now press Check my email"; single "Cancel" position. |

---

## 7. References

- WCAG 2.2: [1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) · [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) · [2.4.11 Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) · [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) · [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html) · [3.3.4 Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) · [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- Nielsen Norman Group: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [Usability for Senior Citizens](https://www.nngroup.com/articles/usability-for-senior-citizens/) · [Children's UX](https://www.nngroup.com/articles/childrens-websites-usability-issues/) · [Toggle-Switch Guidelines](https://www.nngroup.com/articles/toggle-switch-guidelines/) · [Checkboxes vs. Radio Buttons](https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/) · [Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/) · [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) · [Empty States](https://www.nngroup.com/articles/empty-state-interface-design/) · [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/) · [Placeholders in Form Fields Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/) · [Listboxes vs. Dropdown Lists](https://www.nngroup.com/articles/listbox-dropdown/) · [Simplicity vs. Choice](https://www.nngroup.com/articles/simplicity-vs-choice/) · [The Inverted Pyramid](https://www.nngroup.com/articles/inverted-pyramid/)
- Apple Human Interface Guidelines: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [Layout (44×44 pt minimum hit target)](https://developer.apple.com/design/human-interface-guidelines/layout)
- Microsoft: [Inclusive Design](https://inclusive.microsoft.design/) · [Guidelines for targeting (40×40 epx)](https://learn.microsoft.com/en-us/windows/apps/design/input/guidelines-for-targeting) · [Writing Style Guide (plain, direct)](https://learn.microsoft.com/en-us/style-guide/welcome/)
- GOV.UK Design System: [Question pages — one thing per page](https://design-system.service.gov.uk/patterns/question-pages/) · [Writing for GOV.UK](https://www.gov.uk/guidance/content-design/writing-for-gov-uk) · [plainlanguage.gov guidelines](https://www.plainlanguage.gov/guidelines/)
- Calm technology (Amber Case): [calmtech.com principles](https://calmtech.com/) — technology should require the smallest possible amount of attention and inform without alarming.
- Executive briefing: [BLUF — Bottom Line Up Front](https://en.wikipedia.org/wiki/BLUF_(communication)); one-page, decisions-needed-first format.
- Browser media queries used above: [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) · [`forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
