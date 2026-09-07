# Releasing InboxScout

Releases are built by `.github/workflows/release.yml` (Windows `.exe`, macOS arm64 + x64 `.dmg` and `.zip`, Linux
x64 `.AppImage` + `.deb`) and published to GitHub Releases; installed apps self-update from there.

> Builds before **v1.5.5** never checked for updates (the updater module was loaded in a way that left it undefined,
> and the failure was logged as a warning). Anyone on an older build must download the new installer once; from
> v1.5.5 on, updates arrive on their own.

## Artifacts

Names are fixed (no version in them) so the README's and website's `releases/latest/download/…` links never go stale:

| File | Built on | Self-updates? |
|---|---|---|
| `InboxScout-Setup.exe` | windows-latest | yes (NSIS) |
| `InboxScout-arm64.dmg`, `InboxScout-x64.dmg` | macos-latest | the dmg is what people download; updates install from the zip below |
| `InboxScout-arm64.zip`, `InboxScout-x64.zip` | macos-latest | yes — electron-updater on macOS only updates from a zip, and only once builds are signed (`docs/SIGNING.md`) |
| `InboxScout-x64.AppImage` | ubuntu-latest | yes (AppImage swaps itself, `latest-linux.yml`) |
| `InboxScout-x64.deb` | ubuntu-latest | no — people run `sudo apt install ./InboxScout-x64.deb` again; the app logs that updates are off |

electron-builder would otherwise name the Linux files `x86_64` (AppImage) and `amd64` (deb), which is why
`linux.artifactName` in `electron-builder.yml` spells out `x64` and the targets are x64 only. The `.deb`
carries `Maintainer: Cooper Studios LLC <hello@inboxscout.ai>` (Debian requires an email; it must be a mailbox
somebody reads — see `docs/TODO-AT-PC.md`). The icon for every OS is `build/icon.png` (512×512, rendered from
`docs/assets/logo.svg`). Linux specifics for users are in `docs/LINUX.md`.

## Cut a release

1. Bump `version` in `package.json` (and the two matching lines in `package-lock.json`). The tag is derived from it
   (`v<version>`); a version that already has a published release is refused ("already published; bump the version").
2. Commit and push, then run **Actions → Release → Run workflow** with *Publish* = `yes` (or push the tag `v<version>`;
   a pushed tag that does not equal `v<version>` is refused).
3. Three jobs build in parallel (`windows-latest` → `.exe`, `macos-latest` → both `.dmg` and both `.zip`,
   `ubuntu-latest` → `.AppImage` + `.deb`), run the tests, and upload their files plus `latest*.yml` as
   `installers-<os>` artifacts. electron-builder never talks to GitHub Releases itself (its per-file uploader created
   duplicate drafts in v26).
4. The `publish` job downloads the artifacts, checks that all ten files are present, deletes any stray drafts for the tag,
   creates the release as a draft with generated notes, attaches everything, and only then publishes it as *latest*.
   A failed platform build means no release at all — never a partial one.

**Dry run.** *Run workflow* with *Publish* = `no` does steps 3 only: the installers are attached to the workflow run as
artifacts and nothing is released. Use it before Electron or electron-builder upgrades and before enabling signing.

**Delete a broken release.** *Actions → Tidy releases → Run workflow* with the tag. It refuses to delete a complete release
unless *force* = `yes`, and removes the tag as well. The next release's generated notes then compare against the last
*existing* tag; if a release's notes point at a deleted tag, fix them with *Actions → Edit release notes*.

Locally, `npm run package` builds installers into `dist/` without publishing; `npm run release` is intentionally disabled.

## Bake the sign-in app IDs (recommended)

So that nobody who installs InboxScout ever has to register apps with Google or Microsoft, register them
once (Setup → Sign-in setup walks you through it, or see `docs/GOOGLE.md` and `docs/OUTLOOK.md`) and add
these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | From |
|---|---|
| `INBOXSCOUT_GOOGLE_CLIENT_ID` | Google Cloud → Credentials → your Desktop OAuth client |
| `INBOXSCOUT_GOOGLE_CLIENT_SECRET` | same client |
| `INBOXSCOUT_MS_CLIENT_ID` | Entra → App registrations → Application (client) ID |

The release build bakes them in; the Sign-in setup screen then shows both providers as **Ready (included in this build)**
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
