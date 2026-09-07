# Quiet insights — things InboxScout just knows

From v0.9 InboxScout learns a few things about a person's life from their mail across **every connected inbox**.
Nothing to switch on, nothing to configure, and none of it gets in the way: each insight is computed on every scan
and shows up only when there is something worth saying. One switch under *Preferences → Reading & display → Extra cards on Today* turns all of it off.

## Your circle (People tab)

Who writes to you, who you write back to, how often, and on which inbox. Each person gets a role — family, friend,
colleague, client, vendor, service, automated — and a tier: inner circle, regular, occasional.

- **Inner-circle mail is treated as important automatically**, as if you had added them under "Important people".
- **Going quiet.** "You usually hear from Mom every week — it's been 3 weeks." Shown only for people you actually
  exchange mail with, when the silence is well past their normal rhythm.
- **New faces.** Someone new who has already written more than once.
- Two buttons correct it: **Always important** and **Not important**. Both are remembered.

How roles are guessed: kin words and shared surnames for family, two-way personal mail for friends, shared work domain
and work threads for colleagues, who invoices whom for vendor vs. client, no-reply and unsubscribe-heavy senders for
automated. It is a heuristic; the People tab is where you fix it.

## This week (unified schedule)

Every dated thing across every inbox in one place: deadlines the classifier found, appointments, travel, skill dates
(bills due, shifts, bookings, camps…), and promises you made. Grouped by day, with:

- **Overlaps** flagged ("Dentist at 2:00 overlaps Parent conference at 2:30").
- **Overdue** items that passed without being marked done.
- **Regulars** — patterns InboxScout notices on its own ("Every Tuesday around 6:00 pm — Soccer practice").

**Add dates to calendar** exports the same schedule as an `.ics` file for Google, Apple, or Outlook calendars.

## Promises you made

Sentences in your own sent mail that read like a commitment — "I'll send the contract by Friday", "let me get back
to you tomorrow" — with the due date when you stated one. Overdue ones float to the top with a **Follow up** button
that opens your mail app. Promises disappear once you write again in that thread.

## By inbox

With more than one account connected, a small line per inbox: what it is for (work, personal, or mixed — inferred
from the mail), how much came in, and how much needs you. The **Inbox review** tab can filter by inbox. The same
email delivered to two of your inboxes counts once.

## For other agents

Through the Agent bridge (`integrations/hermes/`): `list_people`, `get_schedule`, `list_promises`, and the usual
`get_brief`, which now carries `people`, `schedule`, `promises`, and `inboxes`.
