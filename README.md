# Inbox Intel

A Windows desktop email intelligence assistant.

Connect your personal email accounts (Gmail, Yahoo, Outlook.com, or any IMAP provider) and let AI sort personal from work mail, surface the **top emerging issues** that need your attention, and keep a rolling **Pulse** — status summaries of the work that matters to you — updated on a daily or weekly schedule. Reports are saved locally and can sync to Google Drive or OneDrive.

Built for anyone's inbox: **work profiles** adapt the briefs to what you do — a business owner gets a Company Pulse of top projects, a real-estate agent gets a Deal Pipeline, a utility/field professional gets an Operations Pulse — and a default **Simple Mode** makes setup three plain-language steps for non-technical users.

**Status:** design/proposal phase. See **[docs/PROPOSAL.md](docs/PROPOSAL.md)** for the full product proposal and technical design.

## Highlights (planned v1)

- Multi-account: Gmail / Yahoo / Outlook.com / generic IMAP, read-only, credentials encrypted with Windows DPAPI
- AI-powered classification: Personal / Work / Promotions-Noise with importance scoring
- Top Emerging Issues brief + Pulse tracking (projects/deals/operations by profile) that updates across runs
- Connect AI with a sign-in-style overlay (no manual key wrangling): Google Gemini (free tier default), OpenAI, Anthropic Claude, xAI Grok, Groq, or fully local via Ollama — with auto-detection of installed AI tools and guided downloads
- Daily/weekly scheduled runs from the system tray, plus run-on-demand
- Local-first SQLite storage with full-text search; Markdown/HTML/PDF reports; optional Drive/OneDrive sync
- Sensitive-information heads-up: flags private or company-confidential content in briefs (never redacts)
- Downloadable Windows `.exe` and macOS `.dmg` from this repo's Releases, with in-app self-update

## Planned stack

Electron · TypeScript · React · better-sqlite3 (FTS5) · imapflow + mailparser · Microsoft Graph (MSAL) · Vercel AI SDK · node-cron · electron-updater
