# Releasing InboxScout

Releases are built by `.github/workflows/release.yml` (Windows `.exe`, macOS arm64 + x64 `.dmg`, Linux x64
`.AppImage` + `.deb`) and published to GitHub Releases; installed apps self-update from there.

## Artifacts

Names are fixed (no version in them) so the README's and website's `releases/latest/download/…` links never go stale:

| File | Built on | Self-updates? |
|---|---|---|
| `InboxScout-Setup.exe` | windows-latest | yes (NSIS) |
| `InboxScout-arm64.dmg`, `InboxScout-x64.dmg` | macos-latest | yes |
| `InboxScout-x64.AppImage` | ubuntu-latest | yes (AppImage swaps itself, `latest-linux.yml`) |
| `InboxScout-x64.deb` | ubuntu-latest | no — people run `sudo apt install ./InboxScout-x64.deb` again; the app logs that updates are off |

electron-builder would otherwise name the Linux files `x86_64` (AppImage) and `amd64` (deb), which is why
`linux.artifactName` in `electron-builder.yml` spells out `x64` and the targets are x64 only. The `.deb`
carries `Maintainer: InboxScout <hello@inboxscout.ai>` (Debian requires an email; it must be a mailbox
somebody reads — see `docs/TODO-AT-PC.md`). The icon for every OS is `build/icon.png` (512×512, rendered from
`docs/assets/logo.svg`). Linux specifics for users are in `docs/LINUX.md`.

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

## Code signing

Unsigned builds show a one-time warning on each OS (documented in the README). The pipeline is wired for
Azure Trusted Signing on Windows (~$10/mo) and a Developer ID certificate + notarization on macOS ($99/yr):
it signs whenever the corresponding repository secrets exist and stays unsigned when they don't. Purchase
and setup steps, secret names and how to verify a signed build: `docs/SIGNING.md`. Linux packages are not signed; the AppImage just needs to be
marked executable.
