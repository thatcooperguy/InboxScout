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

- **Full system control** for the Assistant and connected agents, on by default: screenshots, clicks and typing on the desktop, opening apps/files/URLs, shell commands, and file access under the home folder. Per-kind native popups (Allow once / Always allow / Don't allow) with remembered answers, dangerous commands that always ask (with an off-by-default full-autonomy override), a home-folder rule with protected secret folders, and a Linux `xdotool` note. `docs/SYSTEM-CONTROL.md`.
- **Settings → Who can help**: the on/off switch, "What you've already allowed" (per-kind Always / Never / Ask each time, "Ask me again for everything"), and "Terms accepted" with "Read the terms again".
- **Plain-language EULA** shown once at first launch (versioned; read aloud; link to the full license) and required before onboarding.
- **Bridge tools** `desktop_*` / `files_*` for Hermes and other MCP/REST clients under Full access — the same popups appear, naming the agent.
- Assistant screen says, in one line, that it can also use the computer and where to turn it off.

## 🟠 Gaps — v1.2

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
18. **Intel Mac build** — the `.dmg` is Apple Silicon only; add `x64`/universal target.
19. ~~Gmail API BYO-client mode~~ — ✅ shipped as "Sign in with Google" in v0.5.

## Deliberately out of scope (unchanged)

Sending/replying/deleting mail, mailbox mutation (snooze/archive/labels), real-time pre-inbox screening, Slack/Notion/calendar integrations, sales tooling.
