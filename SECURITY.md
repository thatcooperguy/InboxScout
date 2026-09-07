# Security policy

InboxScout reads people's email, so security reports get priority over everything else.

## Reporting a vulnerability

Email **hello@inboxscout.ai** with "SECURITY" in the subject, or use GitHub's private
[Report a vulnerability](https://github.com/thatcooperguy/InboxScout/security/advisories/new) form. Please do
not open a public issue for a security problem.

Include what you found, the version (Settings → Health → Copy diagnostics gives it), and steps to reproduce.
You will get a reply within 5 business days. Fixes ship as a new release; the app updates itself.

## What is in scope

- The desktop app (all platforms), the phone companion page, the local agent bridge (REST, MCP, events), the
  Assistant, and system control.
- The website (inboxscout.ai) and the release pipeline.

## Out of scope

- Attacks that need physical access to an unlocked computer.
- Third-party services the person chose to connect (AI providers, mail providers).

## Design commitments you can check in the code

- The app never sends, deletes, or moves mail; replies are drafts the person sends.
- Passwords and keys live in the OS keychain; the AI model never receives a saved password.
- Nothing leaves the computer unless the person connected a service that requires it.

Cooper Studios LLC
