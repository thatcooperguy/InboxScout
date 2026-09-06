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
    listUnsubscribe: null,
    hasAttachments: false,
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

  // ---- Conversation (v1.4, Part B): safe FTS queries ----
  it('turns free text into a safe FTS5 query (quotes, apostrophes, AND/OR, emoji)', () => {
    expect(repo.toFtsQuery("Jane's write back?")).toBe('"jane" "write" "back"')
    expect(repo.toFtsQuery('"quoted phrase" AND (parens) OR NOT stuff')).toBe('"quoted" "phrase" "parens" "not" "stuff"')
    expect(repo.toFtsQuery('roof repair', 'or')).toBe('"roof" OR "repair"')
    expect(repo.toFtsQuery('🙂 🙂')).toBe('')
    expect(repo.toFtsQuery('the and of')).toBe('')
    expect(repo.toFtsQuery('Café résumé naïve 2026')).toBe('"café" "résumé" "naïve" "2026"')
    // Idempotent on its own output, so the AI tools may pass it through twice.
    expect(repo.toFtsQuery(repo.toFtsQuery('Invoice #1042 from Acme'))).toBe(repo.toFtsQuery('Invoice #1042 from Acme'))
  })

  it('searches with any punctuation and falls back from AND to OR', () => {
    const db = openDatabase(':memory:')
    repo.insertMessage(db, makeMessage())
    repo.insertMessage(db, makeMessage({ id: 'msg-2', uid: 101, subject: 'Lunch on Friday?', bodyText: 'Tacos?', snippet: 'Tacos?' }))
    // Raw text that used to raise "fts5: syntax error" now simply searches.
    expect(repo.searchMessages(db, "Jane's contract?", 10).map((h) => h.id)).toEqual(['msg-1'])
    expect(repo.searchMessages(db, '"contract" AND (renewal)', 10).map((h) => h.id)).toEqual(['msg-1'])
    expect(repo.searchMessages(db, '🙂', 10)).toEqual([])
    expect(repo.searchMessages(db, '', 10)).toEqual([])
    // "contract tacos": no message has both, so the OR retry finds both.
    expect(repo.searchMessages(db, 'contract tacos', 10).map((h) => h.id).sort()).toEqual(['msg-1', 'msg-2'])
    expect(repo.searchMessages(db, 'zeppelin', 10)).toEqual([])
    expect(repo.searchMessages(db, 'contract', 10)[0].from_name).toBe('Jane Doe')
  })

  it('looks up mail by sender and the latest exchange with an address', () => {
    const db = openDatabase(':memory:')
    repo.insertMessage(db, makeMessage())
    repo.insertMessage(db, makeMessage({ id: 'msg-me', uid: 102, fromAddress: 'me@example.com', fromName: 'Me', fromMe: true, toAddresses: 'Jane <jane@acme.com>', subject: 'Re: Contract renewal for Acme', date: '2026-09-06T10:00:00.000Z' }))
    repo.insertMessage(db, makeMessage({ id: 'msg-old', uid: 103, subject: 'Kickoff', date: '2026-08-01T10:00:00.000Z' }))
    expect(repo.searchMessagesFrom(db, 'JANE@acme.com', 5).map((m) => m.id)).toEqual(['msg-1', 'msg-old'])
    expect(repo.searchMessagesFrom(db, 'acme', 5).map((m) => m.id)).toEqual(['msg-1', 'msg-old'])
    expect(repo.searchMessagesFrom(db, 'doe', 1).map((m) => m.id)).toEqual(['msg-1'])
    expect(repo.searchMessagesFrom(db, '', 5)).toEqual([])
    expect(repo.latestInboundFrom(db, 'jane@acme.com')?.id).toBe('msg-1')
    expect(repo.latestInboundFrom(db, 'nobody@acme.com')).toBeNull()
    expect(repo.latestSentTo(db, 'jane@acme.com')?.id).toBe('msg-me')
    expect(repo.latestSentTo(db, 'me@example.com')).toBeNull()
    expect(repo.findSendersByName(db, 'jan')).toEqual([{ name: 'Jane Doe', address: 'jane@acme.com', lastSeen: '2026-09-05T10:00:00.000Z' }])
    expect(repo.findSendersByName(db, 'doe')).toHaveLength(1)
    expect(repo.findSendersByName(db, 'zzz')).toEqual([])
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
