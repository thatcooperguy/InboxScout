/**
 * What attachment bytes the fetchers bother to download and hand on (v1.5 "Reads attachments and photos").
 * Shared by the IMAP, Gmail, and Graph paths so the caps live in exactly one place.
 */

/** Largest single file we download. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024
/** Most attachment bytes kept for one message. */
export const MESSAGE_BUDGET_BYTES = 60 * 1024 * 1024
/** Most attachment bytes kept across one sync run (all accounts and folders of that run). */
export const SYNC_BUDGET_BYTES = 250 * 1024 * 1024
/** Inline images smaller than this are logos, signatures, and tracking pixels — never worth reading. */
export const INLINE_IMAGE_MIN_BYTES = 20 * 1024

export interface AttachmentMeta {
  filename: string
  contentType: string
  size: number
  inline?: boolean
}

const IMAGE_RE = /^image\//i
const SKIP_TYPES = new Set([
  'application/pgp-signature',
  'application/pkcs7-signature',
  'application/x-pkcs7-signature',
  'application/pgp-keys',
  'text/calendar',
  'application/ics',
  'message/delivery-status',
  'message/disposition-notification'
])
const SKIP_EXT = /\.(p7s|asc|sig|ics|vcf)$/i

/** Normalised lower-case media type without parameters. */
export function mediaType(contentType: string | null | undefined): string {
  return String(contentType ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
}

/**
 * Is this attachment worth downloading? Pure: no budgets here, only the per-file rules —
 * size cap, empty files, signature/calendar noise, and small inline images.
 */
export function shouldKeep(meta: AttachmentMeta): boolean {
  const size = Number(meta.size)
  if (!Number.isFinite(size) || size <= 0) return false
  if (size > FILE_MAX_BYTES) return false
  const type = mediaType(meta.contentType)
  if (SKIP_TYPES.has(type)) return false
  if (SKIP_EXT.test(meta.filename ?? '')) return false
  if (meta.inline && IMAGE_RE.test(type) && size < INLINE_IMAGE_MIN_BYTES) return false
  return true
}

function bytes(n: number): number {
  return Math.max(0, Number(n) || 0)
}

/**
 * Tracks attachment bytes across one sync so the fetchers know when to stop.
 * Call `forMessage()` once per message (safe with concurrent workers — each message counts its own
 * bytes; only the sync total is shared), then `take(size)` before each download: true means go ahead
 * and the bytes are now counted, false means skip this one. `exhausted` says the whole sync is done.
 */
export class SyncBudget {
  private syncUsed = 0

  constructor(
    readonly syncLimit: number = SYNC_BUDGET_BYTES,
    readonly messageLimit: number = MESSAGE_BUDGET_BYTES
  ) {}

  /** True when no more attachment bytes fit in this sync. */
  get exhausted(): boolean {
    return this.syncUsed >= this.syncLimit
  }

  /** Bytes counted so far across the sync. */
  get usedBytes(): number {
    return this.syncUsed
  }

  /** A per-message budget that draws on this sync's total. */
  forMessage(): MessageBudget {
    return new MessageBudget(this)
  }

  /** Would `size` more bytes fit in the sync? Does not count them. */
  fits(size: number): boolean {
    return this.syncUsed + bytes(size) <= this.syncLimit
  }

  /** @internal Reserve sync-level bytes; returns whether they fit. */
  reserve(size: number): boolean {
    if (!this.fits(size)) return false
    this.syncUsed += bytes(size)
    return true
  }

  /** @internal Move the sync total by `delta` (may be negative). */
  shift(delta: number): void {
    this.syncUsed = Math.max(0, this.syncUsed + (Number(delta) || 0))
  }
}

/** The per-message side of a `SyncBudget`. */
export class MessageBudget {
  private used = 0

  constructor(private readonly sync: SyncBudget) {}

  /** True when nothing more fits in this message or in the sync. */
  get exhausted(): boolean {
    return this.used >= this.sync.messageLimit || this.sync.exhausted
  }

  /** Bytes counted for this message. */
  get usedBytes(): number {
    return this.used
  }

  /** Would `size` more bytes fit in both this message and the sync? Does not count them. */
  fits(size: number): boolean {
    return this.used + bytes(size) <= this.sync.messageLimit && this.sync.fits(size)
  }

  /** Reserve `size` bytes if they fit; returns whether they did. */
  take(size: number): boolean {
    if (this.used + bytes(size) > this.sync.messageLimit) return false
    if (!this.sync.reserve(size)) return false
    this.used += bytes(size)
    return true
  }

  /** Correct a reservation once the real byte count is known (a provider's `size` can be an estimate). */
  adjust(reserved: number, actual: number): void {
    const delta = bytes(actual) - bytes(reserved)
    this.used = Math.max(0, this.used + delta)
    this.sync.shift(delta)
  }
}
