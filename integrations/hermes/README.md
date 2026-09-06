# Hermes integration

InboxScout and Hermes fit together in three ways, all free and local:

1. **Hermes → InboxScout as an MCP server (recommended).** Turn on *Setup → Preferences → Agent bridge* in
   InboxScout and paste the config it shows into `~/.hermes/config.yaml`:

   ```yaml
   mcp_servers:
     inboxscout:
       url: http://127.0.0.1:47311/mcp
       headers:
         Authorization: Bearer <token>
   ```

   Hermes then has native tools — `get_brief`, `search_mail`, `read_message`, `run_scan`, `connect_account`,
   `save_signin`, `assistant_start`, `notify`, `speak`, … — the same list any MCP client (Claude Code, Cursor,
   Claude Desktop) gets. Pick **Read only** or **Full** access on the same screen.

2. **Hermes → InboxScout over REST / as a skill.** Copy `SKILL.md` from this folder into Hermes' skills directory
   (or paste it as a custom skill). It explains the REST endpoints (`/v1/...`), the Server-Sent Events feed
   (`/v1/events`), and how to behave around sign-ins and hand-offs.

3. **InboxScout → Hermes.**
   - *Every brief, pushed:* set a webhook URL under *Preferences → Agent bridge* and InboxScout POSTs each new brief
     (`{event:"brief", headline, brief, markdown, …}`) to it after every run.
   - *Per-skill agents:* any InboxScout *skill* (`docs/SKILLS.md`) can carry a `webhook` agent; matched emails
     (subject, sender, extracted fields, urgency) are POSTed to Hermes on each run.

## Sign-ins and autonomy

Hermes can hand InboxScout a person's website password with `save_signin`; it is stored with the OS keystore and
the Assistant browser uses it by typing a placeholder that InboxScout swaps at the keyboard — the AI model never
sees it. The person chooses how far the Assistant goes in *Setup → Assistant*: **Careful**, **Sign in for me**
(default), or **Full**. Verification codes always come back to the person.

## Using the computer (v1.1)

With **Full** access, Hermes also gets the desktop and file tools: `desktop_screenshot`, `desktop_click`,
`desktop_type`, `desktop_key`, `desktop_open`, `desktop_run`, `files_read`, `files_write`, `files_list`
(REST: `/v1/desktop/...` and `/v1/files/...`). They go through the same gate as InboxScout's own Assistant:
the **first time each kind of thing happens, a popup appears on the person's screen** naming Hermes and the
exact action, with *Allow once / Always allow / Don't allow*; the answer is remembered per kind. Dangerous
commands (deleting, formatting, shutdown, passwords, `sudo`, payments) ask unless the full-autonomy choice is on
(it is on by default; the person turns it off in *Settings → Who can help*), and files stay inside
the home folder with secret folders (`.ssh`, `.gnupg`, cloud credentials, keychains) off-limits. Expect a
`consent_denied` error when the person says no — tell them what you wanted and why, and do not retry in a loop.
The person can turn the whole thing off under *Preferences → Who can help → Let InboxScout use my computer*,
in which case these tools disappear. Details in `docs/SYSTEM-CONTROL.md`.

## Health (v1.2)

InboxScout looks after itself: before every scan it checks its accounts, AI helper, reports folder, database,
bridge port, and schedule, and repairs what it safely can. Hermes can ask and help too:

- `health_check` (REST `GET /v1/health`) — the current report: `{ ok, checkedAt, items: [{ id, title, status, detail, canRepair, fixedBy? }], recentFixes }`. `status` is `ok`, `warn`, `fail`, or `fixed`.
- `health_repair` (REST `POST /v1/health/repair`) — runs every safe automatic repair and returns the refreshed report. Nothing here needs a popup; it only does what InboxScout would do on its own.

If an item stays `warn`/`fail` with `canRepair: false`, read its `detail` to the person in plain words — it
already says what they need to do. Details in `docs/SELF-HEALING.md`.

The bridge speaks plain HTTP + JSON with a bearer token and publishes an OpenAPI description at
`/v1/openapi.json`, so the same setup works for OpenClaw-style agents, LangChain tools, or a shell script.
