// Offline text reader for photos and screenshots: tesseract.js (WebAssembly) with the English data bundled from
// @tesseract.js-data/eng. Nothing is downloaded — worker script, WASM core, and language data are resolved from
// node_modules on disk (inside the app folder when packaged), and the unpacked language file is cached under userData.
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILE_MAX_BYTES, type LogFn } from './types'

export interface OcrPaths {
  workerPath: string
  corePath: string
  langPath: string
  cachePath: string
}

const LANG = 'eng'
const WORKER_REL = join('tesseract.js', 'src', 'worker-script', 'node', 'index.js')
const CORE_REL = 'tesseract.js-core'
const LANG_REL = join('@tesseract.js-data', 'eng', '4.0.0')
const CACHE_DIR = 'ocr-cache'
/** One recognition never runs longer than this (the extraction time budget is the outer bound). */
export const OCR_TIMEOUT_MS = 60_000

// ---- Where things are ----

/** This module's directory, whether bundled to CJS (electron-vite) or run as ESM (vitest). */
function hereDir(): string | null {
  try {
    if (typeof __dirname === 'string') return __dirname
  } catch {
    // not CJS
  }
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch {
    return null
  }
}

/** Electron's `app`, when we are running inside Electron; null in tests and plain node. */
function electronApp(): { getAppPath(): string; getPath(name: string): string } | null {
  try {
    const base = hereDir() ?? process.cwd()
    const req = createRequire(join(base, 'noop.js'))
    const mod = req('electron')
    const app = mod && typeof mod === 'object' ? (mod as any).app : null
    return app && typeof app.getAppPath === 'function' && typeof app.getPath === 'function' ? app : null
  } catch {
    return null
  }
}

/** Folders that may contain node_modules: the app folder (and its asar-unpacked twin), cwd, and every parent of this file. */
function candidateRoots(): string[] {
  const roots: string[] = []
  const push = (p: string | null | undefined): void => {
    if (p && !roots.includes(p)) roots.push(p)
  }
  const app = electronApp()
  if (app) {
    try {
      const appPath = app.getAppPath()
      push(appPath)
      if (appPath.includes('app.asar')) push(appPath.replace('app.asar', 'app.asar.unpacked'))
    } catch {
      // ignore
    }
  }
  push(process.cwd())
  let dir = hereDir()
  for (let i = 0; dir && i < 8; i++) {
    push(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return roots
}

/** The first node_modules that holds tesseract.js, its core, and the English data. */
function findNodeModules(): string | null {
  for (const root of candidateRoots()) {
    const nm = join(root, 'node_modules')
    if (existsSync(join(nm, WORKER_REL)) && existsSync(join(nm, CORE_REL)) && existsSync(join(nm, LANG_REL, `${LANG}.traineddata.gz`))) return nm
  }
  return null
}

function defaultCachePath(): string {
  const app = electronApp()
  if (app) {
    try {
      return join(app.getPath('userData'), CACHE_DIR)
    } catch {
      // fall through
    }
  }
  return join(tmpdir(), 'inboxscout', CACHE_DIR)
}

let cachedPaths: OcrPaths | null | undefined

/** Resolved once; null when the offline reader is not installed (its packages are missing). */
export function resolveOcrPaths(cachePath?: string): OcrPaths | null {
  if (cachedPaths === undefined) {
    const nm = findNodeModules()
    cachedPaths = nm
      ? { workerPath: join(nm, WORKER_REL), corePath: join(nm, CORE_REL), langPath: join(nm, LANG_REL), cachePath: defaultCachePath() }
      : null
  }
  if (!cachedPaths) return null
  return cachePath ? { ...cachedPaths, cachePath } : cachedPaths
}

export function ocrAvailable(): boolean {
  return resolveOcrPaths() !== null
}

// ---- The worker (one, created on first use) ----

interface TesseractWorker {
  recognize(image: Buffer, options?: unknown, output?: unknown): Promise<{ data: { text: string; confidence: number } }>
  terminate(): Promise<unknown>
}

let workerPromise: Promise<TesseractWorker> | null = null
let workerCachePath: string | null = null

async function getWorker(paths: OcrPaths, log?: LogFn): Promise<TesseractWorker> {
  if (workerPromise && workerCachePath === paths.cachePath) return workerPromise
  if (workerPromise) await shutdownOcr()
  workerCachePath = paths.cachePath
  workerPromise = (async () => {
    try {
      mkdirSync(paths.cachePath, { recursive: true })
    } catch {
      // The worker falls back to reading the gz directly when it cannot write the cache.
    }
    const req = createRequire(join(paths.corePath, '..', 'noop.js'))
    const tesseract = req('tesseract.js') as {
      createWorker: (langs: string, oem: number, options: Record<string, unknown>) => Promise<TesseractWorker>
      OEM: { LSTM_ONLY: number }
    }
    const started = Date.now()
    const worker = await tesseract.createWorker(LANG, tesseract.OEM.LSTM_ONLY, {
      workerPath: paths.workerPath,
      corePath: paths.corePath,
      langPath: paths.langPath,
      cachePath: paths.cachePath,
      gzip: true,
      workerBlobURL: false,
      logger: () => {},
      errorHandler: (err: unknown) => log?.('warn', 'attachments', `Offline text reader reported a problem: ${plain(err)}`)
    })
    log?.('info', 'attachments', `Offline text reader ready in ${Date.now() - started} ms`)
    return worker
  })()
  workerPromise.catch(() => {
    workerPromise = null
  })
  return workerPromise
}

/** Stop the worker thread (tests do this so the process can exit; the app just quits). */
export async function shutdownOcr(): Promise<void> {
  const p = workerPromise
  workerPromise = null
  workerCachePath = null
  if (!p) return
  try {
    const w = await p
    await w.terminate()
  } catch {
    // Already gone.
  }
}

function plain(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return String(msg ?? 'unknown error').split('\n')[0].slice(0, 200)
}

/**
 * Text in an image (PNG, JPEG, WebP, GIF, BMP). Throws a plain-words error when the reader is not installed,
 * the image is too large, or recognition fails or times out. Bytes go straight to tesseract — no resizing.
 */
export async function ocrImage(bytes: Uint8Array, opts: { cachePath?: string; log?: LogFn; timeoutMs?: number } = {}): Promise<string> {
  if (bytes.byteLength > FILE_MAX_BYTES) throw new Error('Image is too large to read (over 10 MB)')
  if (bytes.byteLength === 0) throw new Error('Image is empty')
  const paths = resolveOcrPaths(opts.cachePath)
  if (!paths) throw new Error('Offline text reader is not installed')
  let worker: TesseractWorker
  try {
    worker = await getWorker(paths, opts.log)
  } catch (err) {
    throw new Error(`Offline text reader could not start: ${plain(err)}`)
  }
  const timeoutMs = opts.timeoutMs ?? OCR_TIMEOUT_MS
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Reading the image took longer than ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)
  })
  try {
    const result = await Promise.race([worker.recognize(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)), timeout])
    return String(result.data?.text ?? '').replace(/\r\n/g, '\n').trim()
  } catch (err) {
    throw new Error(`Could not read the image: ${plain(err)}`)
  } finally {
    if (timer) clearTimeout(timer)
  }
}
