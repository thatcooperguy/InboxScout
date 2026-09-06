import { describe, expect, it } from 'vitest'
import { isObviousNoise, mapConcurrent, withTransientRetry, TRANSIENT_RETRY_MS } from '../src/main/ai/classify'
import type { MessageRecord } from '../src/shared/types'

/** v1.4 items 3, 4 and extra (a): a small classify pool, the noise pre-filter, and one retry on 429/5xx. */

const msg = (overrides: Partial<MessageRecord> = {}): MessageRecord => ({
  id: 'm',
  accountId: 'a',
  folder: 'INBOX',
  uid: 1,
  messageId: '<m@x>',
  threadKey: 't',
  fromAddress: 'jane@client.com',
  fromName: 'Jane',
  toAddresses: 'me@x.com',
  subject: 'Hello',
  date: '2026-09-05T00:00:00.000Z',
  snippet: 'hi',
  bodyText: 'hi',
  fromMe: false,
  listUnsubscribe: null,
  hasAttachments: false,
  ...overrides
})

describe('mapConcurrent', () => {
  it('keeps at most `limit` calls in flight and returns results in input order', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapConcurrent([50, 10, 30, 5, 20, 1], 3, async (ms) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, ms))
      inFlight--
      return ms * 2
    })
    expect(out).toEqual([100, 20, 60, 10, 40, 2])
    expect(peak).toBe(3)
  })

  it('handles empty input and a limit above the item count', async () => {
    expect(await mapConcurrent([], 3, async (x: number) => x)).toEqual([])
    expect(await mapConcurrent([1, 2], 8, async (x) => x + 1)).toEqual([2, 3])
  })

  it('rejects when one call rejects', async () => {
    await expect(mapConcurrent([1, 2, 3], 2, async (x) => (x === 2 ? Promise.reject(new Error('boom')) : x))).rejects.toThrow('boom')
  })
})

describe('isObviousNoise', () => {
  it('flags noreply/newsletter senders and Gmail promotions/social/forums', () => {
    expect(isObviousNoise(msg({ fromAddress: 'noreply@shop.com' }))).toBe(true)
    expect(isObviousNoise(msg({ fromAddress: 'newsletter@news.com' }))).toBe(true)
    expect(isObviousNoise(msg({ providerHints: { source: 'gmail', category: 'promotions', important: false, starred: false, unread: true, focused: null } }))).toBe(true)
    expect(isObviousNoise(msg({ providerHints: { source: 'gmail', category: 'social', important: false, starred: false, unread: true, focused: null } }))).toBe(true)
    expect(isObviousNoise(msg({ providerHints: { source: 'gmail', category: 'forums', important: false, starred: false, unread: true, focused: null } }))).toBe(true)
  })

  it('never skips the AI for mail the provider marked important or starred, or for ordinary people', () => {
    expect(isObviousNoise(msg({ fromAddress: 'noreply@bank.com', providerHints: { source: 'gmail', category: 'updates', important: true, starred: false, unread: true, focused: null } }))).toBe(false)
    expect(isObviousNoise(msg({ providerHints: { source: 'gmail', category: 'promotions', important: false, starred: true, unread: true, focused: null } }))).toBe(false)
    expect(isObviousNoise(msg({ providerHints: { source: 'gmail', category: 'updates', important: false, starred: false, unread: true, focused: null } }))).toBe(false)
    expect(isObviousNoise(msg())).toBe(false)
    expect(isObviousNoise(msg({ providerHints: { source: 'outlook', category: null, important: false, starred: false, unread: true, focused: false } }))).toBe(false)
  })
})

describe('withTransientRetry', () => {
  it('retries once after the back-off on 429/5xx and then succeeds', async () => {
    let calls = 0
    const waits: number[] = []
    const out = await withTransientRetry(
      async () => {
        calls++
        if (calls === 1) throw new Error('429 Too Many Requests')
        return 'ok'
      },
      async (ms) => {
        waits.push(ms)
      }
    )
    expect(out).toBe('ok')
    expect(calls).toBe(2)
    expect(waits).toEqual([TRANSIENT_RETRY_MS])
  })

  it('gives up after the single retry so withAiFallback still switches engines', async () => {
    let calls = 0
    await expect(
      withTransientRetry(
        async () => {
          calls++
          throw new Error('503 Service Unavailable')
        },
        async () => {}
      )
    ).rejects.toThrow('503')
    expect(calls).toBe(2)
  })

  it('does not retry a non-transient error (bad key, schema problem)', async () => {
    let calls = 0
    await expect(
      withTransientRetry(
        async () => {
          calls++
          throw new Error('401 invalid api key')
        },
        async () => {}
      )
    ).rejects.toThrow('401')
    expect(calls).toBe(1)
  })

  it('reads the status from SDK-style error objects too', async () => {
    let calls = 0
    const err: any = new Error('Server error')
    err.statusCode = 502
    const out = await withTransientRetry(
      async () => {
        calls++
        if (calls === 1) throw err
        return 1
      },
      async () => {}
    )
    expect(out).toBe(1)
    expect(calls).toBe(2)
  })
})
