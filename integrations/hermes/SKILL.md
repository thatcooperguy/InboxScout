---
name: inboxscout
description: Use InboxScout (the desktop email assistant on this computer) as a tool — read today's brief, list open issues, search and read mail (and what its attached files say), trigger a scan, connect mailboxes, save sign-ins, notify or speak to the person, drive its Assistant browser to do web chores like creating app passwords, and (with the person's OK via a popup) look at their screen, click and type, open apps and files, run commands, and read or write files in their home folder.
---

# InboxScout skill for Hermes (and any HTTP- or MCP-capable agent)

InboxScout runs on this computer and exposes a local API when **Setup → Preferences → Who can help → Let other AI tools on this computer use InboxScout** is turned on.
Everything is on `127.0.0.1` and needs the bearer token shown on that screen. The person also picks an access
level there: **Read only** (brief, issues, mail, status) or **Full** (everything below).

**Preferred: attach it as an MCP server** (tools appear natively, no curl needed):

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  inboxscout:
    url: http://127.0.0.1:47311/mcp
    headers:
      Authorization: Bearer <token from Preferences → Who can help>
```

**Or call the REST API** (same operations):

```
export INBOXSCOUT_URL="http://127.0.0.1:47311/v1"
export INBOXSCOUT_TOKEN="<token>"
H="Authorization: Bearer $INBOXSCOUT_TOKEN"
J="content-type: application/json"
```

## Tools / endpoints

| Goal | MCP tool | REST |
|---|---|---|
| What needs attention today? | `get_brief` | `GET /brief` → `{brief:{headline, topIssues[], waitingOnYou[], deadlines[], pulse[], skillSections[]…}}` |
| Open issues with next steps | `list_issues` | `GET /issues` (`?all=1` includes resolved) |
| Mark an issue done | `resolve_issue {id}` | `POST /issues/{id}/done` |
| Projects / deals being tracked | `list_projects` | `GET /projects` |
| Find an email | `search_mail {q}` | `GET /search?q=invoice+acme` |
| Recent mail with classification | `recent_mail {limit}` | `GET /messages?limit=40` |
| Read one email in full | `read_message {id}` | `GET /messages/{id}` |
| Files attached to an email, with what each said (summary, facts: amounts, dates, people, document type; never the file path) | `list_attachments {messageId}` | `GET /messages/{messageId}/attachments` |
| What an attached file said, in full (summary, facts, text ≤ 20 000 chars) | `read_attachment {id}` | `GET /attachments/{id}` |
| Open an attached file on the person's computer with its default app (Full access; desktop only, and only while the file is still kept) | `open_attachment {id}` | `POST /attachments/{id}/open` |
| Past briefs | `list_reports`, `read_report {id}` | `GET /reports`, `GET /reports/{id}` |
| Check email now and rebuild the brief | `run_scan` / `scan_status` | `POST /run` / `GET /run` |
| Is anything wrong with InboxScout? | `health_check` → `{ok, items[{id, title, status, detail, canRepair, fixedBy?}], recentFixes[]}` | `GET /health` |
| Fix what can be fixed automatically, then re-check | `health_repair` (same shape; `status:"fixed"` items say what was done) | `POST /health/repair` |
| Connected mailboxes | `list_accounts` | `GET /accounts` |
| Connect a mailbox with an app password | `connect_account {email, provider, password}` | `POST /accounts` |
| Save a website sign-in for the Assistant | `save_signin {email, password}` / `list_signins` / `delete_signin` | `POST /signins`, `GET /signins`, `DELETE /signins/{email}` |
| Assistant recipes | `list_recipes` | `GET /assistant/recipes` |
| Have the Assistant connect Gmail for someone | `assistant_start {recipeId:"gmail-app-password", params:{email}}` | `POST /assistant/start` |
| Any web chore on a site | `assistant_start {goal, startUrl, signinEmail?}` | same |
| Watch progress | `assistant_status` | `GET /assistant/status` → `{status, log[], captured}` |
| Answer / resume / stop | `assistant_answer {text}`, `assistant_continue`, `assistant_stop` | `POST /assistant/answer`, `/assistant/continue`, `/assistant/stop` |
| Show a desktop notification | `notify {title?, body}` | `POST /notify` |
| Say something out loud | `speak {text}` | `POST /speak` |
| Skills on/off | `list_skills`, `set_skills {ids}` | `GET /skills`, `POST /skills` |
| The person's circle (family, friends, clients…) | `list_people {tier?}` | `GET /people?tier=inner` |
| This week across every inbox (overlaps, overdue, regulars) | `get_schedule` | `GET /schedule` |
| Promises the person made in their own mail | `list_promises` | `GET /promises` |
| Who is this inbox for? (50+ profiles) | `list_profiles`, `detect_profile`, `set_profile {id or "auto"}` | `GET /profiles`, `GET /profiles/detect`, `POST /profiles` |
| Preferences (safe subset) | `get_settings`, `update_settings {patch}` | `GET /settings`, `PATCH /settings` |
| Ask a plain question about the mail (local engine first, then the AI helper within 8 s; one question in flight per client) | `ask {q}` → `{text, sources[], actions[]}` | `POST /ask` |
| Disconnect a mailbox (Full access) | `remove_account {id}` | `DELETE /accounts/{id}` |
| The person's trusted helpers (family/friends who get a plain-words note; contact details masked) and everything ever sent to them, verbatim | `helper_list` → `{paused, helpers[{id, name, relationship, level, cadence, paused}]}`, `helper_log {limit?, helperId?}` | `GET /helpers`, `GET /helpers/log` |
| Ask a helper for a hand with one item (goes after 10 s unless cancelled), or manage helpers (Full access; adding one sends them a hello and shows the person a 7-day notice) | `helper_ask {helperId, title, nextStep?, whyNow?, note?}` → `{sendId, sendsAt}`, `helper_cancel {sendId}`, `helper_add {name, level, relationship?, email?, phone?, carrier?, cadence?}`, `helper_update {id, patch}`, `helper_remove {id}`, `helper_pause_all {paused}` | `POST /helpers/ask`, `POST /helpers/cancel`, `POST /helpers`, `PATCH /helpers/{id}`, `DELETE /helpers/{id}`, `POST /helpers/pause` |
| Live events (scan progress, Assistant steps) | — | `GET /events` (Server-Sent Events) |

### System control (Full access only — a popup may appear on the person's screen)

| Goal | MCP tool | REST |
|---|---|---|
| See the person's screen | `desktop_screenshot` → `{dataUrl, width, height, screenWidth, screenHeight}` | `POST /desktop/screenshot` |
| Click on the desktop (screen coordinates) | `desktop_click {x, y, button?, double?}` | `POST /desktop/click` |
| Type where the cursor is | `desktop_type {text}` | `POST /desktop/type` |
| Press a key or combo | `desktop_key {combo}` e.g. `"enter"`, `"ctrl+s"` | `POST /desktop/key` |
| Open an app, a file/folder under home, or a URL | `desktop_open {target}` | `POST /desktop/open` |
| Run a shell command (home folder, 60 s) | `desktop_run {command, cwd?, timeoutMs?}` → `{code, stdout, stderr, timedOut}` | `POST /desktop/run` |
| Read a text file under home (≤ 200 KB) | `files_read {path}` → `{text}` | `POST /files/read` |
| Write a text file under home | `files_write {path, text}` → `{ok}` | `POST /files/write` |
| List a folder under home | `files_list {path}` → `[{name, dir, size}]` | `POST /files/list` |

Machine-readable spec: `GET /v1/openapi.json` (no token needed).

## System control: popups and `consent_denied`

The person decides how much control connected agents get, in **Settings → Who can help** (it is on by default, and they
accepted terms describing it at first launch). The rules:

- **Full bridge access is required.** Every system tool is a write tool; with the bridge set to *Read only* they fail with
  "read-only" — ask the person to switch the bridge to **Full**.
- **A popup may appear on the person's screen** the first time each *kind* of action happens (screenshot, mouse/keyboard,
  open, run, files). It says who is asking ("Another agent (bridge)") and what for, with **Allow once / Always allow /
  Don't allow**. Their answer is remembered per kind; the person can change it in Settings at any time. Expect the call to
  block until they answer — tell them to look at their computer if you are waiting.
- **Dangerous commands** (deleting recursively, formatting, shutting down, `sudo`, changing accounts or firewalls, piping
  downloads into a shell, force-pushing, payments…) run without a popup while the person's **Full autonomy** choice is on —
  it is on by default. If they have turned it off (Settings → Who can help), these ask every time, even under "Always
  allow", with a plain **Allow this once / Don't allow** popup that is never remembered.
- **`consent_denied`** — if any of these tools fails with an error starting with `consent_denied:`, the person said no
  (or set that kind to *Never*, or turned system control off). Tell them what you wanted to do and why, then **do not
  retry** the same action; find another way or wait for them.
- Files and `cwd` must be under the home folder; secret folders (`~/.ssh`, `~/.gnupg`, `~/.aws`, credential stores) are
  never readable or writable. `~` is expanded. `desktop_run` returns a non-zero exit code rather than an error.
- A screenshot is scaled to fit 1600 × 1000; multiply picture coordinates by `screenWidth / width` (and the same for
  height) before you `desktop_click`.
- On Linux, mouse and keyboard control needs `xdotool` (`sudo apt install xdotool`).

## How to behave

- **Profiles.** InboxScout tunes itself to who the person is (nurse, landlord, retiree, developer… 50+ kinds). By default it
  picks from the mail automatically; `set_profile` locks a choice, `set_profile {id:"auto"}` hands it back.
- **Sign-ins.** If the person has saved a sign-in (or gives you their password and agrees to save it with `save_signin`),
  the Assistant logs in for them. It types a placeholder that InboxScout swaps at the keyboard, so neither you nor the
  browser model ever needs to see the password again. The person chooses how far it may go in
  **Setup → Web chores → How far it goes**: *Full* (default: signs in and keeps going), *Sign in for me* (pauses on risky pages), or *Careful* (hands every sign-in to the person).
- The Assistant opens a **visible browser window**. When `status` is `waiting_user`, the person must act on that window
  (a verification code, a phone approval, or approving a payment/delete page) — tell them, then call `assistant_continue`.
- When `status` is `waiting_answer`, read `log` for the question and answer with `assistant_answer`.
- `done` means InboxScout finished the job (for app-password recipes it also connected the account).
- Poll `assistant_status` every few seconds, or subscribe to `/v1/events`. Runs are capped at 45 steps.
- Briefs and mail are personal data: summarize for the person, don't forward them elsewhere.
- If a call fails with "read-only", ask the person to switch the bridge to **Full** in Preferences.
- If a system-control call fails with `consent_denied`, the person said no: explain, don't retry (see above).

## Getting briefs pushed to you

InboxScout can also **POST every new brief** to a URL of your choosing (Preferences → Who can help → Also send each brief to another program). The body is
`{event:"brief", headline, brief, markdown, createdAt, reportId, notices}` with an optional bearer token. Point it at a
Hermes webhook/gateway endpoint and react on your own schedule — text the person, add to their calendar, whatever your tools allow.

## Example conversation

> User: "What do I need to deal with today?"
> Agent: `get_brief` → reads `headline`, `topIssues`, `waitingOnYou` → "Two things: the vendor contract expires Monday — sign the PDF from Jane; and Northwind is waiting on your quote. Electric bill is due the 12th."

> User: "Set up my mom's Yahoo in InboxScout. Her password is …"
> Agent: `save_signin {email:"mom@yahoo.com", password}` → `assistant_start {recipeId:"yahoo-app-password", params:{email:"mom@yahoo.com"}}` → polls status → it signs in by itself → "Yahoo wants a code texted to her phone — ask her for it, then I'll continue" → `assistant_continue` → `done` → "Her Yahoo is connected."
