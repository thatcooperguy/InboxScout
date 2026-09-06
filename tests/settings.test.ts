import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { loadSettings, markLastRunAt, saveSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS } from '../src/shared/types'

/** v1.4 item 2: a run must never write back the settings object it loaded at start. */
describe('settings: lastRunAt lives outside the settings blob', () => {
  it('a preference changed during a run survives the run marking its finish time', () => {
    const db = openDatabase(':memory:')
    // The run loads settings at start…
    const atStart = loadSettings(db)
    // …the person changes a preference while it runs…
    saveSettings(db, { ...loadSettings(db), textSize: 'large', deliverEmailTo: 'me@example.com' })
    // …and the run records its finish without touching the settings blob.
    markLastRunAt(db, '2026-09-06T07:31:00.000Z')
    const after = loadSettings(db)
    expect(after.textSize).toBe('large')
    expect(after.deliverEmailTo).toBe('me@example.com')
    expect(after.lastRunAt).toBe('2026-09-06T07:31:00.000Z')
    expect(atStart.lastRunAt).toBeNull()
  })

  it('a stale settings object saved later cannot roll lastRunAt back', () => {
    const db = openDatabase(':memory:')
    const stale = { ...DEFAULT_SETTINGS, lastRunAt: '2026-01-01T00:00:00.000Z' }
    markLastRunAt(db, '2026-09-06T07:31:00.000Z')
    saveSettings(db, stale)
    expect(loadSettings(db).lastRunAt).toBe('2026-09-06T07:31:00.000Z')
  })

  it('still reads lastRunAt from an older database that kept it inside the settings JSON', () => {
    const db = openDatabase(':memory:')
    repo.setMeta(db, 'settings', JSON.stringify({ ...DEFAULT_SETTINGS, lastRunAt: '2026-08-30T07:30:00.000Z' }))
    expect(loadSettings(db).lastRunAt).toBe('2026-08-30T07:30:00.000Z')
    expect(loadSettings(db).schedule).toEqual(DEFAULT_SETTINGS.schedule)
  })
})
