# InboxScout

A Windows desktop email intelligence assistant.

Connect your personal email accounts (Gmail, Yahoo, Outlook.com, or any IMAP provider) and let AI sort personal from work mail, surface the **top emerging issues** that need your attention, and keep a rolling **Pulse** — status summaries of the work that matters to you — updated on a daily or weekly schedule. Reports are saved locally and can sync to Google Drive or OneDrive.

Built for anyone's inbox: **work profiles** adapt the briefs to what you do — a business owner gets a Company Pulse of top projects, a real-estate agent gets a Deal Pipeline, a utility/field professional gets an Operations Pulse — and a default **Simple Mode** makes setup three plain-language steps for non-technical users.

**Status:** v0.1 in development — the core app is built and CI is running. See **[docs/PROPOSAL.md](docs/PROPOSAL.md)** for the full product proposal and technical design.

## Download

Installers (Windows `.exe`, macOS `.dmg`) are published on this repo's **Releases** page whenever a `v*` tag is pushed. The app self-updates from Releases after install.

## Develop

```bash
npm install
npm run dev        # launch the app with hot reload
npm run typecheck  # strict TS across main + renderer
npm test           # vitest unit suite
npm run lint
npm run package    # build local installers (no publish)
```

Run a headless scan without opening the window: `inboxscout --sync` (used by schedulers).

## License

InboxScout is **source-available** under the [Functional Source License 1.1, MIT future license (FSL-1.1-MIT)](LICENSE.md):

- ✅ Free to use, read, modify, and redistribute for any internal, personal, educational, or research purpose.
- 🚫 You may **not** use the code to build or offer a product or service that competes with InboxScout.
- ⏳ Each release automatically converts to the permissive **MIT license two years** after it is published.

Contributions are welcome under the terms in [CONTRIBUTING.md](CONTRIBUTING.md). "InboxScout" and the InboxScout logo identify this project — the license grants no trademark rights.

## Highlights (planned v1)

- Multi-account: Gmail / Yahoo / Outlook.com / generic IMAP, read-only, credentials encrypted with Windows DPAPI
- AI-powered classification: Personal / Work / Promotions-Noise with importance scoring
- Top Emerging Issues brief + Pulse tracking (projects/deals/operations by profile) that updates across runs
- **Free and works out of the box** — a built-in rule-based engine sorts mail, tracks issues, and writes briefs with no AI account, no payment, and no data leaving your PC
- Optional AI upgrades with a sign-in-style overlay (no manual key wrangling): Google Gemini (free tier), Groq (free tier), OpenRouter (free models), Mistral, DeepSeek, OpenAI, Anthropic Claude, xAI Grok, local Ollama or LM Studio, or any custom OpenAI-compatible endpoint
- Daily/weekly scheduled runs from the system tray, plus run-on-demand
- Local-first SQLite storage with full-text search; Markdown/HTML/PDF reports; optional Drive/OneDrive sync
- Sensitive-information heads-up: flags private or company-confidential content in briefs (never redacts)
- Downloadable Windows `.exe` and macOS `.dmg` from this repo's Releases, with in-app self-update

## Planned stack

Electron · TypeScript · React · better-sqlite3 (FTS5) · imapflow + mailparser · Microsoft Graph (MSAL) · Vercel AI SDK · node-cron · electron-updater
