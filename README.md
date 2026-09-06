<p align="center">
  <img src="docs/assets/logo.svg" width="120" alt="InboxScout logo" />
</p>

<h1 align="center">InboxScout</h1>

<p align="center">
  <strong>Your email, scouted.</strong><br/>
  A free desktop assistant that reads your inbox, sorts personal from work, and hands you a 30-second brief of what actually needs you.
</p>

<p align="center">
  <a href="https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-Setup.exe"><img src="https://img.shields.io/badge/⬇%20Download%20for%20Windows-.exe-2456a6?style=for-the-badge" alt="Download for Windows"/></a>
  &nbsp;
  <a href="https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-arm64.dmg"><img src="https://img.shields.io/badge/⬇%20Download%20for%20Mac-Apple%20Silicon%20.dmg-1e2430?style=for-the-badge" alt="Download for Mac (Apple Silicon)"/></a>
  &nbsp;
  <a href="https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-x64.dmg"><img src="https://img.shields.io/badge/⬇%20Download%20for%20Mac-Intel%20.dmg-1e2430?style=for-the-badge" alt="Download for Mac (Intel)"/></a>
</p>

<p align="center">
  <sub>Free · no account needed · updates itself · <a href="#-install">first-time install tips</a> · <a href="https://inboxscout.ai">inboxscout.ai</a></sub>
</p>

<p align="center">
  <a href="https://github.com/thatcooperguy/InboxScout/releases/latest"><img src="https://img.shields.io/github/v/release/thatcooperguy/InboxScout?label=latest&color=2456a6" alt="Latest release"/></a>
  <a href="https://github.com/thatcooperguy/InboxScout/actions/workflows/ci.yml"><img src="https://github.com/thatcooperguy/InboxScout/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-FSL--1.1--MIT-blue" alt="License"/></a>
  <img src="https://img.shields.io/badge/Windows%20%7C%20macOS-desktop-1e2430" alt="Platforms"/>
  <img src="https://img.shields.io/badge/AI%20account-optional-2e7d4f" alt="No AI account needed"/>
</p>

---

## Why

Email is where the important stuff hides between the newsletters: the contract that expires Monday, the bill that's due, the client who's been waiting three days, the school form that needs signing. InboxScout reads it all so you don't have to, and gives you one calm screen:

> **Needs you** · **Waiting for your reply** · **Coming up** · **Bills** · **Appointments** · **Deals** — or simply ✅ *You're all caught up.*

It works for a business owner, a real-estate agent, a lineworker at the power company, and your parents — because it adapts to what you do instead of making you adapt to it.

## ✨ What it does

| | |
|---|---|
| 📬 **Reads all your mail, read-only** | Gmail (Sign in with Google or app password), Yahoo, iCloud, Outlook.com/Hotmail (Sign in with Microsoft), any IMAP. It can never send, delete, or change anything. |
| 🧠 **Sorts personal from work** | Plus importance, needs-reply, newsletters, receipts, and a heads-up when something contains sensitive info (never redacted). |
| 📰 **Daily or weekly brief** | Top emerging issues with a concrete next step each, a rolling pulse on your projects/deals/jobs, a reply tracker, and upcoming dates. Saved as HTML, Markdown, and PDF. |
| 🔎 **Skills — you pick what to watch for** | Bills & invoices, appointments, real-estate deals, work orders & compliance, deliveries, travel, school & family, health, job search, customer requests, important people. |
| 🧩 **Custom agents for companies** | Drop a JSON skill in a folder to teach InboxScout your kind of mail — and route matches to your own AI agent by webhook. [docs/SKILLS.md](docs/SKILLS.md) |
| 💸 **Free, works out of the box** | A built-in engine runs 100% on your computer with no account. Optionally connect Gemini, Groq, OpenRouter, Mistral, DeepSeek, OpenAI, Claude, Grok, Ollama, LM Studio, or any OpenAI-compatible endpoint for smarter results. |
| 👵 **Simple enough for anyone** | Three tabs, one big button, a three-step setup, adjustable text size. Advanced tools are there when you want them. |
| 📨 **Comes to you** | Email yourself the brief, get the headline as a **text message** (free carrier gateways), press **Read it to me**, or let InboxScout **speak a voice summary** out loud when the morning brief is ready. It only ever sends to *you*. |
| ✍ **Reply drafts & exports** | One click opens your own mail app with a starter reply (you send it). Export your list to CSV, add dates to any calendar (.ics), and optionally save briefs to **Google Docs** with a **Google Sheets** tracker. |
| 🤖 **Assistant** | An AI-operated browser that does web chores for you in its own window: creates the Gmail/Yahoo/iCloud app password and connects the account, registers the Google/Microsoft sign-in apps, adds family members — or any task you describe. Save a sign-in and it logs in for you (the AI never sees the password); pick how far it may go — Careful, Sign in for me, or Full. Every step is visible with a Stop button. [docs/ASSISTANT.md](docs/ASSISTANT.md) |
| 🤝 **Hermes & other agents** | Turn on the local **Agent bridge** and InboxScout becomes a tool for Hermes, Claude Code, or any MCP client: an MCP server, a REST API with OpenAPI, and a live event stream — read the brief, search mail, check email now, connect accounts, drive the Assistant, notify or speak to the person. Read-only or Full access, your choice. It can also push every brief to a Hermes webhook. [integrations/hermes/](integrations/hermes/) |
| 🧑‍💻 **Connect helper** | Prefer to click yourself? The helper opens the right pages and captures the IDs as they appear. Official builds can skip both entirely. |
| 🔒 **Local-first & private** | Everything lives in a local database; passwords and keys are encrypted with your OS keychain. Email content only goes to the AI you choose — or nowhere. |
| 🔄 **Self-updating** | Installs from this page and updates itself from Releases. |

## 🚀 Install

**Download** (always the newest version):

- **Windows:** [InboxScout-Setup.exe](https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-Setup.exe)
- **Mac with Apple Silicon (M1–M4):** [InboxScout-arm64.dmg](https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-arm64.dmg)
- **Mac with Intel:** [InboxScout-x64.dmg](https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-x64.dmg)
- Not sure which Mac? Apple menu → *About This Mac* → look for "Apple M…" (Apple Silicon) or "Intel".

All versions are on the [Releases page](https://github.com/thatcooperguy/InboxScout/releases).

> **Heads-up: the installers aren't code-signed yet** (that costs money; we're in the friends-and-family stage). You'll see a one-time warning:
>
> - **Windows:** SmartScreen says *"Windows protected your PC"* → click **More info** → **Run anyway**.
> - **macOS:** *"InboxScout can't be opened"* → open **System Settings → Privacy & Security**, scroll down, click **Open Anyway**, then open the app again.
>
> That's it — the app updates itself after that.

Then the three-step setup: **connect your email → say what kind of work you do → check your email.** Two minutes.

<details>
<summary><strong>Connecting Gmail, Yahoo, iCloud</strong></summary>

**Gmail's best option is "Sign in with Google"** — a normal Google sign-in page, no app password, and InboxScout gets Gmail's own Promotions/Social/Updates labels and Important markers for much better sorting. It needs a one-time free Google setup by whoever installs InboxScout ([docs/GOOGLE.md](docs/GOOGLE.md)).

Otherwise these use an **app password** (a special 16-character password just for InboxScout):
- Gmail: turn on 2-Step Verification, then create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- Yahoo: Account Security → *Generate and manage app passwords*
- iCloud: [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords

The setup screen shows these steps for whichever provider you pick.
</details>

<details>
<summary><strong>Connecting Outlook.com / Hotmail / Live</strong></summary>

Microsoft accounts sign in with a short code instead of a password. A one-time free app registration is needed by whoever sets up InboxScout — five minutes, steps in [docs/OUTLOOK.md](docs/OUTLOOK.md).
</details>

## 🧩 Make it yours

- **Setup → What to watch for** — tick the skills that matter in your life; name your *Important people*; list senders to *Never bother me about*.
- **Setup → AI helper** — free built-in engine by default; connect any AI in one click for smarter briefs.
- **Setup → Preferences** — schedule (daily 7:30 by default), text size, work profile, privacy, and **Send me my brief** (email / text).
- **Setup → Connect helper** — one-time Google/Microsoft app setup with the helper capturing the IDs; skip if your build already includes them.

## 🛠 Develop

```bash
npm install
npm run dev          # launch with hot reload
npm run typecheck    # strict TS across main + renderer
npm test             # vitest (60+ tests)
npm run lint
npm run package      # build local installers (no publish)
```

Headless scan: `inboxscout --sync`. Stack: Electron · TypeScript · React · better-sqlite3 (FTS5) · imapflow + mailparser · Microsoft Graph (MSAL) · Vercel AI SDK · node-cron · electron-updater.

Website: [inboxscout.ai](https://inboxscout.ai) ([how it's hosted](docs/WEBSITE.md)) · Maintainer checklist: [docs/TODO-AT-PC.md](docs/TODO-AT-PC.md) · Design docs: [Proposal](docs/PROPOSAL.md) · [Roadmap](docs/ROADMAP.md) · [Skills](docs/SKILLS.md) · [Google setup](docs/GOOGLE.md) · [Outlook setup](docs/OUTLOOK.md) · [Contributing](CONTRIBUTING.md)

## 📜 License

InboxScout is **source-available** under the [Functional Source License 1.1, MIT future license (FSL-1.1-MIT)](LICENSE.md):

- ✅ Free to use, read, modify, and redistribute for any internal, personal, educational, or research purpose.
- 🚫 You may **not** use the code to build or offer a product or service that competes with InboxScout.
- ⏳ Each release automatically converts to the permissive **MIT license two years** after it is published.

"InboxScout" and the InboxScout logo identify this project — the license grants no trademark rights.
