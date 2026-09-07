# Code signing InboxScout (Windows + macOS)

This is the owner's guide to getting rid of the "Windows protected your PC" and "InboxScout can't be opened"
warnings. It is written for someone who has never done this before: every step says where to click, what it
costs, and how long it takes. Nothing here needs a programmer; the release pipeline is already wired up.

**How it works, in one paragraph.** Signing needs two things: a *certificate* that says "this software really
comes from Cooper Studios LLC" (a company Microsoft/Apple has verified), and a way for the build machine to use
it. Both live as **repository secrets** on GitHub. The release workflow (`.github/workflows/release.yml`)
checks for them: when they exist it signs (and on macOS also notarizes) every build; when they don't, it builds
exactly as today, unsigned. There is no switch to flip — adding the secrets *is* the switch. Each job prints
`signing: on` or `signing: off` near the top of its log.

Secrets are added at **https://github.com/thatcooperguy/InboxScout/settings/secrets/actions → New repository
secret**. Names must match exactly (copy them from the tables below). A secret's value is never shown again
after saving; that is normal.

Prices below are as of mid-2026 and are the vendors' list prices; check the linked pages for the current
number.

---

## A. Windows — Azure Trusted Signing (~$9.99 per month)

Microsoft's own code-signing service. No hardware token, no certificate files to guard: the pipeline asks
Microsoft to sign each build, and Microsoft's servers hold the key. Certificates rotate automatically; you never
renew anything. Reference: https://learn.microsoft.com/azure/trusted-signing/quickstart

### A0. Check this before spending money

Trusted Signing's **Public Trust** certificate is issued to a *verified organization*. Microsoft has required
the organization to be based in the US or Canada **and to have a verifiable business history of three or more
years** (tax history / registration date). Confirm the current rule on
https://learn.microsoft.com/azure/trusted-signing/concept-trusted-signing-cert-management before step A1.

If Cooper Studios LLC is younger than that, the choices are: wait; check whether Microsoft has opened
*individual* identity validation (the certificate then shows your personal name instead of the LLC's); or buy
an OV/EV code-signing certificate from a certificate authority instead (SSL.com, Certum, DigiCert, Sectigo:
roughly $200–500 per year, delivered on a USB token or a cloud signing service). The pipeline can be adapted
to any of those (`build/sign.js` is the only file that talks to the signing service), but that is a
separate task.

### A1. Azure account (free, 10 minutes)

1. Go to https://portal.azure.com and sign in with a Microsoft account (create one for the company, e.g. the
   hello@inboxscout.ai mailbox, rather than a personal one).
2. If the portal asks you to create a **subscription**, choose **Pay-As-You-Go**. It needs a credit card and a
   phone number; nothing is charged until you create paid resources.
3. Register the service on your subscription: search the top bar for **Subscriptions** → click your
   subscription → left menu **Settings → Resource providers** → search `Microsoft.CodeSigning` → select it →
   **Register**. (Takes a minute; the status changes to *Registered*.)

### A2. Create the Trusted Signing account (~$9.99/mo starts here, 5 minutes)

1. Search the top bar for **Trusted Signing Accounts** → **+ Create**.
2. Fill in:
   - **Subscription**: the one from A1. **Resource group**: *Create new* → `inboxscout-signing`.
   - **Account name**: `cooperstudios` (must be globally unique; try `cooperstudiosllc` if taken).
     Write it down — it becomes the secret `AZURE_CODE_SIGNING_ACCOUNT_NAME`.
   - **Region**: **East US**. Write it down; it decides the endpoint below.
   - **Pricing tier**: **Basic** ($9.99/month, 5,000 signatures/month included; a release uses about four).
3. **Review + create** → **Create**. Open the resource when it is done.
4. Your endpoint depends on the region: East US = `https://eus.codesigning.azure.net`,
   West US 2 = `https://wus2.codesigning.azure.net`, West US 3 = `https://wus3.codesigning.azure.net`,
   West Central US = `https://wcus.codesigning.azure.net`, North Europe = `https://neu.codesigning.azure.net`,
   West Europe = `https://weu.codesigning.azure.net`. The account's **Overview** page also shows it as
   *Account URI*. This is the secret `AZURE_ENDPOINT`.

### A3. Identity validation for "Cooper Studios LLC" (free, takes 1–7 business days, sometimes longer)

This is the step where Microsoft confirms the company exists. You need the LLC's paperwork at hand:
articles of organization / certificate of formation, the IRS EIN letter (CP 575), the registered address, and
ideally the company website (inboxscout.ai) and a phone number that can be verified.

1. First give yourself permission to do this: on the Trusted Signing account → **Access control (IAM)** →
   **+ Add → Add role assignment** → role **Trusted Signing Identity Verifier** → *Members* → **Select members**
   → pick your own user → **Review + assign**. (Azure does not grant this automatically, even to the owner.)
2. Account → left menu **Objects → Identity validations** → **+ New identity → Public**.
3. Choose **Organization** and fill in the legal name exactly as registered: **Cooper Studios LLC** (this exact
   spelling is what appears in the "Verified publisher" line on users' screens), the registered address, the
   state/country of formation, the EIN, the primary email (a mailbox you read), and the website.
4. Submit. The status shows *In progress*. Microsoft (through its verification partner) may email that address
   asking for documents or to schedule a short verification call; answer promptly — the request expires. When
   the status is **Completed**, continue. If it is *Failed*, the reason is shown on the same page; fix and
   resubmit.

### A4. Certificate profile (free, 2 minutes)

1. Account → **Objects → Certificate profiles** → **+ Create → Public Trust**.
2. **Certificate profile name**: `inboxscout-public`. Write it down — secret `AZURE_CERTIFICATE_PROFILE_NAME`.
3. **Verified CN and O**: pick the identity validation from A3. Leave the rest at defaults → **Create**.

### A5. App registration — the "robot user" the build machine signs in as (free, 5 minutes)

1. Search the top bar for **Microsoft Entra ID** → left menu **Manage → App registrations** → **+ New
   registration**. Name: `inboxscout-release-signer`. Supported account types: *Accounts in this organizational
   directory only*. No redirect URI. **Register**.
2. On the app's **Overview** page copy two values:
   - **Application (client) ID** → secret `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → secret `AZURE_TENANT_ID`
3. Left menu **Manage → Certificates & secrets → Client secrets → + New client secret**. Description
   `github-release`, expiry **24 months** (the maximum). **Add**, then copy the **Value** column *immediately*
   (it is hidden after you leave the page) → secret `AZURE_CLIENT_SECRET`. Put the expiry date in your
   calendar: when it lapses, Windows builds start failing with an authentication error until you make a new
   secret and update `AZURE_CLIENT_SECRET`.
4. Give the robot permission to sign: go back to the **Trusted Signing account → Access control (IAM) → + Add
   → Add role assignment** → role **Trusted Signing Certificate Profile Signer** → *Members*: **User, group,
   or service principal** → **Select members** → search `inboxscout-release-signer` → select → **Review +
   assign**. (Role assignments can take a few minutes to become active.)

### A6. The six GitHub secrets

| Secret (exact name) | Value | Where it came from |
|---|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID, a GUID | A5 step 2 |
| `AZURE_CLIENT_ID` | Application (client) ID, a GUID | A5 step 2 |
| `AZURE_CLIENT_SECRET` | the client secret **Value** | A5 step 3 |
| `AZURE_ENDPOINT` | e.g. `https://eus.codesigning.azure.net` | A2 step 4 |
| `AZURE_CODE_SIGNING_ACCOUNT_NAME` | e.g. `cooperstudios` | A2 step 2 |
| `AZURE_CERTIFICATE_PROFILE_NAME` | e.g. `inboxscout-public` | A4 step 2 |

Set **all six or none**. With all six the Windows job prints `signing: on (Azure Trusted Signing)` and every
`.exe` electron-builder produces is signed. With some but not all it stops immediately with the missing names
(so a typo never silently ships an unsigned installer). With none it prints `signing: off` and builds as before.

Then cut a release (Actions → **Release** → *Run workflow*, or push a `vX.Y.Z` tag) and verify (section C).

---

## B. macOS — Apple Developer Program ($99 per year)

Apple requires two things for an app downloaded outside the App Store: it must be **signed** with a
"Developer ID Application" certificate, and **notarized** (uploaded to Apple, scanned, and approved — the
pipeline does this automatically once the credentials exist). Reference:
https://developer.apple.com/help/account/ and https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution

### B1. D-U-N-S number for Cooper Studios LLC (free, takes up to 5 business days, sometimes 2–4 weeks)

Apple enrolls *organizations* only if they have a D-U-N-S number — a free company identifier issued by
Dun & Bradstreet. (Enrolling as an *individual* is faster and uses the same $99 program, but then users see your
personal name instead of "Cooper Studios LLC"; enroll as the organization.)

1. Look up whether the LLC already has one: https://developer.apple.com/enroll/duns-lookup/ (sign in with an
   Apple ID first — create one for the company if needed, with two-factor authentication turned on).
2. If nothing is found, the same page lets you **request** a number. Fill in the legal name exactly as
   registered, the registered address, and a phone number. D&B emails the number when it is issued.
3. Wait until the number shows up in Apple's lookup; it can take a couple of days after D&B issues it.

### B2. Enroll in the Apple Developer Program ($99/yr, verification takes days)

1. https://developer.apple.com/programs/enroll/ → **Start Your Enrollment** → sign in with the company Apple ID.
2. Entity type **Company / Organization**. You will be asked for: the D-U-N-S number, the legal entity name,
   the website (inboxscout.ai), and confirmation that you have **legal authority to bind** the company (as the
   owner you do). Apple may phone the number on file to verify.
3. Pay the $99 and wait for the "Welcome to the Apple Developer Program" email (1–2 business days typically,
   longer if Apple asks for documents).
4. Find your **Team ID**: https://developer.apple.com/account → **Membership details** → *Team ID*, a
   10-character code like `A1B2C3D4E5` → secret `APPLE_TEAM_ID`.

### B3. Create the "Developer ID Application" certificate (free, 10 minutes, needs a Mac)

Only the **Account Holder** can create Developer ID certificates. Do this on a Mac you control, with the
company Apple ID.

**Easiest — Xcode** (free from the Mac App Store):
1. Xcode → **Settings → Accounts** → **+** → sign in with the company Apple ID → select the team.
2. **Manage Certificates…** → **+** (bottom left) → **Developer ID Application**. Done: the certificate and
   its private key are now in your login keychain.

**Alternative — the website:**
1. **Keychain Access** (in /Applications/Utilities) → menu **Keychain Access → Certificate Assistant → Request a
   Certificate From a Certificate Authority…** → your email, common name `Cooper Studios LLC`, **Saved to
   disk** → Continue → save `CertificateSigningRequest.certSigningRequest`.
2. https://developer.apple.com/account/resources/certificates/add → **Developer ID Application** → Continue →
   upload the request file → Continue → **Download** the `.cer` → double-click it (it lands in the login
   keychain, next to the private key created in step 1).

### B4. Export the certificate as a .p12 and turn it into `CSC_LINK`

1. **Keychain Access** → *login* keychain → category **My Certificates** → find **Developer ID Application:
   Cooper Studios LLC (TEAMID)** → click the small triangle to confirm a private key is listed underneath.
2. Right-click the certificate → **Export "Developer ID Application: …"** → file format **Personal
   Information Exchange (.p12)** → save as `inboxscout-developer-id.p12`. When asked, set a strong password
   (this is the secret `CSC_KEY_PASSWORD`), then enter your Mac login password to allow the export.
3. Turn the file into text for GitHub. In **Terminal** (Applications/Utilities):
   ```
   base64 -i ~/Desktop/inboxscout-developer-id.p12 | pbcopy
   ```
   The base64 text is now on the clipboard → paste it as the secret `CSC_LINK`.
4. Keep the `.p12` and its password somewhere safe *offline* (a password manager or an encrypted USB
   stick), then delete the copy on the Desktop. Anyone with this file can sign software as Cooper Studios
   LLC. The certificate is valid for **5 years**; when it nears expiry, repeat B3–B4.

### B5. Notarization credentials (free, 3 minutes)

1. https://account.apple.com → sign in with the company Apple ID → **Sign-In and Security → App-Specific
   Passwords → +** → name `inboxscout-notarize` → copy the generated `xxxx-xxxx-xxxx-xxxx` → secret
   `APPLE_APP_SPECIFIC_PASSWORD`.
2. The Apple ID's email address itself is the secret `APPLE_ID`.
3. The Team ID from B2 step 4 is the secret `APPLE_TEAM_ID`.

### B6. The five GitHub secrets

| Secret (exact name) | Value | Where it came from |
|---|---|---|
| `CSC_LINK` | the base64 text of the `.p12` | B4 step 3 |
| `CSC_KEY_PASSWORD` | the password you set when exporting the `.p12` | B4 step 2 |
| `APPLE_ID` | the company Apple ID email | B5 |
| `APPLE_APP_SPECIFIC_PASSWORD` | `xxxx-xxxx-xxxx-xxxx` | B5 step 1 |
| `APPLE_TEAM_ID` | 10-character Team ID | B2 step 4 |

`CSC_LINK` + `CSC_KEY_PASSWORD` turn **signing** on (the macOS job prints `signing: on`). The three `APPLE_*`
secrets turn **notarization** on (`notarization: on`); set all three or none — a partial set stops the job with
the missing names. Signing without notarizing is allowed but pointless (macOS still warns), so add all five in
one go. With none of them, the job prints `signing: off` and builds unsigned, as before.

Then cut a release and verify (section C). The first notarization can take 5–15 minutes inside the build
(Apple's queue); later ones are usually faster.

---

## C. Verifying a signed build, and what users will see

### Windows

- Download `InboxScout-Setup.exe` from the release → right-click → **Properties** → there is now a **Digital
  Signatures** tab listing **Cooper Studios LLC**, with a timestamp.
- Command line (any Windows PC with the Windows SDK, or a *Developer Command Prompt for VS*):
  `signtool verify /pa /v InboxScout-Setup.exe` → ends with `Successfully verified`. Without the SDK, in
  PowerShell: `Get-AuthenticodeSignature .\InboxScout-Setup.exe` → `Status: Valid`.
- Users: the installer's UAC prompt shows *Verified publisher: Cooper Studios LLC* right away. The blue
  SmartScreen "Windows protected your PC" box disappears once the certificate has earned reputation with
  Microsoft — with Trusted Signing that is usually quick (days to a few weeks of normal downloads), and the
  reputation carries over when the certificate rotates.

### macOS

- Install from the `.dmg`, then in Terminal:
  `spctl -a -vv /Applications/InboxScout.app` → `accepted` and `source=Notarized Developer ID`.
  `codesign -dv --verbose=4 /Applications/InboxScout.app` → `Authority=Developer ID Application: Cooper
  Studios LLC (TEAMID)` and `flags=0x10000(runtime)` (the hardened runtime).
  `xcrun stapler validate /Applications/InboxScout.app` → `The validate action worked!`
- Users: no more "InboxScout can't be opened because Apple could not verify it" / "is damaged". The first
  launch shows the ordinary "downloaded from the internet, open?" dialog with an **Open** button, and that's it.
  The app updates itself as before.

### Linux

Unchanged — AppImage and `.deb` are not signed; see `docs/LINUX.md`.

---

## D. For whoever maintains the pipeline

- **Windows.** `electron-builder.yml → win.signtoolOptions.sign: ./build/sign.js` is a custom electron-builder
  sign hook. electron-builder calls it for every executable it produces — the app exe, the elevate helper, the
  NSIS installer and the uninstaller inside it — during the build, *before* it computes the sha512 in
  `latest.yml`, so self-updates keep verifying. The hook runs
  `signtool sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json <file>`;
  the dlib authenticates with `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` from the environment,
  and `metadata.json` (endpoint, account, profile; no secrets) is written to a temp dir. The workflow's
  *Signing status (Windows)* step installs pinned NuGet packages `Microsoft.Trusted.Signing.Client` (the dlib;
  needs the .NET 8 runtime, present on GitHub's Windows images) and `Microsoft.Windows.SDK.BuildTools`
  (a `signtool.exe` new enough for `/dlib`), exports `AZURE_CODE_SIGNING_DLIB` / `SIGNTOOL_PATH`, and runs
  `node build/sign.js` as a pre-flight. To bump either package, change the two `-Version` values in the workflow
  (versions: https://www.nuget.org/packages/Microsoft.Trusted.Signing.Client and
  https://www.nuget.org/packages/Microsoft.Windows.SDK.BuildTools).
  `signingHashAlgorithms: [sha256]` because Trusted Signing certificates are SHA-256 only (electron-builder's
  default dual sha1+sha256 would call the hook twice).
  Why not electron-builder's built-in `win.azureSignOptions` (present since 25.1, marked beta)? Its presence in
  the YAML makes electron-builder validate the `AZURE_*` env and install a PowerShell module before every
  build, so it cannot sit in the config unconditionally; the hook can, and no-ops without secrets.
  Why not `azure/trusted-signing-action` after the build? It would sign `dist/*.exe` after `latest.yml` was
  hashed, breaking self-updates, and it cannot reach the uninstaller inside the installer.
- **macOS.** `mac.hardenedRuntime`, `gatekeeperAssess`, `entitlements`/`entitlementsInherit`
  (`build/entitlements.mac.plist`) and `notarize: true` are only consulted once electron-builder has found a
  signing identity; with none it logs *skipped macOS application code signing* and returns before reading any of
  them. `notarize: true` is itself gated by electron-builder on `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` +
  `APPLE_TEAM_ID` (absent → *skipped macOS notarization* warning; partially present → error, which the status
  step catches earlier with a clearer message). `CSC_IDENTITY_AUTO_DISCOVERY` is set to `true` by the status
  step only when `CSC_LINK` exists; otherwise the build step passes `false`, as it always has.
- **Secret scoping.** The job-level `env` hands each secret only to the OS that uses it
  (`startsWith(matrix.os, …)`); in particular `CSC_LINK` never reaches Windows, where electron-builder would
  otherwise try to use the Apple `.p12` as a Windows certificate. The Linux job receives empty strings and is
  otherwise untouched.
- **Follow-up once Windows signing is live.** electron-updater can verify that a downloaded update is signed by
  the same publisher (`win.publisherName` → `publisherName` in `app-update.yml`). It is deliberately *not* set
  yet: the value must match the certificate's subject exactly (`signtool verify /v /pa` shows it, e.g.
  `CN=Cooper Studios LLC`), and once set, an unsigned build would be rejected by already-installed signed
  copies. Set it after the first signed release has been checked.

---

## E. Later: Microsoft Store / Mac App Store (out of scope)

Both stores are a different distribution channel with their own signing (MSIX with a Store certificate; a
"Mac App Store" certificate plus the App Sandbox and a separate `mas` build), their own review process, and
one-time developer fees (Microsoft Store ~$19 individual / ~$99 company; the Mac App Store is covered by the
$99 Apple Developer Program). Neither replaces the Developer ID / Trusted Signing setup above — direct
downloads from inboxscout.ai will always need it. Revisit when there is demand for store installs.
