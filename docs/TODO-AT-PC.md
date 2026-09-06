# Owner to-do list (things only the repo/domain owner can do)

Everything the app needs that a script cannot do for you, in priority order. Each item links to the
exact page. Most take under 10 minutes. Tick them off as you go.

## 1. Website live at inboxscout.ai  (~10 min)  → full steps: `docs/PHONE-SETUP.md`

- [ ] **GitHub Pages on**: https://github.com/thatcooperguy/InboxScout/settings/pages → Source: **GitHub Actions**
- [ ] Run the deploy: https://github.com/thatcooperguy/InboxScout/actions/workflows/pages.yml → *Run workflow*
      (or at a terminal: `GITHUB_TOKEN=ghp_… bash scripts/setup-pages.sh` does this and the next step)
- [ ] Custom domain on that Pages page: `inboxscout.ai` → Save
- [ ] Squarespace DNS for inboxscout.ai: four **A @** records `185.199.108.153` `185.199.109.153`
      `185.199.110.153` `185.199.111.153` and **CNAME www → thatcooperguy.github.io**
      (https://account.squarespace.com/domains)
- [ ] Squarespace: forward **inboxscout.org → https://inboxscout.ai** (permanent)
- [ ] After "DNS check successful": tick **Enforce HTTPS**
- [ ] Optional: verify the domain under your profile → Settings → Pages → *Add a domain*

## 2. Zero-setup sign-in for everyone  (~15 min, once)  → `docs/RELEASING.md`

So nobody who installs InboxScout ever registers an app with Google or Microsoft:

- [ ] Open InboxScout → **Setup → Connect helper → Google → Start** (it captures the client ID + secret for you),
      or follow `docs/GOOGLE.md`
- [ ] Same for **Microsoft** (captures the app ID), or follow `docs/OUTLOOK.md`
- [ ] Add three repository secrets at https://github.com/thatcooperguy/InboxScout/settings/secrets/actions:
      `INBOXSCOUT_GOOGLE_CLIENT_ID`, `INBOXSCOUT_GOOGLE_CLIENT_SECRET`, `INBOXSCOUT_MS_CLIENT_ID`
- [ ] Cut a release (Actions → Release → *Run workflow*). From then on "Sign in with Google / Microsoft" just works.
- [ ] Google only: in the Cloud console's OAuth **Audience** page either add family members' Gmail addresses as
      test users, or click **Publish app** so sign-ins don't expire weekly.

## 3. Try it on your own inbox  (~5 min)

- [ ] Download https://github.com/thatcooperguy/InboxScout/releases/latest/download/InboxScout-Setup.exe
      (SmartScreen → *More info* → *Run anyway*)
- [ ] Connect one account, press **Check my email now**, read the brief; tell Claude what felt wrong — real mail
      tunes the rules better than any test.

## 4. Later / optional

- [ ] **Code signing** when you're ready to hand installers to non-technical folks: Azure Trusted Signing (~$10/mo)
      and an Apple Developer ID ($99/yr) — `docs/RELEASING.md`
- [ ] **Trademark** "InboxScout" (USPTO, ~$250–350) — the license protects the code, not the name
- [ ] Put your legal name in `LICENSE.md` (currently `thatcooperguy (github.com/thatcooperguy)`)
- [ ] Make `main` the default branch: GitHub → Settings → Branches (the code currently lives on
      `claude/email-intelligence-app-design-sh8tmz`; Claude can merge it into `main` on request)
