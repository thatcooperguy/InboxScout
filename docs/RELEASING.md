# Releasing InboxScout

Releases are built by `.github/workflows/release.yml` (Windows `.exe`, macOS arm64 + x64 `.dmg`) and
published to GitHub Releases; installed apps self-update from there.

## Cut a release

1. Bump `version` in `package.json` (and `package-lock.json`).
2. Commit and push, then either push a tag `vX.Y.Z` or run the **Release** workflow from the Actions tab.

## Bake the sign-in app IDs (recommended)

So that nobody who installs InboxScout ever has to register apps with Google or Microsoft, register them
once (Setup → Connect helper walks you through it, or see `docs/GOOGLE.md` and `docs/OUTLOOK.md`) and add
these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | From |
|---|---|
| `INBOXSCOUT_GOOGLE_CLIENT_ID` | Google Cloud → Credentials → your Desktop OAuth client |
| `INBOXSCOUT_GOOGLE_CLIENT_SECRET` | same client |
| `INBOXSCOUT_MS_CLIENT_ID` | Entra → App registrations → Application (client) ID |

The release build bakes them in; the Connect helper then shows both providers as **Ready (included in this build)**
and "Sign in with Google / Microsoft" just works for everyone. A person's own values in Preferences still win if set.

Google note: keep the OAuth app in **Testing** (add users' emails as test users, max 100, sign-ins expire weekly)
or **Publish** it (unverified-app warning on first sign-in, but sign-ins persist). Verification is only required
beyond 100 users.

## Code signing (later)

Unsigned builds show a one-time warning on each OS (documented in the README). When ready: Azure Trusted
Signing for Windows (~$10/mo) and an Apple Developer ID ($99/yr) with notarization; electron-builder picks up
the certificates from environment variables.
