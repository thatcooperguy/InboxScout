# "Sign in with Google" for Gmail

InboxScout can connect Gmail two ways:

| | App password (default) | Sign in with Google |
|---|---|---|
| Setup for the person | Press **Get it for me**, sign in on Google's page, press Create (2-Step Verification must be on) | Click a button, sign in on Google's page |
| What InboxScout sees | The mail itself | The mail **plus Gmail's own signals**: Promotions / Social / Updates / Forums categories, Important and Starred markers, read state, real threads, Sent mail in the same pass |
| Sorting quality | Good | Noticeably better — Gmail already knows what's a newsletter |
| One-time setup by the installer | None | A free Google Cloud "OAuth client" (10 minutes, below) |

## One-time setup (whoever installs InboxScout for the family)

> **Easiest:** open **Setup → Sign-in setup** in InboxScout (shown when the IDs are not already built in). It opens each page below for you and captures the IDs
> automatically. Official builds may already include the IDs (the helper says "Ready") — then skip this entirely.
> Maintainers: see `docs/RELEASING.md` to bake IDs into releases.

1. Go to https://console.cloud.google.com → create a project (e.g. `InboxScout`).
2. **APIs & Services → Library** → search **Gmail API** → Enable.
3. **APIs & Services → OAuth consent screen** → External → fill in the app name and your email → Save.
   - Under **Scopes**, add `https://www.googleapis.com/auth/gmail.readonly`.
   - Under **Test users**, add the Gmail addresses of everyone who will use it (up to 100).
   - *Tip:* while the app is in **Testing**, Google expires sign-ins every 7 days. Click **Publish app**
     to stop that; Google shows an "unverified app" warning on sign-in (click *Advanced → Go to InboxScout*)
     but sign-ins then last. Verification with Google's paid CASA audit is only needed beyond 100 users.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type **Desktop app**.
5. Copy the **Client ID** and **Client secret**.
6. In InboxScout: **Setup → Preferences → Advanced** → paste both → Save.

Developers building their own installers can instead set `INBOXSCOUT_GOOGLE_CLIENT_ID` and
`INBOXSCOUT_GOOGLE_CLIENT_SECRET` at build/run time. (For desktop apps Google itself treats the
"secret" as non-secret; it only identifies the app.)

## Connecting an account

Setup → Email accounts → Connect an account → Gmail → **Sign in with Google**. A browser tab opens on
Google's sign-in page; approve **read-only** access; the tab says "InboxScout is connected". Done.
InboxScout asks for `gmail.readonly` only — it can never send, delete, or change mail.
