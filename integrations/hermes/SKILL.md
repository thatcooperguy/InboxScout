---
name: inboxscout
description: Use InboxScout (the desktop email assistant on this computer) as a tool — read today's brief, list open issues, search and read mail, trigger a scan, connect mailboxes, save sign-ins, notify or speak to the person, and drive its Assistant browser to do web chores like creating app passwords.
---

# InboxScout skill for Hermes (and any HTTP- or MCP-capable agent)

InboxScout runs on this computer and exposes a local API when **Setup → Preferences → Agent bridge** is turned on.
Everything is on `127.0.0.1` and needs the bearer token shown on that screen. The person also picks an access
level there: **Read only** (brief, issues, mail, status) or **Full** (everything below).

**Preferred: attach it as an MCP server** (tools appear natively, no curl needed):

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  inboxscout:
    url: http://127.0.0.1:47311/mcp
    headers:
      Authorization: Bearer <token from Preferences → Agent bridge>
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
| Past briefs | `list_reports`, `read_report {id}` | `GET /reports`, `GET /reports/{id}` |
| Check email now and rebuild the brief | `run_scan` / `scan_status` | `POST /run` / `GET /run` |
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
| Live events (scan progress, Assistant steps) | — | `GET /events` (Server-Sent Events) |

Machine-readable spec: `GET /v1/openapi.json` (no token needed).

## How to behave

- **Profiles.** InboxScout tunes itself to who the person is (nurse, landlord, retiree, developer… 50+ kinds). By default it
  picks from the mail automatically; `set_profile` locks a choice, `set_profile {id:"auto"}` hands it back.
- **Sign-ins.** If the person has saved a sign-in (or gives you their password and agrees to save it with `save_signin`),
  the Assistant logs in for them. It types a placeholder that InboxScout swaps at the keyboard, so neither you nor the
  browser model ever needs to see the password again. The person chooses how far it may go in
  **Setup → Assistant → Autonomy**: *Careful* (hands every sign-in to the person), *Sign in for me* (default), or *Full*.
- The Assistant opens a **visible browser window**. When `status` is `waiting_user`, the person must act on that window
  (a verification code, a phone approval, or approving a payment/delete page) — tell them, then call `assistant_continue`.
- When `status` is `waiting_answer`, read `log` for the question and answer with `assistant_answer`.
- `done` means InboxScout finished the job (for app-password recipes it also connected the account).
- Poll `assistant_status` every few seconds, or subscribe to `/v1/events`. Runs are capped at 45 steps.
- Briefs and mail are personal data: summarize for the person, don't forward them elsewhere.
- If a call fails with "read-only", ask the person to switch the bridge to **Full** in Preferences.

## Getting briefs pushed to you

InboxScout can also **POST every new brief** to a URL of your choosing (Preferences → Agent bridge → webhook). The body is
`{event:"brief", headline, brief, markdown, createdAt, reportId, notices}` with an optional bearer token. Point it at a
Hermes webhook/gateway endpoint and react on your own schedule — text the person, add to their calendar, whatever your tools allow.

## Example conversation

> User: "What do I need to deal with today?"
> Agent: `get_brief` → reads `headline`, `topIssues`, `waitingOnYou` → "Two things: the vendor contract expires Monday — sign the PDF from Jane; and Northwind is waiting on your quote. Electric bill is due the 12th."

> User: "Set up my mom's Yahoo in InboxScout. Her password is …"
> Agent: `save_signin {email:"mom@yahoo.com", password}` → `assistant_start {recipeId:"yahoo-app-password", params:{email:"mom@yahoo.com"}}` → polls status → it signs in by itself → "Yahoo wants a code texted to her phone — ask her for it, then I'll continue" → `assistant_continue` → `done` → "Her Yahoo is connected."
