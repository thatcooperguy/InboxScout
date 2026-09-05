import { describe, expect, it } from 'vitest'
import { buildClassificationPrompt, chunk } from '../src/main/ai/classify'
import { threadKeyFor, makeSnippet } from '../src/main/mail/imap'
import { PROFILES } from '../src/main/profiles/profiles'
import type { MessageRecord } from '../src/shared/types'

const msg = (id: string, subject: string): MessageRecord => ({
  id,
  accountId: 'a1',
  folder: 'INBOX',
  uid: 1,
  messageId: `<${id}@x>`,
  threadKey: 't',
  fromAddress: 'a@b.com',
  fromName: 'A B',
  toAddresses: 'me@x.com',
  subject,
  date: '2026-09-05T00:00:00.000Z',
  snippet: 'hello',
  bodyText: 'hello body',
  fromMe: false
})

describe('chunk', () => {
  it('splits into fixed-size batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 20)).toEqual([])
  })
})

describe('buildClassificationPrompt', () => {
  it('injects profile context and every message with its index', () => {
    const prompt = buildClassificationPrompt(PROFILES.realestate, [msg('m1', 'Offer on Hartley St'), msg('m2', 'Gym renewal')], [])
    expect(prompt).toContain('real-estate agent')
    expect(prompt).toContain('expiring contingencies')
    expect(prompt).toContain('Email index 0')
    expect(prompt).toContain('Offer on Hartley St')
    expect(prompt).toContain('Email index 1')
    expect(prompt).toContain('personal_private')
  })

  it('includes user corrections as precedents', () => {
    const prompt = buildClassificationPrompt(PROFILES.general, [msg('m1', 'x')], [
      { subject: 'League night', from: 'coach@club.com', category: 'personal' }
    ])
    expect(prompt).toContain('corrected past classifications')
    expect(prompt).toContain('League night')
  })
})

describe('threadKeyFor', () => {
  it('groups by the root of the references chain', () => {
    const a = threadKeyFor('Re: Quote', ['<root@x>', '<mid@x>'], '<a@x>')
    const b = threadKeyFor('Quote', ['<root@x>'], '<b@x>')
    expect(a).toBe(b)
  })
  it('falls back to normalized subject, ignoring Re:/Fwd: prefixes', () => {
    const a = threadKeyFor('Re: Re: Big Deal', [], '<a@x>')
    const b = threadKeyFor('BIG DEAL', [], '<b@x>')
    expect(a).toBe(b)
  })
  it('never collides empty subjects into one thread', () => {
    const a = threadKeyFor('', [], '<a@x>')
    const b = threadKeyFor('', [], '<b@x>')
    expect(a).not.toBe(b)
  })
})

describe('makeSnippet', () => {
  it('collapses whitespace and truncates', () => {
    expect(makeSnippet('hello\n\n  world')).toBe('hello world')
    expect(makeSnippet('x'.repeat(500))).toHaveLength(300)
  })
})
