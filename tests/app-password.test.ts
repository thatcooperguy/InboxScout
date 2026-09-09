import { describe, expect, it } from 'vitest'
import { appPasswordShape, cleanIpcError, explainConnectError, providerForEmail } from '../src/shared/appPassword'
import { supportMailto, unsubscribeTarget } from '../src/shared/mailto'

describe('appPasswordShape', () => {
  it('accepts the 16 letters Google shows as four groups and joins them', () => {
    const s = appPasswordShape('gmail', 'abcd efgh ijkl mnop')
    expect(s.looksRight).toBe(true)
    expect(s.normalized).toBe('abcdefghijklmnop')
    expect(s.hint).toBeNull()
  })
  it('flags an everyday password pasted into the Gmail form', () => {
    const s = appPasswordShape('gmail', 'G0N3F!SH!NG1986')
    expect(s.looksRight).toBe(false)
    expect(s.hint).toMatch(/everyday Gmail password/)
    expect(s.hint).toMatch(/Get it for me/)
  })
  it('normalizes Apple passwords to xxxx-xxxx-xxxx-xxxx and flags anything else', () => {
    expect(appPasswordShape('icloud', 'abcd-efgh-ijkl-mnop').normalized).toBe('abcd-efgh-ijkl-mnop')
    expect(appPasswordShape('icloud', 'ABCDEFGHIJKLMNOP').normalized).toBe('abcd-efgh-ijkl-mnop')
    expect(appPasswordShape('icloud', 'Password1!').looksRight).toBe(false)
  })
  it('lets any password through for plain IMAP', () => {
    expect(appPasswordShape('imap', 'Hunter2!').looksRight).toBe(true)
    expect(appPasswordShape('imap', '').looksRight).toBe(false)
  })
})

describe('cleanIpcError', () => {
  it('strips the whole Electron prefix even when the method name has a colon', () => {
    expect(cleanIpcError(new Error("Error invoking remote method 'accounts:add': Error: Command failed"))).toBe('Command failed')
    expect(cleanIpcError('Error: plain')).toBe('plain')
    expect(cleanIpcError({ message: 'x' })).toBe('x')
  })
})

describe('explainConnectError', () => {
  it("turns ImapFlow's bare 'Command failed' into the app-password sentence", () => {
    const err = Object.assign(new Error('Command failed'), { authenticationFailed: true, responseText: '[AUTHENTICATIONFAILED] Invalid credentials (Failure)' })
    const text = explainConnectError('gmail', err)
    expect(text).toMatch(/^Gmail did not accept that password/)
    expect(text).toMatch(/Get it for me/)
    expect(text).not.toMatch(/Command failed/)
  })
  it('mentions 2-Step Verification when Google asks for it', () => {
    expect(explainConnectError('gmail', { message: 'Command failed', responseText: '[ALERT] Application-specific password required' })).toMatch(/2-Step Verification/)
  })
  it('explains network trouble and unknown errors without jargon codes up front', () => {
    expect(explainConnectError('yahoo', { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND imap.mail.yahoo.com' })).toMatch(/^Could not reach Yahoo/)
    expect(explainConnectError('imap', { code: 'ECONNREFUSED' })).toMatch(/server name/)
    expect(explainConnectError('imap', new Error('Weird thing'))).toBe('Could not connect to Your email service: Weird thing')
  })
  it('can leave out the Get it for me hint for generic IMAP', () => {
    expect(explainConnectError('imap', { authenticationFailed: true })).not.toMatch(/Get it for me/)
  })
})

describe('app-password window helpers', () => {
  it('presents as plain Chrome so sign-in pages do not refuse the window', async () => {
    const { chromeUserAgent, startUrlFor } = await import('../src/main/setup/appPasswordPure')
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) inboxscout/1.5.6 Chrome/132.0.0.0 Electron/44.2.0 Safari/537.36'
    const out = chromeUserAgent(ua, 'inboxscout')
    expect(out).not.toMatch(/Electron|inboxscout/)
    expect(out).toMatch(/Chrome\/132/)
    expect(startUrlFor('gmail', 'a@b.com')).toMatch(/^https:\/\/accounts\.google\.com\/AccountChooser\?Email=a%40b\.com&continue=https%3A%2F%2Fmyaccount\.google\.com%2Fapppasswords/)
    expect(startUrlFor('yahoo', 'a@b.com')).toMatch(/^https:\/\/login\.yahoo\.com/)
  })
})

describe('providerForEmail', () => {
  it('picks the service from the address as the person types', () => {
    expect(providerForEmail('Someone@Gmail.com')).toBe('gmail')
    expect(providerForEmail('a@ymail.com')).toBe('yahoo')
    expect(providerForEmail('a@aol.com')).toBe('yahoo')
    expect(providerForEmail('a@me.com')).toBe('icloud')
    expect(providerForEmail('a@hotmail.co.uk')).toBe('outlook')
  })
  it('stays quiet for unknown or half-typed addresses', () => {
    expect(providerForEmail('a@work.example')).toBeNull()
    expect(providerForEmail('a@gmail')).toBeNull()
    expect(providerForEmail('nothing')).toBeNull()
    expect(providerForEmail('')).toBeNull()
  })
})

describe('supportMailto', () => {
  it('addresses support with the version and a paste-here note, never the diagnostics themselves', () => {
    const url = supportMailto('1.5.7', 'Windows 11')
    expect(url.startsWith('mailto:hello@inboxscout.ai?')).toBe(true)
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    expect(q.get('subject')).toBe('InboxScout help (1.5.7)')
    expect(q.get('body')).toMatch(/press Paste/)
    expect(q.get('body')).toMatch(/InboxScout 1\.5\.7 on Windows 11/)
    expect(url.length).toBeLessThan(700)
  })
})

describe('unsubscribeTarget', () => {
  it('prefers the web link, falls back to mailto, and ignores junk', () => {
    expect(unsubscribeTarget('<mailto:u@list.example?subject=unsub>, <https://list.example/u/123>')).toEqual({ url: 'https://list.example/u/123', kind: 'link' })
    expect(unsubscribeTarget('<mailto:u@list.example>')).toEqual({ url: 'mailto:u@list.example', kind: 'mail' })
    expect(unsubscribeTarget('https://a.example/x')).toEqual({ url: 'https://a.example/x', kind: 'link' })
    expect(unsubscribeTarget('nonsense')).toBeNull()
    expect(unsubscribeTarget(null)).toBeNull()
  })
})
