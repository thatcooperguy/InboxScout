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

## 🟠 Gaps — v0.7

- **Fully autonomous console agent** (LLM + vision driving Google/Microsoft consoles) — deliberately not shipped: brittle against UI changes and unnecessary once IDs are baked into builds. Revisit only if a real need appears.
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
