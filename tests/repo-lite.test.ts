import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import type { Classification, MessageRecord } from '../src/shared/types'

/** v1.4 items 6–8: lighter per-run reads, one query per 500 ids, and the date index. */

function msg(i: number, overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: `m${i}`,
    accountId: 'acc',
    folder: 'INBOX',
    uid: i,
    messageId: `<m${i}@x>`,
    threadKey: `t${i % 50}`,
    fromAddress: `p${i % 20}@example.com`,
    fromName: `Person ${i % 20}`,
    toAddresses: 'me@example.com',
    subject: `Subject ${i}`,
    date: new Date(Date.now() - i * 3600000).toISOString(),
    snippet: 'snip',
    bodyText: 'x'.repeat(5000),
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...overrides
  }
}

function cls(id: string, category: Classification['category']): Classification {
  return { messageId: id, category, importance: 1, screening: 'fyi', isActionable: false, actionSummary: null, deadline: null, topics: [], projectHint: null, people: [], sensitivity: [], runId: 'r', model: 'm', corrected: false }
}

describe('messagesSinceLite', () => {
  it('returns the same rows, order, and window as messagesSince — with clipped or empty bodies', () => {
    const db = openDatabase(':memory:')
    for (let i = 0; i < 30; i++) repo.insertMessage(db, msg(i, { date: new Date(Date.now() - i * 86400000 * 2).toISOString() }))
    const full = repo.messagesSince(db, 30)
    const clipped = repo.messagesSinceLite(db, 30, 4000, 2000)
    const none = repo.messagesSinceLite(db, 30, 4000, 0)
    expect(clipped.map((m) => m.id)).toEqual(full.map((m) => m.id))
    expect(none.map((m) => m.id)).toEqual(full.map((m) => m.id))
    expect(full[0].bodyText).toHaveLength(5000)
    expect(clipped[0].bodyText).toHaveLength(2000)
    expect(clipped[0].bodyText).toBe(full[0].bodyText.slice(0, 2000))
    expect(none[0].bodyText).toBe('')
    // Every other column still comes through.
    expect({ ...none[3], bodyText: full[3].bodyText }).toEqual(full[3])
  })

  it('honours the row cap', () => {
    const db = openDatabase(':memory:')
    for (let i = 0; i < 10; i++) repo.insertMessage(db, msg(i))
    expect(repo.messagesSinceLite(db, 30, 4)).toHaveLength(4)
  })
})

describe('categoryMap', () => {
  it('returns one category per classified id and nothing for the rest, across more than one chunk', () => {
    const db = openDatabase(':memory:')
    const ids: string[] = []
    for (let i = 0; i < 1203; i++) {
      repo.insertMessage(db, msg(i))
      ids.push(`m${i}`)
      if (i % 3 === 0) repo.upsertClassification(db, cls(`m${i}`, i % 2 === 0 ? 'work' : 'personal'))
    }
    const map = repo.categoryMap(db, [...ids, 'm0', 'nope'])
    expect(map.size).toBe(401)
    expect(map.get('m0')).toBe('work')
    expect(map.get('m3')).toBe('personal')
    expect(map.get('m1')).toBeUndefined()
    expect(map.has('nope')).toBe(false)
    // Same answers as the one-query-per-message path it replaces.
    for (const id of ['m0', 'm3', 'm6', 'm1200', 'm1']) {
      expect(map.get(id)).toBe(repo.getClassifications(db, [id])[0]?.category)
    }
    expect(repo.categoryMap(db, []).size).toBe(0)
  })
})

describe('indexes (item 8)', () => {
  it('creates the date and deadline indexes and the planner uses them for recent windows', () => {
    const db = openDatabase(':memory:')
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as { name: string }[]).map((r) => r.name)
    expect(names).toContain('idx_messages_date')
    expect(names).toContain('idx_classifications_deadline')
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT id FROM messages WHERE date >= ? ORDER BY date DESC LIMIT 10').all('2026-01-01') as { detail: string }[]
    expect(plan.some((p) => /idx_messages_date/.test(p.detail))).toBe(true)
  })
})
