'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder loads this hook with require(); it must stay CommonJS. */

/**
 * electron-builder Windows sign hook: Azure Trusted Signing.
 *
 * Wired in electron-builder.yml as `win.signtoolOptions.sign: ./build/sign.js`. electron-builder calls
 * `sign(configuration)` for every Windows executable it produces — the app exe, the NSIS installer and the
 * uninstaller inside it (plus the elevate helper) — *before* it hashes the installer into latest.yml, so
 * self-updates keep verifying. Owner setup: docs/SIGNING.md.
 *
 * Behaviour:
 *   - none of the AZURE_* variables set  → no-op; the build stays unsigned, exactly as without this file.
 *   - all six set                        → `signtool sign … /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json`.
 *     The dlib authenticates with AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET from the environment
 *     (Azure's EnvironmentCredential), so no secret is ever written to disk or passed on a command line.
 *   - some but not all set               → throws with the missing names, so a half-configured pipeline fails
 *     loudly instead of quietly shipping unsigned installers.
 *
 * `node build/sign.js` prints the same on/off decision (and checks the toolchain when on) without signing
 * anything; the release workflow runs it as its "signing: on/off" step.
 */

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/** Repository secrets that switch Windows signing on (docs/SIGNING.md lists where each one comes from). */
const REQUIRED_ENV = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_ENDPOINT',
  'AZURE_CODE_SIGNING_ACCOUNT_NAME',
  'AZURE_CERTIFICATE_PROFILE_NAME',
]

/** Microsoft's RFC 3161 timestamp service for Trusted Signing (keeps signatures valid after the short-lived cert rotates). */
const TIMESTAMP_URL = 'http://timestamp.acs.microsoft.com'

/** Oldest Windows SDK signtool that understands /dlib (Trusted Signing's requirement). */
const MIN_SIGNTOOL_BUILD = 22621

const DLIB_NAME = 'Azure.CodeSigning.Dlib.dll'

function isSet(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/** @returns {{ mode: 'off' | 'on' | 'partial', missing: string[] }} */
function signingStatus(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !isSet(env[name]))
  if (missing.length === REQUIRED_ENV.length) return { mode: 'off', missing }
  if (missing.length === 0) return { mode: 'on', missing }
  return { mode: 'partial', missing }
}

function existsFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** Depth-limited search for a file name; returns the first match under `root`, preferring paths containing `prefer`. */
function findFile(root, fileName, prefer, depth = 6) {
  if (!root || depth < 0) return null
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return null
  }
  let fallback = null
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      if (!prefer || full.toLowerCase().includes(prefer.toLowerCase())) return full
      fallback = fallback || full
    } else if (entry.isDirectory()) {
      const found = findFile(full, fileName, prefer, depth - 1)
      if (found) {
        if (!prefer || found.toLowerCase().includes(prefer.toLowerCase())) return found
        fallback = fallback || found
      }
    }
  }
  return fallback
}

/** Numeric compare of "10.0.26100.0"-style folder names, newest first. */
function byVersionDesc(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * signtool.exe: SIGNTOOL_PATH (set by the workflow after it installs Microsoft.Windows.SDK.BuildTools),
 * else the newest Windows 10/11 SDK on the machine that is recent enough for /dlib.
 */
function findSigntool(env = process.env) {
  if (isSet(env.SIGNTOOL_PATH)) {
    if (!existsFile(env.SIGNTOOL_PATH)) throw new Error(`SIGNTOOL_PATH points at a missing file: ${env.SIGNTOOL_PATH}`)
    return env.SIGNTOOL_PATH
  }
  const kitsBin = path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin')
  let versions = []
  try {
    versions = fs.readdirSync(kitsBin).filter((name) => /^10\.0\.\d+\.\d+$/.test(name))
  } catch {
    // no Windows SDK installed
  }
  for (const version of versions.sort(byVersionDesc)) {
    const build = Number(version.split('.')[2])
    const candidate = path.join(kitsBin, version, 'x64', 'signtool.exe')
    if (build >= MIN_SIGNTOOL_BUILD && existsFile(candidate)) return candidate
  }
  throw new Error(
    `Cannot find a signtool.exe from Windows SDK 10.0.${MIN_SIGNTOOL_BUILD} or newer (looked in ${kitsBin}). ` +
      'Set SIGNTOOL_PATH, or let the release workflow install Microsoft.Windows.SDK.BuildTools (docs/SIGNING.md).'
  )
}

/**
 * The Trusted Signing client library: AZURE_CODE_SIGNING_DLIB (set by the workflow), else wherever the
 * Microsoft.Trusted.Signing.Client NuGet package was unpacked (workflow temp dir or the NuGet cache).
 */
function findDlib(env = process.env) {
  if (isSet(env.AZURE_CODE_SIGNING_DLIB)) {
    if (!existsFile(env.AZURE_CODE_SIGNING_DLIB)) throw new Error(`AZURE_CODE_SIGNING_DLIB points at a missing file: ${env.AZURE_CODE_SIGNING_DLIB}`)
    return env.AZURE_CODE_SIGNING_DLIB
  }
  const roots = [
    env.RUNNER_TEMP && path.join(env.RUNNER_TEMP, 'trusted-signing'),
    env.NUGET_PACKAGES,
    env.USERPROFILE && path.join(env.USERPROFILE, '.nuget', 'packages', 'microsoft.trusted.signing.client'),
  ].filter(Boolean)
  for (const root of roots) {
    const found = findFile(root, DLIB_NAME, path.join('bin', 'x64'))
    if (found) return found
  }
  throw new Error(
    `Cannot find ${DLIB_NAME}. Install the Microsoft.Trusted.Signing.Client NuGet package and set AZURE_CODE_SIGNING_DLIB ` +
      'to its bin\\x64\\Azure.CodeSigning.Dlib.dll (the release workflow does this; see docs/SIGNING.md).'
  )
}

/** The non-secret metadata file signtool hands to the dlib (/dmdf). Written once per process. */
let metadataPath = null
function writeMetadata(env = process.env) {
  if (metadataPath) return metadataPath
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inboxscout-trusted-signing-'))
  metadataPath = path.join(dir, 'metadata.json')
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        Endpoint: env.AZURE_ENDPOINT.trim(),
        CodeSigningAccountName: env.AZURE_CODE_SIGNING_ACCOUNT_NAME.trim(),
        CertificateProfileName: env.AZURE_CERTIFICATE_PROFILE_NAME.trim(),
      },
      null,
      2
    )
  )
  return metadataPath
}

function run(file, args, env) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${path.basename(file)} ${args[0]} failed (${error.code ?? error.message})\n${stdout}\n${stderr}`))
      } else {
        resolve(`${stdout}${stderr}`)
      }
    })
  })
}

let announced = false
function announce(message) {
  if (announced) return
  announced = true
  console.log(`  • windows signing: ${message}`)
}

/**
 * electron-builder's CustomWindowsSign hook.
 * @param {{ path: string, hash?: string, isNest?: boolean }} configuration
 */
async function sign(configuration) {
  const status = signingStatus()
  if (status.mode === 'off') {
    announce('off (no AZURE_* secrets) — leaving executables unsigned, as before')
    return
  }
  if (status.mode === 'partial') {
    throw new Error(
      `Azure Trusted Signing is half-configured; missing: ${status.missing.join(', ')}. ` +
        'Set all six repository secrets or none of them (docs/SIGNING.md).'
    )
  }
  if (process.platform !== 'win32') {
    throw new Error('Azure Trusted Signing can only run on a Windows machine (signtool.exe); build Windows installers on Windows.')
  }
  // Trusted Signing certificates are SHA-256 only. electron-builder.yml pins signingHashAlgorithms to sha256
  // so this hook runs once per file; the guards keep a dual-signing config from producing a bad second pass.
  if (configuration.isNest) return
  if (configuration.hash && configuration.hash.toLowerCase() !== 'sha256') return

  const signtool = findSigntool()
  const dlib = findDlib()
  const metadata = writeMetadata()
  announce(`on (Azure Trusted Signing via ${path.basename(signtool)} + ${path.basename(dlib)})`)
  console.log(`  • signing ${path.basename(configuration.path)}`)
  const args = [
    'sign',
    '/v',
    '/fd', 'SHA256',
    '/tr', TIMESTAMP_URL,
    '/td', 'SHA256',
    '/dlib', dlib,
    '/dmdf', metadata,
    configuration.path,
  ]
  await run(signtool, args, process.env)
}

module.exports = sign
module.exports.sign = sign
module.exports.signingStatus = signingStatus
module.exports.REQUIRED_ENV = REQUIRED_ENV

if (require.main === module) {
  const status = signingStatus()
  if (status.mode === 'off') {
    console.log('signing: off (no AZURE_* secrets set) — Windows builds will be unsigned')
    process.exit(0)
  }
  if (status.mode === 'partial') {
    console.error(`signing: MISCONFIGURED — missing ${status.missing.join(', ')} (set all six secrets or none; see docs/SIGNING.md)`)
    process.exit(1)
  }
  if (process.platform !== 'win32') {
    console.error('signing: on, but this is not Windows — Azure Trusted Signing only runs on Windows runners')
    process.exit(1)
  }
  try {
    const signtool = findSigntool()
    const dlib = findDlib()
    console.log('signing: on (Azure Trusted Signing)')
    console.log(`  signtool: ${signtool}`)
    console.log(`  dlib:     ${dlib}`)
    console.log(`  account:  ${process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME} / profile: ${process.env.AZURE_CERTIFICATE_PROFILE_NAME}`)
  } catch (error) {
    console.error(`signing: on, but the toolchain is missing — ${error.message}`)
    process.exit(1)
  }
}
