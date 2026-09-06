# The evolving UI — Simple, Standard, Pro

InboxScout has one product for a grandparent, a child with a first inbox, and a CEO running three
accounts. It gets there by choosing **how much to show**, not by asking anyone to configure it.

## Three layouts

| | Simple | Standard | Pro |
|---|---|---|---|
| Who it fits | Someone who wants "tell me if something needs me" | Most people | Owners, executives, anyone with several inboxes |
| Tabs | Today · My briefs · Setup | + People (+ Details, Inbox review if you ask) | All, numbered 1–6 |
| Today | One big button, three cards, big text, spoken help | The full brief | Decisions first, dense cards with counts, inbox filters, Delegate, Copy brief |
| Words | Grade-5 reading level, no jargon, "I checked this morning" | Plain product words | Short, numbers first |
| Voice | Read it to me and **Explain this screen** up front | Read it to me | Read it to me |
| Keys | none | `/` search | `R` check, `1–6` tabs, `/` search |

Card names never change between layouts, the Check-my-email button never moves, Today is always first
and Setup always last. A layout only decides what is present and how dense it is.

## How it chooses

The level is scored from local signals that never leave the computer: how many inboxes are
connected, how much mail arrives, the auto-detected profile, whether the Details and Inbox review
tabs get opened, searches, corrections, exports, text size, and how often the brief is read aloud.
Every point comes with a plain reason, shown under **Settings → How much to show → Why?**

It changes with restraint: the first pick happens right away, later changes wait at least a week and a
few sessions, and every automatic change is announced once at the top of Today with **Keep it the way
it was**. Picking a layout yourself locks it.

## Every setting, explained

Settings is generated from one registry, so nothing can appear without:

- **what it does** in one plain sentence,
- **why the default** is what it is, and who usually changes it,
- a badge saying whether InboxScout **chose it for you**, it is the **default**, or **you set this**,
- **Back to automatic** on anything you changed,
- a red caution line on the few risky values.

Changes save as you make them. A search box finds settings by plain words ("voice", "Hermes",
"schedule"). Simple layouts see the basics; **Show everything** reveals the rest.

## Explain everything

Every card on Today has **Why am I seeing this?** — one calm sentence about what produced it, spoken
aloud at Simple. Done has Undo. Disconnecting an account, forgetting a key, and making a new bridge
key all ask first, in plain words. Hint text and focus rings meet WCAG AA; nothing relies on colour
alone; buttons are at least 36 px tall (44 px at Simple).

The research behind these choices is in `docs/design/` — a human-factors guide, a screen-by-screen
audit, and the adaptive-UI spec.
