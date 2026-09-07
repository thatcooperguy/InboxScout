# InboxScout on your phone

Your brief in your pocket — on iPhone or Android — with nothing from an app store and nothing
sent to the cloud. The InboxScout app on your computer serves a small, phone-friendly page over
your home Wi‑Fi; you open it by scanning a code, and **Add to Home Screen** keeps it like an app.

## How it works

1. On the computer, open **Setup → On your phone** and tap **Show on my phone**.
2. A QR code appears. It holds a link to your computer plus a secret key.
3. Scan it with the phone's camera and tap the link. The phone opens your brief.

Behind the scenes, InboxScout starts a tiny web server on the computer (door number 47321 by
default, changeable under **Settings → Advanced** in the Pro layout). The phone talks to that server
directly over Wi‑Fi. Nothing leaves your home network, and there is no account to create.

## Keep it like an app

**iPhone (Safari)**
1. With the page open, tap the **Share** button (the square with an arrow).
2. Scroll down and tap **Add to Home Screen**, then **Add**.
3. An InboxScout icon appears on the home screen. Open it from there from now on.

**Android (Chrome)**
1. With the page open, tap the **⋮** menu in the top right.
2. Tap **Add to Home screen** (or **Install app**), then **Add**.
3. Open InboxScout from the home screen like any app.

The page remembers the key, so you do not have to scan again unless you press **New code** on the
computer.

## What the phone can do

- Read your latest brief: the headline, what needs you (with next steps), who is waiting on you,
  deadlines, what's coming up, promises you made, your circle, the watcher sections (bills,
  appointments, deliveries…).
- Press **✉ Check my email**. Your computer does the checking; the phone waits and then shows the
  fresh brief.
- Mark things **Done**.
- Open **past briefs**.
- **Ask about your mail** at the top of the page, and **Ask for help** from a trusted helper on any *Needs you* item.
- See what an **attachment** said (its summary), when a brief item came from one.
- **Refresh** at any time (it also refreshes on its own when you come back to it).

## What the phone cannot do

The phone only ever reaches a short, fixed list of operations. It cannot:

- change any setting,
- connect or remove email accounts, or see passwords or saved sign-ins,
- run the web-chores helper, or use the computer (screen, keyboard, files, commands),
- browse or open individual emails (the Ask box answers questions and shows short snippets; it never shows a full
  message or an attachment file).

If you want more than the brief on the go, the agent bridge (Setup → Preferences → Who can help) is
the door for that, and it is only reachable from the computer itself.

## Privacy

- **Local only.** The server listens on your computer and answers phones on the same network. It is
  never reachable from the internet unless you deliberately forward the door on your router (don't).
- **A key on every request.** The link in the QR code carries a secret key. Every request from the
  phone must present it; without it the server answers with an error and nothing else. The key is
  separate from the agent bridge's key.
- **New code cuts everyone off.** Anyone who has the link can read your brief — so if a phone is lost,
  or you showed the code to someone you shouldn't have, tap **New code** on the computer. Every phone
  has to scan again.
- **Off by default**, and **Turn off** stops the server at once.
- The page and the key never leave the house: no analytics, no third-party scripts, no cloud relay.

## Troubleshooting

**"Can't reach your computer. Is it on and on the same Wi‑Fi?"**
- Is the computer on and awake? A sleeping laptop does not answer. Keep it plugged in and set it not
  to sleep while you want the phone to work.
- Is the phone on the *same* Wi‑Fi as the computer? Turn off mobile data for a moment to be sure the
  phone is using Wi‑Fi. Guest networks often cannot see other devices.
- Is **On your phone** still switched on in Setup? The status line should say **On**.
- A VPN on either device usually blocks home-network traffic. Pause it and try again.

**The code scanned but the page never opens (Windows)**
- The first time InboxScout opens the door, Windows shows a **Windows Defender Firewall** prompt.
  Choose **Allow access** with **Private networks** ticked. If you dismissed it, open *Windows Security
  → Firewall & network protection → Allow an app through firewall* and tick InboxScout for Private.
- macOS may ask the same the first time; click **Allow**.

**"This link no longer works"**
- Someone pressed **New code** on the computer. Scan the current code again.

**"Something else on this computer is already using door 47321"**
- Change **Door number for my phone** under Settings → Advanced (Pro layout) to another unusual
  number, e.g. 47322, then scan the fresh code.

**The computer says it can't find its Wi‑Fi address**
- The computer is not on a network. Join your home Wi‑Fi (or plug in a network cable) and press
  **Try again**.

**The code shows one address but the phone still can't connect**
- Some computers have several network cards (a VPN adapter, a virtual machine). InboxScout picks a
  private address (192.168.x.x, 10.x.x.x, 172.16–31.x.x) when it can. If it picked the wrong one,
  disable the unused adapter, or type the right address into the phone's browser by hand:
  `http://<the computer's Wi‑Fi address>:47321/` — then scan the code once so the phone learns the key.

## For developers

- Server: `src/main/api/phone.ts` (a second `http` server bound to `0.0.0.0`, own token in the secret
  store as `phone-token`, `lanAddress()` picks the address, `qrcode` draws the code).
- Page: `src/main/api/phoneApp.ts` (one HTML string, vanilla JS, dark mode, web app manifest).
- Allow-list: `PHONE_OPS` in `phone.ts` — `get_brief`, `list_issues`, `resolve_issue`, `run_scan`,
  `scan_status`, `list_reports`, `read_report`, `get_schedule`, `list_promises`, `list_people`,
  `health_check`, `helper_list`, `helper_ask`, `helper_cancel` (v1.4), `ask` (v1.4), `list_attachments`,
  `read_attachment` (v1.5). Everything goes through the same `runOp` machinery as the agent bridge.
- Settings: `phoneAccess` (`'on' | 'off'`, default off) and `phonePort` (default 47321).
- Tests: `tests/phone.test.ts`.
