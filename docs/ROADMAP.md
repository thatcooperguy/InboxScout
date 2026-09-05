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

## 🔴 Gaps — v0.2 (correctness & first-run experience)

1. **Per-account fault isolation** — today one failing account (bad password, provider hiccup) fails the whole run. Sync errors should be caught per account, reported in the brief ("couldn't check yahoo account"), and not block the others.
2. **Failure notifications** — a failed scheduled run is silent; the user only finds out by opening the app. Notify on failure, not just success.
3. **First-run Simple Mode wizard** — the 3-step onboarding (connect email → pick profile → done) exists as settings, not as a guided flow. This is the make-or-break feature for non-technical users.
4. **AI auto-detection** — Connect AI should probe for a running Ollama/LM Studio server and existing `GEMINI_API_KEY`/`OPENAI_API_KEY`/etc. env vars and offer one-click connect (designed in proposal, not implemented).
5. **iCloud preset** — add `imap.mail.me.com` to the account wizard presets (generic IMAP works today but shouldn't be needed).
6. **Capture `List-Unsubscribe` + attachment metadata during sync** — cheap to store now, required later for the unsubscribe report and attachment awareness; not retroactive, so start capturing early.

## 🟠 Gaps — v0.3 (promised in proposal, not yet wired)

7. **Outlook.com via Microsoft Graph** — Outlook users currently cannot connect at all (Microsoft killed app passwords in 2024). Needs Entra app registration + MSAL device/loopback flow + `Mail.Read`.
8. **Google Drive report sync** — designed (`drive.file` scope, hand-rolled REST), not implemented. OneDrive after.
9. **PDF export** — reports are MD/HTML; wire `webContents.printToPDF`.
10. **Token/cost meter** — the `runs` table doesn't record token usage or cost estimates; the proposal promised per-run cost visibility.
11. **Screening filters in the UI** — needs-reply / newsletter / cold-pitch labels are stored but the Review tab can't filter by them.
12. **"Resolved this week" recap** — weekly briefs should list issues closed since the last weekly run.

## 🟡 Gaps — v1.x features (proposal roadmap)

13. **Ask-your-inbox chat** — natural-language Q&A over the local FTS index (keyword search exists; the conversational layer doesn't).
14. **On-demand thread summaries.**
15. **Sender analytics & VIPs** — noisiest senders, volume trends, response patterns.
16. **Unsubscribe report** — depends on gap #6.

## ⚪ Distribution debt

17. **Code signing** — Windows SmartScreen warning (Azure Trusted Signing ~$10/mo) and macOS notarization (Apple Developer ID $99/yr; Sequoia blocks unsigned apps hard). Required before handing installers to non-technical users.
18. **Intel Mac build** — the `.dmg` is Apple Silicon only; add `x64`/universal target.
19. **Gmail API BYO-client mode** — optional advanced path for power users.

## Deliberately out of scope (unchanged)

Sending/replying/deleting mail, mailbox mutation (snooze/archive/labels), real-time pre-inbox screening, Slack/Notion/calendar integrations, sales tooling.
