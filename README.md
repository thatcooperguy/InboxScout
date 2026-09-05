# Inbox Intel

A Windows desktop email intelligence assistant.

Connect your personal email accounts (Gmail, Yahoo, Outlook.com, or any IMAP provider) and let AI sort personal from work mail, surface the **top emerging issues** that need your attention, and keep a rolling **Company Pulse** — status summaries of your top projects — updated on a daily or weekly schedule. Reports are saved locally and can sync to Google Drive or OneDrive.

**Status:** design/proposal phase. See **[docs/PROPOSAL.md](docs/PROPOSAL.md)** for the full product proposal and technical design.

## Highlights (planned v1)

- Multi-account: Gmail / Yahoo / Outlook.com / generic IMAP, read-only, credentials encrypted with Windows DPAPI
- AI-powered classification: Personal / Work / Promotions-Noise with importance scoring
- Top Emerging Issues brief + Company Pulse project tracking that updates across runs
- Connect AI with a sign-in-style overlay (no manual key wrangling): Google Gemini (free tier default), OpenAI, Anthropic Claude, xAI Grok, Groq, or fully local via Ollama — with auto-detection of installed AI tools and guided downloads
- Daily/weekly scheduled runs from the system tray, plus run-on-demand
- Local-first SQLite storage with full-text search; Markdown/HTML/PDF reports; optional Drive/OneDrive sync

## Planned stack

Electron · TypeScript · React · better-sqlite3 (FTS5) · imapflow · Microsoft Graph (MSAL) · Vercel AI SDK · electron-updater
