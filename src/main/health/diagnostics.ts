import { app, shell } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { release } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Self-debugging: a small local log the person can copy into a support message
 * or reveal in their file manager. Plain text, one line per event, capped at
 * 1 MB with one rotated backup (diagnostics.log.1). Never leaves the computer.
 */

export type LogLevel = 'info' | 'warn' | 'error'

const MAX_BYTES = 1024 * 1024
const FILE = 'diagnostics.log'

export function diagnosticsPath(): string {
  return join(app.getPath('userData'), FILE)
}

function serializeExtra(extra: unknown): string {
  if (extra === undefined || extra === null) return ''
  if (extra instanceof Error) return ` ${JSON.stringify({ message: extra.message, stack: (extra.stack ?? '').split('\n').slice(0, 6).join(' | ') })}`
  try {
    const text = typeof extra === 'string' ? extra : JSON.stringify(extra)
    return ` ${text.length > 2000 ? `${text.slice(0, 2000)}…` : text}`
  } catch {
    return ` ${String(extra)}`
  }
}

function rotateIfNeeded(path: string): void {
  try {
    if (!existsSync(path) || statSync(path).size < MAX_BYTES) return
    const backup = `${path}.1`
    if (existsSync(backup)) unlinkSync(backup)
    renameSync(path, backup)
  } catch {
    // Logging must never break the app.
  }
}

/** Append one line: `2026-09-06T07:30:00.000Z [error] pipeline: message {...}`. Never throws. */
export function log(level: LogLevel, area: string, message: string, extra?: unknown): void {
  try {
    const path = diagnosticsPath()
    mkdirSync(dirname(path), { recursive: true })
    rotateIfNeeded(path)
    appendFileSync(path, `${new Date().toISOString()} [${level}] ${area}: ${message}${serializeExtra(extra)}\n`, 'utf8')
  } catch {
    // ignore — a log that cannot be written is not worth a crash
  }
}

/** Version banner plus the last `lines` lines of the log, ready to paste into a support message. */
export function readTail(lines = 200): string {
  const header = [
    `InboxScout ${safe(() => app.getVersion())}`,
    `Platform: ${process.platform} ${process.arch} (${safe(() => release())})`,
    `Electron ${process.versions.electron ?? '?'} · Node ${process.versions.node} · Chrome ${process.versions.chrome ?? '?'}`,
    `Log: ${safe(() => diagnosticsPath())}`,
    ''
  ].join('\n')
  let body = ''
  try {
    const path = diagnosticsPath()
    const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
    let all = current.split('\n').filter(Boolean)
    if (all.length < lines && existsSync(`${path}.1`)) {
      const older = readFileSync(`${path}.1`, 'utf8').split('\n').filter(Boolean)
      all = [...older, ...all]
    }
    body = all.slice(-lines).join('\n')
  } catch (err) {
    body = `(could not read the log: ${String((err as Error)?.message ?? err)})`
  }
  return `${header}${body || '(no diagnostics recorded yet)'}\n`
}

/** Reveal the log file in Finder / Explorer / the file manager. */
export function openInFolder(): boolean {
  try {
    const path = diagnosticsPath()
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true })
      appendFileSync(path, `${new Date().toISOString()} [info] diagnostics: log created\n`, 'utf8')
    }
    shell.showItemInFolder(path)
    return true
  } catch {
    return false
  }
}

function safe(fn: () => string): string {
  try {
    return fn()
  } catch {
    return '?'
  }
}
