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

The bridge speaks plain HTTP + JSON with a bearer token and publishes an OpenAPI description at
`/v1/openapi.json`, so the same setup works for OpenClaw-style agents, LangChain tools, or a shell script.
