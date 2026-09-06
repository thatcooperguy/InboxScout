import { describe, expect, it } from 'vitest'
import {
  FILE_MAX_BYTES,
  INLINE_IMAGE_MIN_BYTES,
  MESSAGE_BUDGET_BYTES,
  SYNC_BUDGET_BYTES,
  SyncBudget,
  mediaType,
  shouldKeep
} from '../src/main/mail/attachmentsPolicy'

describe('attachment policy constants', () => {
  it('match the contract caps', () => {
    expect(FILE_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(MESSAGE_BUDGET_BYTES).toBe(60 * 1024 * 1024)
    expect(SYNC_BUDGET_BYTES).toBe(250 * 1024 * 1024)
    expect(INLINE_IMAGE_MIN_BYTES).toBe(20 * 1024)
  })
})

describe('shouldKeep', () => {
  it('keeps ordinary documents and images', () => {
    expect(shouldKeep({ filename: 'invoice.pdf', contentType: 'application/pdf', size: 120_000 })).toBe(true)
    expect(shouldKeep({ filename: 'photo.jpg', contentType: 'image/jpeg; name="photo.jpg"', size: 2_000_000 })).toBe(true)
    expect(shouldKeep({ filename: 'notes.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 40_000 })).toBe(true)
  })

  it('drops files over 10 MB and empty files', () => {
    expect(shouldKeep({ filename: 'big.zip', contentType: 'application/zip', size: FILE_MAX_BYTES + 1 })).toBe(false)
    expect(shouldKeep({ filename: 'edge.pdf', contentType: 'application/pdf', size: FILE_MAX_BYTES })).toBe(true)
    expect(shouldKeep({ filename: 'empty.pdf', contentType: 'application/pdf', size: 0 })).toBe(false)
    expect(shouldKeep({ filename: 'nan.pdf', contentType: 'application/pdf', size: Number.NaN })).toBe(false)
  })

  it('drops small inline images (logos, signatures, pixels) but keeps large inline images and small attached ones', () => {
    expect(shouldKeep({ filename: 'logo.png', contentType: 'image/png', size: 4_000, inline: true })).toBe(false)
    expect(shouldKeep({ filename: 'logo.png', contentType: 'image/png', size: INLINE_IMAGE_MIN_BYTES - 1, inline: true })).toBe(false)
    expect(shouldKeep({ filename: 'scan.png', contentType: 'image/png', size: INLINE_IMAGE_MIN_BYTES, inline: true })).toBe(true)
    expect(shouldKeep({ filename: 'photo.jpg', contentType: 'image/jpeg', size: 300_000, inline: true })).toBe(true)
    // Small but attached (not inline) images stay: a tiny screenshot is still worth reading.
    expect(shouldKeep({ filename: 'shot.png', contentType: 'image/png', size: 4_000, inline: false })).toBe(true)
    // Inline non-images are unaffected by the image rule.
    expect(shouldKeep({ filename: 'form.pdf', contentType: 'application/pdf', size: 4_000, inline: true })).toBe(true)
  })

  it('drops signatures, keys, and calendar parts', () => {
    expect(shouldKeep({ filename: 'smime.p7s', contentType: 'application/pkcs7-signature', size: 3_000 })).toBe(false)
    expect(shouldKeep({ filename: 'signature.asc', contentType: 'application/pgp-signature', size: 800 })).toBe(false)
    expect(shouldKeep({ filename: 'invite.ics', contentType: 'text/calendar', size: 2_000 })).toBe(false)
    expect(shouldKeep({ filename: 'invite.ics', contentType: 'application/octet-stream', size: 2_000 })).toBe(false)
  })
})

describe('mediaType', () => {
  it('normalises the media type and drops parameters', () => {
    expect(mediaType('Image/PNG; name="x.png"')).toBe('image/png')
    expect(mediaType(undefined)).toBe('')
  })
})

describe('SyncBudget', () => {
  it('caps bytes per message and per sync, and says when to stop', () => {
    const sync = new SyncBudget(1000, 400)
    const a = sync.forMessage()
    expect(a.take(300)).toBe(true)
    expect(a.take(150)).toBe(false) // would exceed the 400 per-message cap
    expect(a.take(100)).toBe(true)
    expect(a.exhausted).toBe(true)
    expect(a.usedBytes).toBe(400)
    expect(sync.usedBytes).toBe(400)

    const b = sync.forMessage()
    expect(b.exhausted).toBe(false) // a fresh message gets its own cap
    expect(b.take(400)).toBe(true)
    const c = sync.forMessage()
    expect(c.take(300)).toBe(false) // only 200 left in the sync
    expect(c.take(200)).toBe(true)
    expect(sync.exhausted).toBe(true)
    expect(sync.forMessage().exhausted).toBe(true)
    expect(sync.forMessage().take(1)).toBe(false)
  })

  it('per-message budgets are independent so concurrent workers do not reset each other', () => {
    const sync = new SyncBudget(10_000, 500)
    const a = sync.forMessage()
    const b = sync.forMessage()
    expect(a.take(400)).toBe(true)
    expect(b.take(400)).toBe(true)
    expect(a.take(200)).toBe(false)
    expect(b.take(100)).toBe(true)
    expect(sync.usedBytes).toBe(900)
  })

  it('adjusts a reservation once the real size is known', () => {
    const sync = new SyncBudget(1000, 1000)
    const m = sync.forMessage()
    expect(m.take(100)).toBe(true)
    m.adjust(100, 250)
    expect(m.usedBytes).toBe(250)
    expect(sync.usedBytes).toBe(250)
    m.adjust(250, 50)
    expect(sync.usedBytes).toBe(50)
    expect(m.fits(950)).toBe(true)
    expect(m.fits(951)).toBe(false)
  })

  it('treats bad sizes as zero and uses the contract caps by default', () => {
    const sync = new SyncBudget()
    expect(sync.syncLimit).toBe(SYNC_BUDGET_BYTES)
    expect(sync.messageLimit).toBe(MESSAGE_BUDGET_BYTES)
    const m = sync.forMessage()
    expect(m.take(Number.NaN)).toBe(true)
    expect(m.take(-5)).toBe(true)
    expect(sync.usedBytes).toBe(0)
  })
})
