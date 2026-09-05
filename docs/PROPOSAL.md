# Inbox Intel — Product Proposal & Design

*A Windows desktop email intelligence assistant*

**Status:** Proposal for review — v0.1 (September 2026)

---

## 1. Executive summary

Inbox Intel is a Windows desktop application that connects to your personal email accounts (Gmail, Yahoo Mail, Outlook.com, and any IMAP provider), and — on demand or on a daily/weekly schedule — scans new mail, uses AI to separate **personal** items from **work-related** items, and produces an executive brief with two centerpieces:

- **Top Emerging Issues** — a ranked list of critical items that need the owner's attention right now, with urgency, the source emails, and suggested next steps.
- **Company Pulse** — the top projects and initiatives visible in the mail stream, each with a rolling, continuously updated status summary.

Every run updates a local database, so issues and projects are *tracked over time* — statuses evolve, resolved items close out, and new ones surface. Reports are always saved locally, and can optionally sync to Google Drive or OneDrive.

The AI analysis runs through the user's choice of provider — Anthropic Claude, OpenAI, Google Gemini, or a fully local model via Ollama — behind a single abstraction layer, so switching providers is a settings change.

## 2. Goals and non-goals

### Goals (v1)

1. Connect multiple personal email accounts with a guided, secure sign-in; credentials stored encrypted on the machine.
2. Classify all new mail since the last run into **Personal / Work / Promotions-Noise**, with importance scoring.
3. Generate the Top Emerging Issues and Company Pulse briefs for work mail.
4. Run on demand ("Run now"), or automatically on a **daily or weekly** schedule.
5. Persist everything locally (SQLite); every run is incremental and idempotent — re-runs update rather than duplicate.
6. Save reports locally as Markdown/HTML/PDF; optional sync to Google Drive (v1) and OneDrive (v1.1).
7. Let the user connect the AI provider of their choice with minimal friction.

### Non-goals (v1)

- Sending, replying to, or deleting email — the app is strictly **read-only** against mailboxes.
- macOS/Linux/mobile (the stack keeps the door open; see §4).
- Multi-user / team features.

## 3. Key design decisions (and the research behind them)

### 3.1 Email account connectivity — what's actually possible in 2026

Research into current provider policies drives the connection strategy per provider:

| Provider | How Inbox Intel connects | Why |
|---|---|---|
| **Gmail** | **App password + IMAP** (default), or **bring-your-own Google OAuth client** for the Gmail API (advanced) | Google's `gmail.readonly` scope is *restricted*: shipping a verified OAuth client requires an annual CASA Tier-2 security audit (~$500–$4,500+/yr). App passwords (with 2-Step Verification) are officially supported and take the user ~2 minutes to create. Advanced users can create their own free Google Cloud OAuth client for full Gmail API access. |
| **Yahoo Mail** | **App password + IMAP** | Yahoo has no public mail API and gates OAuth-IMAP behind partner approval. App passwords are Yahoo's officially sanctioned route (basic passwords were disabled May 2024). |
| **Outlook.com** | **Microsoft Graph API + OAuth** (`Mail.Read`, MSAL public client) | Microsoft killed *all* password/app-password IMAP auth in Sept 2024 — OAuth is the only option. The good news: Entra app registration is free, works with personal accounts, and has no paid audit requirement. |
| **Any other (iCloud, Fastmail, …)** | **Generic IMAP + app password** | Universal fallback; most providers support app passwords. |

The app therefore ships a **provider-abstraction layer for mail** with two backend families: IMAP (Gmail, Yahoo, generic) and native API (Graph for Outlook.com; optional Gmail API). The "Connect account" wizard walks the user through creating an app password with provider-specific, illustrated steps, then verifies the connection immediately.

Read-only is enforced in code: the IMAP client opens mailboxes in read-only/EXAMINE mode and the Graph scope requested is `Mail.Read` only.

### 3.2 AI provider access — the honest constraints

A key research finding: **no major provider permits third-party apps to use consumer chat subscriptions.**

- **Anthropic** explicitly banned Claude Pro/Max OAuth tokens outside Claude.ai and the official Claude Code CLI (enforced since Jan 2026). Third-party apps must use Console API keys.
- **OpenAI**'s "Sign in with ChatGPT" covers only OpenAI's own Codex surfaces; ChatGPT Plus has never included API access.
- **Google** has no consumer-subscription API path — but offers a **free Gemini API tier** (~1,500 requests/day on Flash-class models) with a key from AI Studio, no credit card.

So the design is **bring-your-own API key**, made as painless as possible:

| Provider | Onboarding | Est. cost per 1,000 emails* |
|---|---|---|
| **Google Gemini** (default) | Free API key from AI Studio, no card required | **$0** (free tier) / ~$0.60 paid |
| **OpenAI** | API key from platform.openai.com | ~$0.50 (small models) |
| **Anthropic Claude** | API key from console.anthropic.com | ~$2.25 (Haiku 4.5) |
| **Ollama (local)** | One-click detect of local Ollama; no account at all | $0 — email never leaves the PC |

*\*Classify + summarize, ≈1.5M input / 0.15M output tokens; batch APIs cut cloud costs ~50%. Prices as of Sept 2026 — re-verify at build time.*

The settings screen shows exactly where to get each key (deep links + step-by-step), tests the key live, and displays estimated cost per run. **Gemini free tier is the recommended default** (zero cost, zero card); **Ollama is the privacy tier** (classification runs well on small local models even on an 8–16 GB laptop; summaries are slower/lower-quality locally, so a hybrid "classify local, summarize cloud" mode is offered).

The AI layer is built on the **Vercel AI SDK** (TypeScript): one `generateObject`/`generateText` interface across Anthropic, OpenAI, Google, and OpenAI-compatible endpoints (which covers Ollama). Swapping providers is a model-string change.

### 3.3 Application stack

**Electron + TypeScript + React**, chosen after comparing Electron, Tauri v2, .NET (WinUI 3), and Python:

- The workload is dominated by IMAP/OAuth/AI-API glue, where the Node ecosystem is unmatched (`imapflow`, `googleapis`, MSAL, official AI SDKs) and everything stays in one language.
- The report/dashboard *is* a web document — a webview stack renders it natively and exports PDF for free (`printToPDF`).
- Electron's weaknesses (bundle size ~150 MB, RAM) are acceptable for a tray-resident productivity app.
- Cross-platform later is proven. (Tauri v2 is the documented fallback if footprint ever becomes a priority.)

Supporting choices:

- **Storage:** SQLite via `better-sqlite3`, with **FTS5** full-text search over subjects/snippets/senders.
- **Secrets:** Electron `safeStorage` → Windows **DPAPI** (per-user encryption); encrypted blobs at rest, never plaintext. (keytar is deprecated — not used.)
- **Scheduling:** tray-resident app with an internal scheduler (`node-schedule`) + start-at-login + missed-run catch-up ("if last scheduled run was missed while asleep/off, run on next launch"). This is what Slack/Dropbox-class apps do; Windows Task Scheduler can be added later as a belt-and-suspenders trigger.
- **Updates:** `electron-updater` against GitHub Releases.

## 4. Architecture

```
┌────────────────────────────── Electron app ──────────────────────────────┐
│                                                                          │
│  Renderer (React)                    Main process (Node/TS)              │
│  ┌───────────────────┐              ┌──────────────────────────────┐     │
│  │ Dashboard         │   IPC        │ Scheduler (daily/weekly,     │     │
│  │ Reports viewer    │◄────────────►│  run-now, catch-up)          │     │
│  │ Accounts wizard   │              ├──────────────────────────────┤     │
│  │ AI settings       │              │ Pipeline orchestrator        │     │
│  │ Review/correct UI │              │  fetch→classify→track→brief  │     │
│  └───────────────────┘              ├───────────┬──────────────────┤     │
│                                     │ Mail layer│ AI layer         │     │
│                                     │ IMAP      │ Vercel AI SDK    │     │
│                                     │ (Gmail/   │  · Gemini        │     │
│                                     │  Yahoo/   │  · OpenAI        │     │
│                                     │  generic) │  · Claude        │     │
│                                     │ MS Graph  │  · Ollama local  │     │
│                                     ├───────────┴──────────────────┤     │
│                                     │ SQLite (better-sqlite3+FTS5) │     │
│                                     │ safeStorage/DPAPI secrets    │     │
│                                     │ Report renderer (MD→HTML→PDF)│     │
│                                     │ Sync: Google Drive / OneDrive│     │
│                                     └──────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 The intelligence pipeline (per run)

1. **Fetch (delta):** per account, pull only messages since the last run (IMAP UID watermark per folder with UIDVALIDITY checks; Graph delta queries for Outlook). Normalize to a common message record; dedupe by Message-ID.
2. **Classify (cheap model, batched):** each message → structured JSON via schema-constrained output: `{category: personal|work|promotions_noise, importance: 0–3, is_actionable, action_summary, deadline?, topics[], project_hint?, people[]}`. Batches of ~20 messages per call (subject + sender + trimmed body) keep cost and latency low.
3. **Track (entity resolution):** work items are linked to existing **projects** and **issues** in the DB. The model receives the current project/issue roster and the new evidence, and returns link/create/update/resolve decisions. This is what makes statuses *update over time* instead of resetting every run.
4. **Brief (stronger model, one pass):** from the updated aggregates — not raw mail — generate:
   - **Top Emerging Issues:** ranked by urgency × importance; each with what it is, why it matters now, evidence (source emails), and a suggested next step.
   - **Company Pulse:** top N projects with latest status, trend (▲ progressing / ▬ steady / ▼ at risk), and what changed since the last report.
   - **Personal digest (light):** a short list of personal items worth noticing (bills, appointments, family) — never mixed into the work brief.
5. **Render & save:** report stored in DB, written to `Documents/Inbox Intel/Reports/` as Markdown + HTML (+PDF on demand), shown in the app, and synced to Drive/OneDrive if enabled. A Windows notification announces completion with the issue count.

### 4.2 Data model (SQLite)

- `accounts` — provider, address, auth type, sync state (per-folder UID watermarks / Graph delta tokens).
- `messages` — metadata + snippet (id, account, thread, from/to, subject, date, folder). Full bodies are **not persisted by default** (processed transiently); a setting enables body retention for reprocessing.
- `classifications` — message_id, category, importance, action fields, model + prompt version, run_id (auditable, re-runnable).
- `projects` — canonical entities: name, aliases, status_summary, trend, last_activity, state (active/dormant/done).
- `issues` — title, severity, state (emerging → active → resolved), owner_action, deadline, linked evidence.
- `evidence` — many-to-many links from projects/issues to messages.
- `runs` — every execution: window scanned, counts, tokens used, cost estimate, errors.
- `reports` — period, type (daily/weekly), rendered Markdown/HTML, created_at.
- `messages_fts` — FTS5 index for instant search across everything.

### 4.3 Correction loop

Classification will sometimes be wrong. The dashboard lets the user re-label any message (Personal ↔ Work), merge/rename projects, and dismiss non-issues. Corrections are stored and injected into future classification prompts as few-shot guidance — the app gets personally better over time without any model training.

## 5. Security & privacy

- **Read-only mail access**, enforced at the protocol level.
- **Secrets** (app passwords, OAuth refresh tokens, AI keys) encrypted with DPAPI via `safeStorage`; scoped to the Windows user; "disconnect & wipe" per account in settings. Honest caveat: DPAPI protects against other users and offline theft, not malware running as the same user — standard for desktop apps of this class.
- **Data flow transparency:** email content goes only to the AI provider the user selected (or nowhere, with Ollama), and reports go only to the drive the user opted into. A settings page states this plainly, and notes that Gemini's free tier may use data for product improvement (paid tier does not).
- **Local-first:** the app is fully functional with zero cloud storage.

## 6. Report design (what the owner sees)

**Daily brief (example layout):**

> ### ⚠ Top Emerging Issues — Fri, Sep 5
> 1. **Vendor contract expires Monday — no countersignature yet** (Urgent · 3 emails · Acme Corp)
>    *Next step: sign and return the PDF from Jane before EOD Friday.*
> 2. **Customer escalation: Northwind reporting outage since Wed** …
>
> ### 📊 Company Pulse
> | Project | Status | Trend | What changed |
> |---|---|---|---|
> | Website relaunch | Staging review this week | ▲ | Design signoff received Thu |
> | Q4 budget | Waiting on dept heads | ▬ | 2 of 5 submitted |
>
> ### 🏠 Personal
> - Dentist appointment confirmation for Tue 10am · Electric bill due Sep 12

Weekly runs produce the same structure over a 7-day window plus a "resolved this week" section.

## 7. Build plan

| Milestone | Scope | Est. effort |
|---|---|---|
| **M1 — Skeleton** | Electron+React+TS scaffold, SQLite schema, tray + scheduler, settings storage w/ DPAPI | ~1 week |
| **M2 — Mail ingest** | IMAP backend (Gmail/Yahoo/generic app-password), account wizard, delta sync, FTS | ~1–2 weeks |
| **M3 — AI core** | Provider layer (Gemini/OpenAI/Claude/Ollama), classification pipeline, cost meter | ~1 week |
| **M4 — Tracking & briefs** | Project/issue entity tracking, Top Emerging Issues + Company Pulse generation, report renderer (MD/HTML/PDF) | ~1–2 weeks |
| **M5 — Polish** | Dashboard UI, correction loop, Google Drive sync, notifications, installer + auto-update | ~1–2 weeks |
| **M6 (v1.1)** | Microsoft Graph backend for Outlook.com, OneDrive sync, optional Gmail-API BYO-client mode | later |

Milestones are independently demoable; M2+M3 already delivers a usable "classify my inbox" tool.

## 8. Open questions before we build

1. **Default AI provider:** OK to make Gemini free tier the default recommendation (zero cost), with Claude/OpenAI/Ollama as options?
2. **Volume:** roughly how many emails/day across your accounts? (Only affects free-tier fit and run duration.)
3. **Retention:** default to metadata + snippets only (recommended), or store full bodies locally for richer re-analysis?
4. **Name:** "Inbox Intel" is a placeholder — happy to change.

---

*Research sources (provider policies, pricing, and platform constraints) are current as of September 2026; pricing should be re-verified at implementation time. Key references: Google OAuth restricted-scope/CASA requirements, Yahoo app-password policy, Microsoft basic-auth deprecation (Sept 2024), Anthropic third-party OAuth policy (Jan–Apr 2026), Gemini free-tier limits, Electron safeStorage/DPAPI, SQLite FTS5.*
