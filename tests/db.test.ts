import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import type { Classification, MessageRecord } from '../src/shared/types'

function makeMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 'msg-1',
    accountId: 'acc-1',
    folder: 'INBOX',
    uid: 100,
    messageId: '<abc@example.com>',
    threadKey: 'thread-1',
    fromAddress: 'jane@acme.com',
    fromName: 'Jane Doe',
    toAddresses: 'me@example.com',
    subject: 'Contract renewal for Acme',
    date: '2026-09-05T10:00:00.000Z',
    snippet: 'Please sign the attached contract before Monday.',
    bodyText: 'Please sign the attached contract before Monday. Thanks, Jane.',
    fromMe: false,
    ...overrides
  }
}

describe('database', () => {
  it('deduplicates messages on (account, folder, uid)', () => {
    const db = openDatabase(':memory:')
    expect(repo.insertMessage(db, makeMessage())).toBe(true)
    expect(repo.insertMessage(db, makeMessage({ id: 'msg-other' }))).toBe(false)
  })

  it('round-trips classifications with JSON fields', () => {
    const db = openDatabase(':memory:')
    repo.insertMessage(db, makeMessage())
    const c: Classification = {
      messageId: 'msg-1',
      category: 'work',
      importance: 3,
      screening: 'needs_reply',
      isActionable: true,
      actionSummary: 'Sign the contract',
      deadline: '2026-09-08',
      topics: ['contract', 'acme'],
      projectHint: 'Acme renewal',
      people: ['Jane Doe'],
      sensitivity: ['company_confidential'],
      runId: 'run-1',
      model: 'test-model',
      corrected: false
    }
    repo.upsertClassification(db, c)
    const [loaded] = repo.getClassifications(db, ['msg-1'])
    expect(loaded).toEqual(c)
  })

  it('finds messages via full-text search', () => {
    const db = openDatabase(':memory:')
    repo.insertMessage(db, makeMessage())
    repo.insertMessage(db, makeMessage({ id: 'msg-2', uid: 101, subject: 'Lunch on Friday?', bodyText: 'Tacos?', snippet: 'Tacos?' }))
    const hits = repo.searchMessages(db, 'contract', 10)
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('msg-1')
  })

  it('applies corrections and surfaces them for future prompts', () => {
    const db = openDatabase(':memory:')
    repo.insertMessage(db, makeMessage())
    repo.upsertClassification(db, {
      messageId: 'msg-1',
      category: 'personal',
      importance: 1,
      screening: 'other',
      isActionable: false,
      actionSummary: null,
      deadline: null,
      topics: [],
      projectHint: null,
      people: [],
      sensitivity: [],
      runId: 'run-1',
      model: 'test-model',
      corrected: false
    })
    repo.setCorrection(db, 'msg-1', 'work', null)
    const [c] = repo.getClassifications(db, ['msg-1'])
    expect(c.category).toBe('work')
    expect(c.corrected).toBe(true)
    const examples = repo.listCorrections(db, 5)
    expect(examples[0]).toEqual({ subject: 'Contract renewal for Acme', from: 'jane@acme.com', category: 'work' })
  })

  it('tracks sync watermarks per account/folder', () => {
    const db = openDatabase(':memory:')
    expect(repo.getSyncState(db, 'acc-1', 'INBOX')).toEqual({ uidValidity: 0, lastUid: 0 })
    repo.setSyncState(db, 'acc-1', 'INBOX', 42, 900)
    expect(repo.getSyncState(db, 'acc-1', 'INBOX')).toEqual({ uidValidity: 42, lastUid: 900 })
    repo.setSyncState(db, 'acc-1', 'INBOX', 42, 950)
    expect(repo.getSyncState(db, 'acc-1', 'INBOX')).toEqual({ uidValidity: 42, lastUid: 950 })
  })
})
