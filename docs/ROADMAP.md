# Roadmap & Gap Analysis

*Audit of shipped v0.1.0 against the proposal — September 5, 2026.*

## ✅ Shipped in v0.1.0

| Area | Status |
|---|---|
| Read-only IMAP sync (Gmail / Yahoo / generic) with delta watermarks | ✅ |
| Classification: Personal / Work / Noise + importance, screening labels, deadlines | ✅ |
| **Built-in free engine** (rules-based, zero accounts, fully local) as default | ✅ |
| 11 optional AI backends (Gemini, Groq, OpenRouter, Mistral, DeepSeek, OpenAI, Grok, Claude, Ollama, LM Studio, custom endpoint) | ✅ |
| Work profiles (owner / real estate / utility / general) | ✅ |
| Project & issue tracking across runs; Top Emerging Issues + Pulse briefs | ✅ |
| Reply tracker, deadline extraction, sensitive-info flagging (no redaction) | ✅ |
| Correction loop feeding future classification | ✅ |
| Daily/weekly scheduler, missed-run catch-up, tray, autostart, `--sync` CLI | ✅ |
| SQLite + FTS5 search; DPAPI-encrypted secrets; MD/HTML reports saved locally | ✅ |
| CI (lint/typecheck/41 tests/build) + Release workflow; `.exe` + `.dmg` on GitHub Releases with self-update | ✅ |

## ✅ v0.2 — shipped (correctness & first-run experience)

1. ~~Per-account fault isolation~~ — ✅ sync errors are caught per account, listed under "Account problems" in the brief, and never block other accounts.
2. ~~Failure notifications~~ — ✅ failed scheduled runs now notify.
3. ~~First-run Simple Mode wizard~~ — ✅ 3-step guided onboarding (welcome → profile → connect email → first scan).
4. ~~AI auto-detection~~ — ✅ probes running Ollama/LM Studio servers and environment API keys; one-click connect in Connect AI.
5. ~~iCloud preset~~ — ✅ `imap.mail.me.com` in the wizard.
6. ~~Capture `List-Unsubscribe` + attachment metadata~~ — ✅ stored on every synced message (with additive DB migration).

*(v0.2 also carried the product rename: Inbox Intel → **InboxScout**.)*

## ✅ v0.3 — shipped (intelligence & simplicity)

- **Skills engine** — declarative watchers (10 built-in) with extraction, urgency rules, brief sections, AI prompt hints, and **webhook agents** for customer-specific AI; custom skills as JSON files. See `docs/SKILLS.md`.
- **Important people / never-bother-me lists** applied on every run.
- **Simple Mode UI** — Today screen, Setup hub, three tabs, text-size control, advanced tabs behind a toggle.
- Structured brief stored per report (powers the Today screen).

## ✅ v0.4 — shipped (friends & family rollout)

- **Outlook.com / Hotmail / Live via Microsoft Graph** — device-code sign-in, read-only `Mail.Read`, inbox + sent sync, silent token refresh. Setup in `docs/OUTLOOK.md`.
- **"Done ✓" on the Today screen** + "Done since last time" recap in briefs.
- **Save as PDF** for any brief.
- **Filters in Inbox review** (category and type chips).
- **Intel Mac build** (`x64` dmg) alongside Apple Silicon; README install steps for unsigned builds.
- README makeover with logo and badges.

## ✅ v0.5 — shipped (better sign-in, better extraction)

- **Sign in with Google** for Gmail (OAuth PKCE loopback, `gmail.readonly`) with Gmail API delta sync via history ids; Gmail category labels, Important/Starred, read state, and real thread ids feed classification. Setup in `docs/GOOGLE.md`.
- **Provider hints** stored per message and used by both the built-in engine and AI prompts; Outlook now contributes Focused/Other, importance, read, and flag signals.

## ✅ v0.6 — shipped (assistant channels & zero-setup)

- **Baked sign-in app IDs**: release builds embed Google/Microsoft client IDs from repository secrets (`docs/RELEASING.md`) so family members never register anything.
- **Connect helper**: companion window opens each console page and captures client IDs/secrets from the page automatically.
- **Send me my brief**: email delivery and free carrier-gateway **text messages**, using the person's own account as the outbox; test buttons.
- **Voice**: **Read it to me** in-app and optional spoken **voice summaries** via the OS voice when a scheduled brief is ready (works with the window closed); **Draft reply** (opens the mail app pre-filled), **CSV export**, **calendar (.ics) export**.
- **Google Docs + Sheets export** via `drive.file` when signed in with Google.

## ✅ v0.7 — shipped (the Assistant + Hermes)

- **AI-operated browser** with recipes (Gmail/Yahoo/iCloud app-password + auto-connect, Google OAuth client registration, add test user, Microsoft app registration, custom tasks), observe→decide→act loop on any AI backend (screenshots when the backend has vision). `docs/ASSISTANT.md`.
- **Autonomy levels** (Careful / Sign in for me / Full) and **saved sign-ins**: the assistant logs in as you via keyboard-swapped placeholders, so the model never sees a password; 2-factor always comes back to you. Always-on: visible window, live log, Stop, step cap, isolated session.
- **Agent bridge** for Hermes and friends: MCP server (`/mcp`), REST + OpenAPI (`/v1`), Server-Sent Events (`/v1/events`), bearer token, Read-only/Full access switch, 30 operations (brief, issues, mail, scan, accounts, sign-ins, Assistant, notify, speak, skills, safe settings). `integrations/hermes/`.
- **Brief webhook**: every new brief POSTed to an agent URL (Hermes gateway) with optional bearer token.

## ✅ v0.8 — shipped (works for everyone)

- **56 profiles in five groups** — business & office, trades/field/property, health/education/public service, creative/tech/independent, life & home — each with its own idea of "work", urgency, pulse, default skills, and detection vocabulary. `docs/PROFILES.md`.
- **Choose for me**: profile detection from the mail itself after every scan (high-confidence switch, medium only off the generic default; a suggestion when the choice is locked; dismissable). Grouped, searchable picker in Preferences and onboarding.
- **30+ new skills** authored alongside the profiles (shifts, credentials, permits, tenants, loads, bookings, orders, incidents, gigs, benefits, medications, immigration…).
- **Full autonomy by default** for the Assistant, with *Sign in for me* and *Careful* as dial-backs; bridge ops `list_profiles` / `detect_profile` / `set_profile`.

## ✅ v0.9 — shipped (quiet intelligence)

- **People engine** across all inboxes: roles (family/friend/colleague/client/vendor/service/automated), tiers, cadence; inner circle auto-important; going-quiet and new-faces lines; People tab with Always/Not important. `docs/INSIGHTS.md`.
- **Unified schedule**: deadlines + appointments + travel + skill dates + promises from every inbox, grouped by day with overlaps, overdue items, and detected regulars; feeds the `.ics` export and the spoken summary.
- **Promises you made**: commitments extracted from sent mail with due dates and follow-up buttons.
- **By inbox**: inferred inbox roles, per-inbox counts, cross-account de-duplication, inbox filter in Inbox review.
- Bridge ops `list_people` / `get_schedule` / `list_promises`; one Preferences switch to turn insights off.

## ✅ v1.0 — shipped (the evolving UI)

- **Three layouts** — Simple / Standard / Pro — chosen from local usage signals with plain reasons, weekly hysteresis, a one-time announcement with "Keep it the way it was", and an override. `docs/ADAPTIVE.md`.
- **Today rebuilt**: fixed card order with counts, Simple's three-card rule with "Show me everything", Pro's "Decide today" card, inbox filter chips, Delegate and Copy brief, Because/From lines, Undo on Done, "Why am I seeing this?" on every card, relative "last checked", spoken "Explain this screen".
- **Settings generated from a registry**: what / why / who / caution for every setting, badges for chosen-for-you vs you-set-this, Back to automatic, search, level visibility, saves on change, folder picker.
- **Accessibility pass** from the human-factors research: AA contrast for hint text, visible focus rings, 36–44 px targets, reduced motion, confirm-with-verb on destructive actions, plain-language enums, real labels and live regions, onboarding with Sign in with Google/Microsoft and "let the assistant get the app password".
- Research: `docs/design/HUMAN-FACTORS.md`, `docs/design/UX-AUDIT.md`, `docs/design/ADAPTIVE-UI.md`.

## ✅ v1.1 — shipped (full system control + EULA)

- **Full system control** for the Assistant and connected agents, on by default: screenshots, clicks and typing on the desktop, opening apps/files/URLs, shell commands, and file access under the home folder. Per-kind native popups (Allow once / Always allow / Don't allow) with remembered answers, dangerous commands that ask unless the full-autonomy override is on (off by default in v1.1; on by default since v1.2), a home-folder rule with protected secret folders, and a Linux `xdotool` note. `docs/SYSTEM-CONTROL.md`.
- **Settings → Who can help**: the on/off switch, "What you've already allowed" (per-kind Always / Never / Ask each time, "Ask me again for everything"), and "Terms accepted" with "Read the terms again".
- **Plain-language EULA** shown once at first launch (versioned; read aloud; link to the full license) and required before onboarding.
- **Bridge tools** `desktop_*` / `files_*` for Hermes and other MCP/REST clients under Full access — the same popups appear, naming the agent.
- Assistant screen says, in one line, that it can also use the computer and where to turn it off.

## ✅ v1.2 — shipped (self-healing + complete control by default)

- **Self-healing**: a health check runs before every scan and on demand — accounts, the AI helper, the reports folder, the database, the bridge port, the schedule. Safe repairs happen on their own (reconnecting an account with a saved sign-in, falling back to the built-in engine when the AI helper fails, moving the reports folder, picking a free bridge port, re-syncing a broken account) and show up as one calm line on Today ("Fixed on its own: …"). What cannot be fixed alone is said in plain words under **Settings → Health** with one **Fix it for me** button, plus "Copy diagnostics" and "Show the log file" behind a disclosure. Bridge tools `health_check` / `health_repair` for Hermes. `docs/SELF-HEALING.md`.
- **Complete control by default**: the first-launch terms now default every choice on — the master switch, every kind of computer use, *and* the full-autonomy override — so the Assistant and connected agents finish jobs without interruptions out of the box. Dangerous commands ask only when the override is turned off (**Settings → Who can help**); the warning stays visible wherever it is on.

## ✅ v1.3 — shipped (Linux + your phone)

- **Linux**: AppImage and .deb installers from the same release pipeline (`InboxScout-x64.AppImage`, `InboxScout-x64.deb`), a "Password storage" health check that explains how to install a keyring, an AppImage-aware updater, and launch-at-login via XDG autostart. `docs/LINUX.md`.
- **iPhone & Android without an app store**: **Setup → On your phone** shows a QR code; scanning it on the home Wi‑Fi opens a phone-sized InboxScout served by the desktop (check email, what needs you, bills, this week, past briefs) that can be added to the home screen. Its own token, LAN only, an allow-listed read-mostly API, "New code" to revoke. `docs/PHONE.md`.

## ✅ v1.4 — shipped (trusted helpers, conversation, quality & speed)

- **Trusted helpers**: name a family member, guardian, or friend with a sharing level (ask only / appointments only / what needs me / everything). One-tap **Ask for help** on any item with a 10-second cancel, digests that say "all fine" when quiet, six heads-ups (a stranger asking for private details or pushing to pay, an account that keeps failing, someone close gone quiet, an overdue promise, something urgent), a verbatim sent log, **Pause all**, "Who is setting this up?" in onboarding, and "Notes from your helpers" on Today from their plain-email replies. Bridge ops `helper_*`; phone page gets Ask for help. `docs/HELPERS.md`.
- **Ask about your mail**: a plain-words box on Today and the phone page. A local engine answers in under two seconds (who wrote back, what I owe, when is…, who is waiting, promises, "tell Jane…" → a draft, what's new, anything from…, what's on Friday, is anything wrong, read it to me); the AI helper replaces the answer within eight seconds when one is set, with read-only tools and redaction. Bridge op `ask`. `docs/ASK.md`.
- **Quality & speed**: catch-up backoff instead of a five-minute retry storm, settings no longer clobbered by a run, classification three-wide with 429/5xx retry, obvious noise skips the AI, Gmail batch fetch, `messages(date)` index, one query instead of thousands per run, lite message loading, Today updates in place, a five-step run bar, plain-words errors, texts without an HTML part, a Stop that always works, and accessibility fixes (Why button size, fixed two-column Standard grid, J/K/D keys, skip link). Spec: `docs/design/FAMILY-AND-CONVERSATION.md`.

## ✅ v1.5 — shipped (reads attachments and photos)

- **Reads what is inside attachments**: PDFs, Word files, spreadsheets, and plain-text files are read on the computer; photos, screenshots, and scans go to the AI helper when it can see images and to a bundled offline OCR reader otherwise. Each file gets a one-line summary and facts (amounts, dates, people, what kind of document), and what it says feeds the classifier, the built-in engine (an invoice in a PDF becomes a bill with the amount and due date; a photographed W-2 is flagged private), and the brief ("from the attached invoice.pdf" on the item, 📎 on Today). Inbox review shows 📎 file — summary with **Open**; **Ask** answers "what was in the pdf from Ron?" and the AI gets `read_attachment`. Files are kept 90 days (setting) and cleared by the **Attachment files** health check; the text stays searchable. Bridge ops `list_attachments` / `read_attachment` / `open_attachment`; the phone gets the two read ops. Off switch: *Read attachments and photos*. `docs/ATTACHMENTS.md`.

## ✅ v1.6 — shipped (scam guard, unsubscribe)

- **Scam guard** (`src/main/pipeline/scams.ts`): rules, no model, so every install is protected. Brand impersonation (35 brands and institutions with their real domains), lookalike domains, "banks" on free mail, credential fishing, pressure, gift cards/wire/crypto, the grandparent emergency, prizes with a fee, tech-support renewals with a number to call, blackmail, shortened/IP/punycode links. *Likely* scams are filed as noise and never become "Needs you" or a reply owed; *possible* ones are shown with the warning. First card on Today (Simple: first of three), read aloud first, in the report and the helper digest, and a helper heads-up of its own. Senders the person replies to soften the verdict.
- **Stop these emails**: Inbox review shows a button for newsletters and promotions that carry a List-Unsubscribe header; it opens the sender's page (or a ready mailto) — InboxScout still never sends.

## ✅ v1.5.1 – v1.5.7 — shipped (release, legal, and runtime plumbing)

- **v1.5.1** — code-signing pipeline for Windows (Azure Trusted Signing) and macOS (Developer ID + notarization), inactive until the repository secrets exist; Cooper Studios LLC in build metadata; the InboxScout Source-Available License 1.0, `TRADEMARK.md`, `SECURITY.md`, contributor assignment in `CONTRIBUTING.md`. `docs/SIGNING.md`.
- **v1.5.2** — privacy policy and terms pages on inboxscout.ai; dependency security updates.
- **v1.5.3** — Electron 44 (the current security-supported line) and electron-builder 26; a "publish: no" dry run for the Release workflow.
- **v1.5.4** — releases are built on all three platforms, uploaded as artifacts, and published by one job only when every file is present; `Tidy releases` workflow.
- **v1.5.7** — setup polish: the connect screens pick Gmail, Yahoo, iCloud, or Outlook from the address as it is typed; *Fix it for me* reconnects a rejected app-password account through the Get-it-for-me window when nobody saved a sign-in (the automatic pass never pops a window); **Email us for help** under Settings → Health copies the diagnostics and opens a message to hello@inboxscout.ai; "Your first brief takes about a minute" while the first check runs; **See an example brief** on the welcome step.
- **v1.5.6** — connecting email without a fight: **Get it for me** opens the service's own app-password page in an InboxScout window and connects the account the moment the password appears (no AI helper needed); an everyday password pasted into the app-password box gets a plain sentence and a *Try it anyway*; the server's bare `Command failed` becomes "Gmail did not accept that password…"; the Electron error prefix no longer leaks (`add': Error:`); one shared connect path for the form, the Assistant, and the window.
- **v1.5.5** — the updater actually runs (earlier builds never checked for updates: re-download once), macOS zip targets so macOS can update once signed, the website deploys from `main` only, Dependabot grouped and capped, the renderer sandbox restored to Electron's default, Node 24 in CI and typings, and the audit's documentation fixes.

## 🟠 Gaps

- ~~Autonomous console agent~~ — ✅ shipped in v0.7 as the Assistant, with handoffs where a bot would be brittle.
- **Voice commands** (talk to InboxScout) — Chromium speech recognition in Electron needs a Google key and is unreliable offline; revisit with a local model (e.g. whisper.cpp).
- **Real phone calls / two-way SMS** — needs a paid provider (Twilio); not aligned with "free out of the box". Read-aloud and carrier texts cover the need for now.

8. ~~Google Drive report sync~~ — ✅ shipped in v0.6 as Google Docs + Sheets export. OneDrive later.
10. **Token/cost meter** — the `runs` table doesn't record token usage or cost estimates; the proposal promised per-run cost visibility.
13. ~~Ship default app IDs in official builds~~ — ✅ v0.6 (`docs/RELEASING.md`).

## 🟡 Gaps — v1.x features (proposal roadmap)

13. **Ask-your-inbox chat** — natural-language Q&A over the local FTS index (keyword search exists; the conversational layer doesn't).
14. **On-demand thread summaries.**
15. **Sender analytics & VIPs** — noisiest senders, volume trends, response patterns.
16. **Unsubscribe report** — depends on gap #6.

## ⚪ Distribution debt

17. **Code signing** — Windows SmartScreen warning (Azure Trusted Signing ~$10/mo) and macOS notarization (Apple Developer ID $99/yr; Sequoia blocks unsigned apps hard). Required before handing installers to non-technical users.
18. ~~Intel Mac build~~ — ✅ both `InboxScout-arm64.dmg` and `InboxScout-x64.dmg` ship since v1.1; Linux since v1.3.
19. ~~Gmail API BYO-client mode~~ — ✅ shipped as "Sign in with Google" in v0.5.

## Deliberately out of scope (unchanged)

Sending/replying/deleting mail, mailbox mutation (snooze/archive/labels), real-time pre-inbox screening, Slack/Notion/calendar integrations, sales tooling.
