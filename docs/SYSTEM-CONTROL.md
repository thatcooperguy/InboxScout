# Full system control (v1.1)

Since v1.1 the Assistant — and any agent connected through the bridge, such as Hermes — can use the
whole computer, not just its own browser window. It is **on by default**, and every kind of action is
guarded by a popup the first time it happens. This page says exactly what that means and how to turn
it off.

## What it can do

| Kind | What it means | Examples |
|---|---|---|
| **Look at my screen** (`screenshot`) | Takes a picture of the main display so the AI can see what to do next. The picture stays on this computer unless the AI helper you connected has vision, in which case it is sent to that service like any other screenshot. | "See whether the installer finished." |
| **Use my keyboard and mouse** (`input`) | Clicks at a spot, types text, presses key combinations on the desktop. | Click *Next*, type a file name, press Ctrl+S. |
| **Open apps and files** (`open`) | Opens an app, a file, a folder, or a web address with whatever the OS uses for it. | Open the PDF the bank sent; open Calculator. |
| **Run commands** (`run`) | Runs a shell command (PowerShell on Windows, `/bin/sh` elsewhere) in your home folder, with a 60-second limit. | List the Downloads folder; unzip an archive. |
| **Read and change my files** (`files`) | Reads, writes, and lists files and folders — under your home folder only. | Save a brief as a text file on the Desktop. |

The building blocks (which OS command does a click, what counts as dangerous, which paths are allowed) live
in `src/main/desktop/scripts.ts`; the gate that asks first lives in `src/main/desktop/control.ts`.

## The popup

The **first time** InboxScout does each kind of thing, a native dialog appears with three buttons:

- **Allow once** — do it this time; ask again next time.
- **Always allow** — do it now and remember the answer for this kind of thing.
- **Don't allow** — do not do it; remember the "no" for this kind of thing.

The popup always says *who* is asking ("the Assistant" or the name of the connected agent) and *what*
exactly it wants to do — the command, the file, the app, the spot it wants to click. Remembered
answers are kept in Settings (`systemConsents`) and shown under **Settings → Who can help → What you've
already allowed**, where each one can be changed to Always, Never, or Ask each time, and **Ask me again
for everything** forgets them all.

### Full-autonomy override

**Settings → Who can help → Full autonomy: skip the safety popup for dangerous actions** (off by default,
`systemDangerousOverride`). When it is on *and* "Run commands" is remembered as **Always**, the
dangerous-command popup described next is skipped too, so a long job can run completely unattended.
Everything still shows in the Assistant log, and Stop still works. It is the last safety net, so the
setting carries a red warning and the "What you've already allowed" row says when it is on.

## What always asks

Some commands ask **every time**, even after *Always allow* (unless the full-autonomy override above is on) — deleting things, changing accounts or
passwords, turning off protection, and money:

- recursive or forced deletes (`rm -rf`, `del /s`, `Remove-Item -Recurse`), formatting disks, `mkfs`, `diskpart`, `dd if=`
- shutdown, restart, halt
- registry edits, `net user`, `passwd` and friends, `sudo`
- BitLocker / FileVault changes, disabling Defender or the firewall
- piping a download into a shell, `Invoke-Expression`, `chmod -R 777`
- `git push --force`, `git reset --hard`
- anything that mentions paying, payment, transfer, or wire

The list is `isDangerousCommand` in `src/main/desktop/scripts.ts`. It is a guard, not a guarantee: a
determined agent can phrase a harmful command in a way the list does not catch. The visible popups, the
home-folder rule, and the Stop button are the other layers.

## The home-folder rule and protected folders

File reads, writes, and listings are allowed **only inside your home folder** (`pathAllowed`). Inside
home, these folders are never touched, even with *Always allow*:

`.ssh`, `.gnupg`, `.aws`, `.azure`, `.config/gcloud`, `AppData/Local/Microsoft/Credentials`,
`AppData/Roaming/Microsoft/Protect`, `Library/Keychains`

Commands run in the home folder by default. A command can still name a path outside home — that is why
commands get their own popup and the dangerous-command list.

## Per-platform notes

- **Windows** — typing and keys use `SendKeys` through PowerShell; clicks use `user32` through PowerShell. No extra install.
- **macOS** — `osascript` (System Events). The first use will make macOS ask you to give InboxScout
  **Accessibility** permission in System Settings → Privacy & Security; screenshots may also ask for
  **Screen Recording**.
- **Linux** — clicks, typing, and keys need **`xdotool`** (`sudo apt install xdotool`, `dnf install xdotool`…)
  and an X11 session. On Wayland, `xdotool` only reaches XWayland windows; InboxScout reports a clear
  error rather than pretending. Opening things uses `xdg-open`.

## How Hermes (and other agents) use it

With the **Agent bridge** on and access set to **Full**, the bridge exposes the same abilities as tools:
`desktop_screenshot`, `desktop_click`, `desktop_type`, `desktop_key`, `desktop_open`, `desktop_run`,
`files_read`, `files_write`, `files_list` — over MCP (`/mcp`) and REST (`/v1/desktop/...`, `/v1/files/...`).
They go through exactly the same gate as the Assistant: **the popups still appear on your screen**, with
the agent's name in them, the remembered answers apply, dangerous commands always ask, and the
home-folder rule holds. With **Read only** access, none of these tools exist. See `integrations/hermes/`.

## How to turn it off

**Settings → Who can help → Let InboxScout use my computer → Off.** The Assistant then stays inside its
own browser window (as in v1.0), the bridge tools above disappear, and remembered answers are kept but
unused. You can also leave it on and set individual kinds to **Never**.

## The terms

Because this is a big ability, the first launch of v1.1 shows plain-language terms (`src/shared/eula.ts`)
that must be accepted before anything else. They can be re-read any time from **Settings → Who can help →
Read the terms again**. The full license is `LICENSE.md`.
