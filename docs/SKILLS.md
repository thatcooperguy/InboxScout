# InboxScout Skills

A **skill** is a small JSON file that teaches InboxScout about one kind of mail. Skills power the
"What to watch for" list. Forty-six are built in: eleven universal ones (important people, bills, appointments, real-estate deals,
work orders & compliance, deliveries, travel, school & family, health, job search, customer requests) plus
thirty-five that come with the profiles (shifts, permits, tenants, loads, bookings, orders, incidents, gigs,
benefits, medications…). Anyone can add more — no code required.

## Where custom skills live

Open **Setup → What to watch for → Open skills folder**. Every `*.json` file in that folder is loaded
on each run. Broken files are reported in the brief instead of stopping the scan.

## Format

```json
{
  "id": "permits",
  "name": "Building permits",
  "icon": "🏗️",
  "description": "Tracks permit applications, inspections, and approvals from the county.",
  "match": ["permit", "inspection (?:scheduled|passed|failed)", "certificate of occupancy"],
  "senderMatch": ["@county\\.gov$"],
  "extractors": [
    { "field": "permitNo", "pattern": "permit\\s?#?\\s?([A-Z0-9-]{5,})", "flags": "i" },
    { "field": "date", "pattern": "\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \\d{1,2}\\b", "flags": "i" }
  ],
  "urgentWhen": ["failed", "expires", "final"],
  "minImportance": 2,
  "forceCategory": "work",
  "lineTemplate": "{subject} — permit {permitNo}, {date} ({from})",
  "sectionTitle": "Permits",
  "promptHint": "Permit inspections and expirations are always issues with a concrete next step.",
  "agent": {
    "kind": "webhook",
    "url": "https://agents.example.com/inboxscout/permits",
    "headers": { "Authorization": "Bearer ..." }
  }
}
```

| Field | Required | What it does |
|---|---|---|
| `id`, `name` | ✅ | Identity shown in the checklist. |
| `match` | ✅ | Regexes tested against subject + sender + body. Any hit = the skill applies. |
| `lineTemplate` | ✅ | Line in the brief. Placeholders: `{subject}` `{from}` `{date}` plus any extractor `{field}`. |
| `sectionTitle` | ✅ | Heading of the skill's section in the brief and on the Today screen. |
| `icon`, `description` | | Shown in the checklist. |
| `senderMatch` | | Regexes tested against the sender address only. |
| `extractors` | | Pull facts out: first capture group (or the whole match) becomes `{field}`. |
| `urgentWhen` | | Regexes that make a match urgent (importance 3, ‼ in the brief). |
| `minImportance` | | Floor for importance (0–3) on any match. |
| `forceCategory` | | `"work"` or `"personal"` — overrides the classifier for matched mail. |
| `promptHint` | | Extra guidance injected into AI prompts when an AI backend is connected. |
| `agent` | | Hand matched items to your own system (see below). |

## Triggering your own AI agent

When a skill has an `agent`, every run POSTs the matched items to the URL as JSON:

```json
{
  "skill": "permits",
  "items": [
    { "subject": "Permit #B-2291 inspection failed", "from": "inspections@county.gov",
      "date": "2026-09-05T14:02:00.000Z", "snippet": "...", "extracted": { "permitNo": "B-2291" }, "urgent": true }
  ]
}
```

That is the hook for **customer-specific agents**: a brokerage, a utility, or any company can run its own
agent (Claude, OpenAI, an internal system — anything with an HTTP endpoint) and have InboxScout feed it the
relevant mail. Delivery problems are reported in the brief; they never stop the scan. Only `webhook`
agents are supported today.

## Tips

- Keep `match` patterns specific — a broad pattern makes every email "important".
- Test regexes at regex101.com with the JavaScript flavor.
- Skills are matched by the built-in engine **and** by AI backends; `promptHint` only matters when an AI is connected.
