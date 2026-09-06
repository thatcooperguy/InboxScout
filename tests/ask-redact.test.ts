import { describe, expect, it } from 'vitest'
import { redact, redactText } from '../src/main/ask/redact'

describe('ask redaction', () => {
  it('masks passwords, long digit runs, SSNs, and codes', () => {
    expect(redactText('Your password: hunter2 expires soon')).toBe('Your password: •••••• expires soon')
    expect(redactText('password = Tr0ub4dor&3')).toBe('password = ••••••')
    expect(redactText('Your passcode is Sw0rdfish!')).toBe('Your passcode is ••••••')
    expect(redactText('Card 4111 1111 1111 1111 was charged')).toBe('Card •••• (number hidden) was charged')
    expect(redactText('Account number 1234567890123456.')).toBe('Account number •••• (number hidden).')
    expect(redactText('Routing 021000021 and account 0001234567890')).toBe('Routing 021000021 and account •••• (number hidden)') // 9 vs 13 digits: only the 13–19 run is hidden
    expect(redactText('SSN 123-45-6789 on file')).toBe('SSN •••-••-•••• on file')
    expect(redactText('Your verification code is 482913.')).toBe('Your verification code is ••••••.')
    expect(redactText('OTP: 123456')).toBe('OTP: ••••••')
    expect(redactText('PIN 998877')).toBe('PIN ••••••')
  })

  it('leaves ordinary numbers, dates, and amounts alone', () => {
    for (const s of ['Invoice #1042 for $2,400 due Sep 12', 'Call 555-0134', 'Order 20260906 shipped', 'Room 123456 is booked', 'Meeting at 2:30 pm on 9/15/2026']) {
      expect(redactText(s)).toBe(s)
    }
    expect(redactText('')).toBe('')
  })

  it('walks objects and arrays without touching structure', () => {
    const hit = { id: 'm1', subject: 'Statement', snippet: 'Account number 1234567890123456', nested: { code: 'code 123456', n: 5, ok: true, nothing: null }, list: ['password: x', 7] }
    expect(redact(hit)).toEqual({
      id: 'm1',
      subject: 'Statement',
      snippet: 'Account number •••• (number hidden)',
      nested: { code: 'code ••••••', n: 5, ok: true, nothing: null },
      list: ['password: ••••••', 7]
    })
    expect(redact(null)).toBeNull()
    expect(redact([])).toEqual([])
  })
})
