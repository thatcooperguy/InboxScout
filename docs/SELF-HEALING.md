# Self-healing (v1.2)

InboxScout is meant to *just work* for people who will never open a log file. So it checks its own health
before every scan (and whenever you ask), fixes what it safely can on its own, and tells you — in one plain
sentence — only when something was fixed or still needs you. This page says what it looks at, what it fixes,
what it cannot, and where to look when you want the details.

## What it checks

| Check | What "healthy" means |
|---|---|
| **Email accounts** | Every connected account can sign in; none has failed to sync twice in a row. |
| **AI helper** | The AI you connected (if any) answers; otherwise the built-in engine is in use. |
| **Reports folder** | The folder your briefs are saved in exists and can be written to. |
| **Local database** | The local database opens and passes its integrity check. |
| **Agent bridge** | If the bridge is on, the server is actually listening on its port. |
| **Scheduled scans** | On a daily or weekly schedule, the last scan is not more than two periods old. |
| **Desktop control** | On Linux with system control on, `xdotool` is installed for mouse and keyboard control. |
| **Disk space** | At least 500 MB is free where InboxScout keeps its data. |

Each check gives one item: a short title, a status (`ok`, `warn`, `fail`, or `fixed`), a plain-language
detail, and whether InboxScout can repair it by itself.

## What it fixes on its own

These repairs are safe — they never delete anything, never send anything, and never touch settings you chose —
so InboxScout applies them without asking, then re-checks:

- **Reconnecting an account** that has a saved sign-in whose token or session expired.
- **Falling back to the built-in engine** for the current run when the AI helper is down, out of quota, or
  rejecting the key. Your chosen helper stays selected and is tried again next time.
- **Moving the reports folder** to a `Reports` folder inside InboxScout's data folder when the folder you chose
  has vanished or cannot be written to (an unplugged drive, a renamed folder). Existing reports stay where they were.
- **Picking a free bridge port** when the configured one is taken, and telling connected agents the new address
  in the bridge details.
- **Re-syncing a broken account** from a clean bookmark when its delta sync has gotten stuck.
- **Retrying the AI helper** when you press Fix it for me, and switching back to it as soon as it answers.

A scan that is overdue, a Linux desktop without `xdotool`, and a nearly full disk are reported with the exact step to
take, since those need a person.

Everything it does is written to the diagnostics log and surfaces as **one calm line** on the Today screen
under "last checked", such as *🔧 Fixed on its own: reconnected Yahoo* or *🔧 Reconnecting Outlook…*. Nothing
flashes, nothing pops up.

## What it cannot fix — and tells you about

Some things need a person: a password that changed, an account you removed at the provider, a full disk, an
AI key that was revoked, a Linux desktop without `xdotool`. For those the item stays `warn` or `fail`, and the
detail says exactly what to do in plain words ("Yahoo needs a new app password — open Setup → Email accounts").
Nothing is retried in a loop.

## Where you see it

- **Today** — the one-line notice described above, only when something was just fixed or is being fixed.
- **Setup → Preferences** — the tile's state line turns amber and reads "1 thing needs attention" when a
  check fails; otherwise it is unchanged.
- **Settings → Health** — the full picture: a status line ("Everything is working" with a green dot, or
  "1 thing needs attention"), the list of items with a glyph each (✓ ok, ⚠ warning, ✕ failed, 🔧 fixed), and
  the **Fix it for me** button. At the **Simple** layout this section is hidden entirely while everything works,
  and shows only the status line and the button when not.

## "Fix it for me"

The button runs every safe repair above, once, and shows the refreshed list with a "Fixed: …" line for anything
that changed. It never asks a follow-up question. If nothing changed, it says so. Hermes and other connected
agents can press it too (see below).

## Diagnostics and the log

Under **Settings → Health → Details ▸**:

- **Copy diagnostics** puts the last ~200 lines of the local diagnostics log plus the app, engine, and OS
  versions on the clipboard — paste it into a message to whoever helps you. It contains no email content and
  no passwords.
- **Show the log file** reveals the log in your file manager. It is `diagnostics.log` in InboxScout's data folder
  (`%APPDATA%\InboxScout` on Windows, `~/Library/Application Support/InboxScout` on macOS,
  `~/.config/InboxScout` on Linux), capped at 1 MB with one older copy kept as `diagnostics.log.1`.

## Hermes and other agents

With the **Agent bridge** on, two tools are available at any access level:

- `health_check` — the current report, `{ ok, checkedAt, items, recentFixes }`.
- `health_repair` — apply every safe automatic repair and return the refreshed report.

A good Hermes habit: call `health_check` before `run_scan`; if `ok` is false and an item has `canRepair: true`,
call `health_repair`; if an item stays broken, read its `detail` to the person — it already says what to do.
See `integrations/hermes/README.md`.

## Under the hood

The checks and repairs live in `src/main/health/` (one small module per check), the preload exposes
`healthStatus()`, `healthRepair()`, `diagnosticsText()`, and `diagnosticsOpen()`, and the shared types are
`HealthStatus`, `HealthItem`, and `HealthReport` in `src/shared/types.ts`. Adding a check means adding one
module that returns a `HealthItem` and, optionally, a `repair()`.
