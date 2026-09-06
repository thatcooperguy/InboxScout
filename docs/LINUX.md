# InboxScout on Linux

Linux is a first-class platform: every release ships `InboxScout-x64.AppImage` and `InboxScout-x64.deb`
(64-bit Intel/AMD; no arm64 build yet), built on `ubuntu-latest` by the same workflow as Windows and macOS.

## AppImage or .deb?

| | AppImage | .deb |
|---|---|---|
| Works on | any distribution | Ubuntu, Debian, Mint, Pop!_OS and other apt-based ones |
| Install | mark it executable, double-click | `sudo apt install ./InboxScout-x64.deb` |
| Updates itself | **yes** (checks GitHub Releases every 6 hours, swaps the file on quit) | **no** — download the new `.deb` and install it again; the app writes a log line saying updates are off |
| App menu entry | only if you use an AppImage launcher (Gear Lever, AppImageLauncher) | yes |

To make the AppImage executable: right-click → **Properties** → **Permissions** → **Allow executing file as
program**, or `chmod +x InboxScout-x64.AppImage`. Nothing is code-signed on Linux; that is normal.

## What works

Everything that works on Windows and macOS: reading mail, briefs, the tray icon (quit from its menu; closing
the window keeps InboxScout running), notifications, opening reports and links (`xdg-open`), the Assistant
browser, the agent bridge, and "start with my computer" (written as `~/.config/autostart/inboxscout.desktop`;
honoured by GNOME, KDE, XFCE, Cinnamon and MATE).

**Read it to me** uses `spd-say` (speech-dispatcher) or `espeak` when either is installed; without them the
brief is simply not spoken. `sudo apt install speech-dispatcher` or `sudo apt install espeak` turns it on.

## Passwords and the keyring

Mail passwords and AI keys are locked with the system keyring (gnome-keyring or KDE Wallet) through
Electron's `safeStorage`. On a desktop without a keyring — some minimal window managers, containers, or a
fresh server install — InboxScout still works: passwords are stored obfuscated (Electron's `basic_text`
backend) rather than encrypted, and **Settings → Health → Password storage** says so, with the fix:

```
sudo apt install gnome-keyring     # or: kwalletmanager on KDE
```

Log out and in again after installing; the next time you save a password it is encrypted with the keyring.

## Desktop control (optional)

The "use my computer" features (click, type, press keys) use `xdotool` on Linux (X11). If it is missing,
Health shows a warning; `sudo apt install xdotool` fixes it. Wayland sessions restrict what xdotool can do;
opening apps and files, running commands, and file work do not need it.

## Where things live

- Data and logs: `~/.config/inboxscout/` (`inboxscout.db`, `diagnostics.log`, `skills/`)
- Reports: `~/Documents/InboxScout/Reports/` (changeable in Preferences)
- Autostart entry: `~/.config/autostart/inboxscout.desktop`
- Headless scan from a terminal or cron: `./InboxScout-x64.AppImage --sync` (or `inboxscout --sync` for the .deb)
