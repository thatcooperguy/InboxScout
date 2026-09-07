# Owner to-do list (things only the repo/domain owner can do)

Everything the app needs that a script cannot do for you, in priority order. Each item links to the
exact page. Most take under 10 minutes. Tick them off as you go.

## 1. Website live at inboxscout.ai  (~10 min)  → full steps: `docs/PHONE-SETUP.md`

- [x] **GitHub Pages on**: https://github.com/thatcooperguy/InboxScout/settings/pages → Source: **GitHub Actions**
- [x] **Let `main` deploy the site**: Settings → Environments → **github-pages** → *Deployment branches and tags* → `main` allowed.
- [x] Run the deploy: https://github.com/thatcooperguy/InboxScout/actions/workflows/pages.yml → *Run workflow*
      (it also runs on every push that touches `site/`)
- [x] Custom domain on that Pages page: `inboxscout.ai` → Save — **DNS check successful**, certificate active.
- [x] Squarespace DNS for inboxscout.ai: four **A @** records `185.199.108.153` `185.199.109.153`
      `185.199.110.153` `185.199.111.153` and **CNAME www → thatcooperguy.github.io** — done.
- [ ] Tick **Enforce HTTPS** on the Pages page once GitHub allows it (it says "not yet available" for up to an hour
      after the certificate is issued; come back and tick it).
- [x] Squarespace: forward **inboxscout.org → https://inboxscout.ai** (permanent, paths kept; covers www too)
- [ ] Optional: verify the domain under your profile → Settings → Pages → *Add a domain*
- [ ] **Make the repository public** before sharing the site: Settings → General → Danger Zone → *Change repository
      visibility* → **Public**. Until then the download buttons on inboxscout.ai (release assets), the README links, and
      "Source on GitHub" fail for anyone who is not a collaborator. The license (FSL-1.1-MIT) is written for a public repo;
      no secrets live in the code (client IDs are GitHub Actions secrets).

## 2. Zero-setup sign-in for everyone  (~15 min, once)  → `docs/RELEASING.md`

So nobody who installs InboxScout ever registers an app with Google or Microsoft:

- [ ] Open InboxScout → **Setup → Assistant → "Register the Google sign-in app" → Start** (it clicks through for you;
      you only sign in), or **Setup → Connect helper** to click yourself, or follow `docs/GOOGLE.md`
- [ ] Same for **Microsoft** (Assistant → "Register the Microsoft sign-in app"), or follow `docs/OUTLOOK.md`
- [ ] Add three repository secrets at https://github.com/thatcooperguy/InboxScout/settings/secrets/actions:
      `INBOXSCOUT_GOOGLE_CLIENT_ID`, `INBOXSCOUT_GOOGLE_CLIENT_SECRET`, `INBOXSCOUT_MS_CLIENT_ID`
- [ ] Cut a release (Actions → Release → *Run workflow*). From then on "Sign in with Google / Microsoft" just works.
- [ ] Google only: in the Cloud console's OAuth **Audience** page either add family members' Gmail addresses as
      test users, or click **Publish app** so sign-ins don't expire weekly.

## 2a. The project mailbox: hello@inboxscout.ai  (~5 min)

The Linux `.deb` lists `InboxScout <hello@inboxscout.ai>` as its maintainer (Debian requires a contact email,
and it must not be a personal address in the repo). Make sure that address actually reaches you:

- [ ] Squarespace → Domains → inboxscout.ai → **Email forwarding** (or Google Workspace if you set that up):
      forward **hello@inboxscout.ai → your real inbox** (https://account.squarespace.com/domains)
- [ ] Send yourself a test mail to hello@inboxscout.ai and check it arrives

## 2b. Optional: let Hermes use InboxScout  (~3 min)

- [ ] InboxScout → **Setup → Preferences → Agent bridge → On**, choose **Full** (or Read only), press **Show** on the token
- [ ] Paste the `mcp_servers:` snippet shown there into `~/.hermes/config.yaml`; restart Hermes → it now has
      `get_brief`, `search_mail`, `assistant_start`, … (`integrations/hermes/README.md`)
- [ ] Optional: under the same card, set a **webhook URL** so every new brief is POSTed to Hermes

## 3. Try it on your own inbox  (~5 min)

- [ ] Download https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-Setup.exe
      (SmartScreen → *More info* → *Run anyway*). Linux box? `…/InboxScout-x64.AppImage` (then `chmod +x`) or
      `…/InboxScout-x64.deb` — see `docs/LINUX.md`
- [ ] Connect one account, press **Check my email now**, read the brief; tell Claude what felt wrong — real mail
      tunes the rules better than any test.

## 4. Later / optional

- [ ] **Code signing** when you're ready to hand installers to non-technical folks: Azure Trusted Signing (~$10/mo)
      and an Apple Developer ID ($99/yr) — `docs/RELEASING.md`
- [ ] **Trademark** "InboxScout" (USPTO, ~$250–350) — the license protects the code, not the name
- [ ] Put your legal name in `LICENSE.md` (currently `thatcooperguy (github.com/thatcooperguy)`)
- [x] `main` is the default branch and the only branch; all work lands there.
