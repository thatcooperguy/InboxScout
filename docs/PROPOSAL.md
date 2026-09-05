# InboxScout — Product Proposal & Design

*A Windows desktop email intelligence assistant*

**Status:** Proposal for review — v0.1 (September 2026)

---

## 1. Executive summary

InboxScout is a Windows desktop application that connects to your personal email accounts (Gmail, Yahoo Mail, Outlook.com, and any IMAP provider), and — on demand or on a daily/weekly schedule — scans new mail, uses AI to separate **personal** items from **work-related** items, and produces an executive brief with two centerpieces:

- **Top Emerging Issues** — a ranked list of critical items that need the owner's attention right now, with urgency, the source emails, and suggested next steps.
- **Company Pulse** — the top projects and initiatives visible in the mail stream, each with a rolling, continuously updated status summary.

Every run updates a local database, so issues and projects are *tracked over time* — statuses evolve, resolved items close out, and new ones surface. Reports are always saved locally, and can optionally sync to Google Drive or OneDrive.

The AI analysis runs through the user's choice of provider — Anthropic Claude, OpenAI, Google Gemini, xAI Grok, Groq, or a fully local model via Ollama — behind a single abstraction layer, so switching providers is a settings change.

InboxScout is built for **anyone's inbox**, not just a company owner's. At setup the user picks (or the app infers) a **work profile** — business owner, real-estate agent, utility/field professional, general professional — and the classification taxonomy, issue detection, and brief vocabulary adapt to it. A **Simple Mode**, on by default, makes the whole experience three plain-language steps with zero technical choices, so a non-technical parent can run it unassisted.

## 2. Goals and non-goals

### Goals (v1)

1. Connect multiple personal email accounts with a guided, secure sign-in; credentials stored encrypted on the machine.
2. Classify all new mail since the last run into **Personal / Work / Promotions-Noise**, with importance scoring.
3. Generate the Top Emerging Issues and Company Pulse briefs for work mail.
   *(3a)* Connect an AI provider through a sign-in-style overlay — no manual key/config editing — with auto-detection of installed AI tools and guided downloads where needed.
4. Run on demand ("Run now"), or automatically on a **daily or weekly** schedule.
5. Persist everything locally (SQLite); every run is incremental and idempotent — re-runs update rather than duplicate.
6. Save reports locally as Markdown/HTML/PDF; optional sync to Google Drive (v1) and OneDrive (v1.1).
7. Let the user connect the AI provider of their choice with minimal friction.

8. Ship as a downloadable **Windows `.exe` and macOS `.dmg`** from this repository's GitHub Releases, with **in-app self-update** that checks the repo for new versions.
9. Flag — never redact — messages containing sensitive personal or confidential company information, so the owner knows it's there.

### Non-goals (v1)

- Sending, replying to, or deleting email — the app is strictly **read-only** against mailboxes.
- Linux and mobile (the stack keeps the door open; see §4).
- Multi-user / team features.

## 3. Key design decisions (and the research behind them)

### 3.1 Email account connectivity — what's actually possible in 2026

Research into current provider policies drives the connection strategy per provider:

| Provider | How InboxScout connects | Why |
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

**Free and out-of-the-box first (confirmed decision):** the app must work with zero accounts and zero payment. A **built-in rule-based engine** (pure code, runs entirely on the PC) handles classification, issue detection, sensitivity flagging, reply tracking, deadline extraction, and template briefs by default. Connecting an AI backend is an optional quality upgrade, never a requirement — and the free tiers (Gemini, Groq, OpenRouter free models) or local engines (Ollama, LM Studio) keep the upgrade free too.

For backends, the design keeps keys under the hood but wraps them in a **"Connect AI" overlay** that feels like signing in:

1. User picks a provider from a card grid (Gemini, OpenAI, Claude, Grok, Groq, Ollama), each showing cost, free-tier availability, and a privacy note.
2. The app opens an embedded sign-in window straight to that provider's key page (AI Studio / platform.openai.com / console.anthropic.com / console.x.ai / console.groq.com). The user signs in with their normal account; most providers show a one-click "Create key" button on that page.
3. The app watches the clipboard for a key of that provider's format, auto-fills it, validates it with a live test call, encrypts it with DPAPI, and shows "Connected ✓". The user never sees a config file or settings JSON.
4. **Auto-detect + download suggestions:** on first run the app scans for already-installed AI tooling (Ollama, LM Studio, Claude Code CLI, Gemini CLI, existing environment keys like `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`) and offers one-click connect for anything found — and for the privacy tier it offers to download and set up Ollama plus a suitable small model automatically.

| Provider | Onboarding via Connect AI overlay | Est. cost per 1,000 emails* |
|---|---|---|
| **Built-in engine** (default) | Nothing — works on install | **$0**, forever, fully local |
| **Google Gemini** (recommended AI upgrade) | Sign in with Google → free AI Studio key, no card | **$0** (free tier) / ~$0.60 paid |
| **OpenRouter** | Sign in → one key, hundreds of models incl. free ones | **$0** (free models) |
| **Mistral / DeepSeek** | Sign in → key | free tier / very low cost |
| **LM Studio (local)** | Auto-detected local server; no account | $0 — local |
| **Custom endpoint** | Any OpenAI-compatible server (self-hosted, vLLM, llama.cpp) | $0 — yours |
| **Groq** (fast + free tier) | Sign in → free key; OpenAI-compatible; runs open models (Llama/Qwen) at very high speed | **$0** (free tier) / ~$0.10–0.20 paid |
| **OpenAI** | Sign in → key from platform.openai.com (requires billing setup) | ~$0.50 (small models) |
| **xAI Grok** | Sign in → key from console.x.ai | ~$0.30 (grok fast models) |
| **Anthropic Claude** | Sign in → key from console.anthropic.com | ~$2.25 (Haiku 4.5) |
| **Ollama (local)** | Auto-detected, or one-click guided install; no account at all | $0 — email never leaves the PC |

*\*Classify + summarize, ≈1.5M input / 0.15M output tokens; batch APIs cut cloud costs ~50%. Prices as of Sept 2026 — re-verify at build time.*

**Gemini free tier is the recommended default** (zero cost, zero card), with **Groq's free tier** as the fast runner-up; **Ollama is the privacy tier** (classification runs well on small local models even on an 8–16 GB laptop; summaries are slower/lower-quality locally, so a hybrid "classify local, summarize cloud" mode is offered).

The AI layer is built on the **Vercel AI SDK** (TypeScript): one `generateObject`/`generateText` interface across Anthropic, OpenAI, Google, xAI, and OpenAI-compatible endpoints (which covers Groq and Ollama). Swapping providers is a model-string change. If any provider later ships a legitimate desktop OAuth flow for third-party apps, the overlay absorbs it without UI changes — the "sign in" step just gets shorter.

### 3.3 Application stack

**Electron + TypeScript + React**, chosen after comparing Electron, Tauri v2, .NET (WinUI 3), and Python:

- The workload is dominated by IMAP/OAuth/AI-API glue, where the Node ecosystem is unmatched (`imapflow`, `googleapis`, MSAL, official AI SDKs) and everything stays in one language.
- The report/dashboard *is* a web document — a webview stack renders it natively and exports PDF for free (`printToPDF`).
- Electron's weaknesses (bundle size ~150 MB, RAM) are acceptable for a tray-resident productivity app.
- Cross-platform later is proven. (Tauri v2 is the documented fallback if footprint ever becomes a priority.)

Supporting choices:

- **Storage:** SQLite via `better-sqlite3`, with **FTS5** full-text search over subjects/snippets/senders.
- **Secrets:** Electron `safeStorage` → Windows **DPAPI** (per-user encryption); encrypted blobs at rest, never plaintext. (keytar is deprecated — not used.)
- **Scheduling:** tray-resident app with an internal scheduler (`node-cron`) + start-at-login + missed-run catch-up ("if last scheduled run was missed while asleep/off, run on next launch"). This is what Slack/Dropbox-class apps do; Windows Task Scheduler can be added later as a belt-and-suspenders trigger.
- **Updates:** `electron-updater` against GitHub Releases.
- **Distribution (confirmed decision, path verified):** `electron-builder` produces a Windows **NSIS `.exe`** installer and a macOS **`.dmg`**, both published to this repository's **GitHub Releases** (`thatcooperguy/email-person-assistant-`) via `publish: {provider: "github"}`. `electron-updater` self-updates from public GitHub releases **with no token needed**. Signing costs to budget: unsigned Windows builds trigger SmartScreen "unrecognized app" warnings — **Azure Trusted Signing (~$10/mo, open to individuals)** is the cheapest fix; on macOS, notarization is effectively mandatory (since Sequoia the right-click-Open bypass is gone), so an **Apple Developer ID ($99/yr)** is required from day one for a non-technical audience.

### 3.4 Built for anyone: work profiles and Simple Mode

The intelligence layer must serve a company owner, a real-estate agent, and a power-company employee equally well. Two mechanisms make it generic:

**Work profiles.** At setup the user answers one plain question — "What kind of work do you do?" — and picks a profile (or lets the app infer one from a first scan). A profile is a data file (JSON prompt + taxonomy template), not code, so new industries can be added without a release:

| Profile | "Work" categories tuned for | The Pulse becomes | Typical emerging issues |
|---|---|---|---|
| **Business owner / executive** (default) | vendors, customers, finance, staff | Company Pulse — top projects & status | contract deadlines, escalations, approvals |
| **Real-estate agent** | clients, listings, showings, offers, lender/title/inspection threads | **Deal Pipeline** — each active deal tracked by stage (listed → offer → escrow → closed) | expiring contingencies, unanswered clients, missing documents, closing dates |
| **Utility / field professional** | shift & schedule notices, outage and safety bulletins, work orders, compliance/training | **Operations Pulse** — ongoing jobs and mandatory items | compliance due dates, urgent directives, schedule changes |
| **General professional** | plain work vs personal | Work Pulse — active threads/commitments | deadlines, waiting-on-you replies |

The tracking engine (projects/issues in SQLite) is unchanged across profiles — only the taxonomy, ranking hints, and report vocabulary swap. The correction loop (§4.3) then personalizes any profile further from the user's own re-labels.

**Simple Mode (default).** Designed so a non-technical family member can complete setup unassisted:
1. *Connect your email* — illustrated app-password wizard, one provider page at a time.
2. *Tell us what you do* — one profile question.
3. *Done* — AI defaults to the free tier (Gemini) behind the Connect AI overlay; schedule defaults to daily at 7:30am; reports save to Documents.

Simple Mode hides provider choice, retention settings, and cost meters behind an "Advanced" toggle; briefs are written in plain language at a comfortable type size. Distribution matters here too: one signed installer with silent auto-update, no configuration files, and a "Help someone set this up" share link.

### 3.5 Open-source landscape: build on, learn from, skip

A survey of relevant repositories (verified September 2026) shapes the dependency list:

- **Hermes ([NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), MIT, ~242k★):** the standout personal-AI-agent harness — self-hosted, persistent SQLite/FTS5 memory, cron-scheduled runs, skill system. It is a Python end-user platform, not an embeddable TypeScript library, so we **learn from it rather than build on it**: its cross-run memory and scheduled-agent designs directly validate (and inform) our project/issue tracker and scheduler. It's also the reference competitor for "a general agent that reads your email."
- **AI email assistants:** [inbox-zero](https://github.com/elie222/inbox-zero) (12k★, AGPL + commercial restrictions — study its triage rules and prompt patterns, copy no code) and [Mail-0/Zero](https://github.com/Mail-0/Zero) (11k★, MIT — provider-driver and AI-compose patterns are fair game). Notably, **no prominent project is desktop + IMAP + local-first + LLM triage** — this niche is open.
- **Agent frameworks (Mastra, LangGraph.js, OpenAI Agents SDK, CrewAI):** **skipped.** Our pipeline is a deterministic fetch→classify→track→summarize DAG; the LLM never decides control flow, so plain **Vercel AI SDK** calls (`generateObject` + Zod schemas) with our own retry/queue logic beat any framework on debuggability and dependency surface. Mastra is the one to revisit if cross-restart workflow resumability ever becomes painful to hand-roll.
- **Library verdicts:** `imapflow` + `mailparser` (both actively maintained by Postal Systems) for IMAP/MIME; `@azure/msal-node` for Graph OAuth; `better-sqlite3` (or Node's built-in `node:sqlite`) for storage; **`node-cron` instead of the stale `node-schedule`** for scheduling; `electron-updater` for releases; official `@ai-sdk/groq` and `@ai-sdk/xai` providers cover Groq and Grok with zero extra work; `node-llama-cpp` is the future option for an embedded no-install local model.

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
│                                     │  Yahoo/   │  · OpenAI · Grok │     │
│                                     │  generic) │  · Claude · Groq │     │
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
2. **Classify (cheap model, batched):** each message → structured JSON via schema-constrained output: `{category: personal|work|promotions_noise, importance: 0–3, is_actionable, action_summary, deadline?, topics[], project_hint?, people[]}`. The category set and ranking hints come from the active **work profile** (§3.4). Batches of ~20 messages per call (subject + sender + trimmed body) keep cost and latency low.
3. **Track (entity resolution):** work items are linked to existing **projects** and **issues** in the DB. The model receives the current project/issue roster and the new evidence, and returns link/create/update/resolve decisions. This is what makes statuses *update over time* instead of resetting every run.
4. **Brief (stronger model, one pass):** from the updated aggregates — not raw mail — generate:
   - **Top Emerging Issues:** ranked by urgency × importance; each with what it is, why it matters now, evidence (source emails), and a suggested next step.
   - **Company Pulse:** top N projects with latest status, trend (▲ progressing / ▬ steady / ▼ at risk), and what changed since the last report.
   - **Personal digest (light):** a short list of personal items worth noticing (bills, appointments, family) — never mixed into the work brief.
5. **Render & save:** report stored in DB, written to `Documents/InboxScout/Reports/` as Markdown + HTML (+PDF on demand), shown in the app, and synced to Drive/OneDrive if enabled. A Windows notification announces completion with the issue count.

### 4.2 Data model (SQLite)

- `accounts` — provider, address, auth type, sync state (per-folder UID watermarks / Graph delta tokens).
- `messages` — id, account, thread, from/to, subject, date, folder, snippet, **and full body text (stored by default — confirmed decision)**, enabling reprocessing and ask-your-inbox search; a privacy setting can switch to metadata-only.
- `classifications` — message_id, category, importance, action fields, **sensitivity flags (personal-private / company-confidential)**, model + prompt version, run_id (auditable, re-runnable).
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
- **Local-first:** the app is fully functional with zero cloud storage. Full bodies are stored locally by default (confirmed decision); a metadata-only mode remains available.
- **Sensitive-information flagging (confirmed decision):** during classification the model also tags messages that contain sensitive personal data (financial, medical, government IDs, credentials) or confidential company information. The brief includes a quiet *"Sensitive items noticed"* note — a heads-up only, with the message listed. Nothing is redacted or withheld in v1; a redaction option can come later if wanted.

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

Under other work profiles the same skeleton re-labels itself: a real-estate agent's brief leads with *Deals needing action today* and a *Deal Pipeline* table (address, stage, next deadline, what changed); a utility employee's leads with *Directives & deadlines* and an *Operations Pulse* (jobs, compliance items, schedule changes).

## 6A. Feature roadmap (from a scan of the 2025–2026 market)

A survey of Shortwave, Superhuman, SaneBox, Fyxer, Gmail's Gemini features, Notion Mail, Cora, and the open-source assistants confirms the daily brief is the market's most-loved artifact (Cora — an AI screener whose twice-daily brief users describe as "reading the inbox in 30 seconds" — is the strongest validation of this product's thesis). The features below translate best to a read-only, local-first desktop app; everything requiring send capability or mailbox mutation is deliberately deferred.

**Fold into v1 (cheap extensions of the existing pipeline):**

- **Richer screening labels:** beyond Personal/Work — *needs-reply, FYI, newsletter, cold-pitch, transactional* — surfaced as filters in the dashboard (the analytical half of Superhuman's Auto Labels / SaneBox's filtering).
- **Waiting-on-reply tracker:** detect unanswered threads in both directions from headers already synced — "you owe 3 replies; 4 people owe you" in every brief. Gold for chasing quotes, offers, and invoices.
- **Deadline & commitment extraction:** dates, appointments, and promises pulled into the brief ("inspection Friday 2pm," "invoice due 9/15") — extends the existing issue tracking.

**v1.x (after the core ships):**

- **Ask-your-inbox chat:** natural-language Q&A over the local full-body SQLite index ("who was the lender on the Hartley closing?") — the flagship feature of Shortwave and Gmail's paid tier, and a natural fit since full bodies are stored locally.
- **On-demand thread summaries** — one click on any long thread; table stakes by 2026.
- **Sender analytics & VIPs:** per-sender history, response patterns, noisiest-senders and volume trends — cheap queries over SQLite that feel magical.
- **Unsubscribe report (read-only-safe):** lists bulk senders with their `List-Unsubscribe` links; the user clicks, the app never sends.

**Deliberately skipped (and why):** AI reply drafting and auto-replies (requires send capability — the highest trust bar; revisit only as "copy draft to clipboard"); snooze/archive/auto-labeling that mutates the mailbox (breaks the read-only trust story); real-time pre-inbox screening (impossible without server-side hooks — we won't pretend); Slack/Notion/calendar integrations and sales tooling (wrong audience).

## 7. Build plan

| Milestone | Scope | Est. effort |
|---|---|---|
| **M1 — Skeleton** | Electron+React+TS scaffold, SQLite schema, tray + scheduler, settings storage w/ DPAPI | ~1 week |
| **M2 — Mail ingest** | IMAP backend (Gmail/Yahoo/generic app-password), account wizard, delta sync, FTS | ~1–2 weeks |
| **M3 — AI core** | Provider layer (Gemini/OpenAI/Claude/Grok/Groq/Ollama), Connect AI sign-in overlay with auto-detect, classification pipeline, cost meter | ~1–2 weeks |
| **M4 — Tracking & briefs** | Project/issue entity tracking, work-profile templates (owner / real estate / utility / general), Top Emerging Issues + Pulse generation, waiting-on-reply tracker, deadline extraction, sensitive-info flagging, report renderer (MD/HTML/PDF) | ~2 weeks |
| **M5 — Polish & ship** | Dashboard UI, Simple Mode onboarding, correction loop, Google Drive sync, notifications, `.exe` + `.dmg` installers published to this repo's Releases with self-update | ~1–2 weeks |
| **M6 (v1.1)** | Microsoft Graph backend for Outlook.com, OneDrive sync, ask-your-inbox chat, thread summaries, sender analytics, unsubscribe report, optional Gmail-API BYO-client mode | later |

Milestones are independently demoable; M2+M3 already delivers a usable "classify my inbox" tool.

## 8. Decisions confirmed (September 5, 2026)

1. **Default AI provider:** free tiers by default — Gemini free tier as the primary default, Groq free tier as fallback; all other providers available in Advanced settings. ✅
2. **Volume:** average personal volume — comfortably inside the free tiers. ✅
3. **Retention:** **store full bodies and text locally** (space is cheap; enables reprocessing and inbox Q&A). Paired with the sensitive-information flagging behavior: the AI flags private/company-confidential content in the brief as a heads-up, but does **not** redact it. ✅
4. **Name:** InboxScout stays. ✅
5. **Distribution:** Windows `.exe` + macOS `.dmg` downloadable from this GitHub repo's Releases; in-app self-update dialing back to the repo. ✅
6. **Profiles:** starting set stands — business owner, real-estate agent, utility/field professional, general professional.

---

*Research sources (provider policies, pricing, and platform constraints) are current as of September 2026; pricing should be re-verified at implementation time. Key references: Google OAuth restricted-scope/CASA requirements, Yahoo app-password policy, Microsoft basic-auth deprecation (Sept 2024), Anthropic third-party OAuth policy (Jan–Apr 2026), Gemini free-tier limits, Electron safeStorage/DPAPI, SQLite FTS5.*
