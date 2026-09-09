import { describe, expect, it } from 'vitest'
import { detectScam, detectScams, trustedSendersFrom } from '../src/main/pipeline/scams'
import type { MessageRecord } from '../src/shared/types'

let n = 0
function msg(over: Partial<MessageRecord>): MessageRecord {
  n += 1
  return {
    id: `m${n}`,
    accountId: 'a',
    folder: 'INBOX',
    uid: n,
    messageId: `<${n}@x>`,
    threadKey: `t${n}`,
    fromAddress: 'someone@example.com',
    fromName: '',
    toAddresses: 'me@example.com',
    subject: '',
    date: '2026-09-09T10:00:00.000Z',
    snippet: '',
    bodyText: '',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false,
    ...over
  }
}

describe('scam guard — catches the classic shapes', () => {
  it('a "PayPal" that is not PayPal, asking to verify the account now', () => {
    const w = detectScam(msg({ fromName: 'PayPal Security', fromAddress: 'alerts@paypa1-secure.com', subject: 'Unusual activity on your account', bodyText: 'Your account will be suspended within 24 hours. Verify your account details at http://paypal.verify-now.ru/login' }))
    expect(w?.level).toBe('likely')
    expect(w?.reasons.join(' ')).toMatch(/not a PayPal address/)
    expect(w?.reasons.join(' ')).toMatch(/act right away/)
    expect(w?.advice).toMatch(/open its website or app yourself/)
  })
  it('the grandparent emergency', () => {
    const w = detectScam(msg({ fromName: 'Kevin', fromAddress: 'kevin.help2026@gmail.com', subject: 'Grandma please help', bodyText: "It's me, your grandson. I was arrested and I'm in jail. I need $2,000 for bail right away, please wire the money and don't tell mom." }))
    expect(w?.level).toBe('likely')
    expect(w?.advice).toMatch(/Call that person yourself/)
  })
  it('gift cards for a "tech support" renewal with a number to call', () => {
    const w = detectScam(msg({ fromName: 'Geek Squad Billing', fromAddress: 'billing.dept7781@outlook.com', subject: 'Your subscription has been renewed - $399.99', bodyText: 'Your Geek Squad plan has been renewed for $399.99. To cancel call our support at (888) 555-0142 within 24 hours. Refunds are processed by gift card.' }))
    expect(w?.level).toBe('likely')
    expect(w?.reasons.join(' ')).toMatch(/number to call/)
    expect(w?.reasons.join(' ')).toMatch(/personal outlook.com mailbox/)
  })
  it('a prize that needs a fee', () => {
    const w = detectScam(msg({ fromName: 'International Lottery Commission', fromAddress: 'claims@lottery-intl-payout.com', subject: 'Congratulations, you have won $1,500,000', bodyText: 'You are the winner. To release the funds a processing fee of $250 is required.' }))
    expect(w?.level).toBe('likely')
    expect(w?.advice).toMatch(/never ask you to pay first/)
  })
  it('a lookalike address is called out by name', () => {
    const w = detectScam(msg({ fromName: 'Amazon', fromAddress: 'no-reply@amazon-orders-help.com', subject: 'Your order could not be delivered', bodyText: 'Confirm your payment details to release your package: https://bit.ly/3xAmzn' }))
    expect(w?.level).toBe('likely')
    expect(w?.reasons.join(' ')).toMatch(/only looks like Amazon/)
    expect(w?.reasons.join(' ')).toMatch(/hide where they really go/)
  })
  it('blackmail is named as a bluff', () => {
    const w = detectScam(msg({ fromAddress: 'x@random.xyz', subject: 'I know what you did', bodyText: 'I hacked your device and I have recorded you. Pay me in bitcoin within 48 hours.' }))
    expect(w?.level).toBe('likely')
    expect(w?.advice).toMatch(/bluff/)
  })
})

describe('scam guard — leaves real mail alone', () => {
  it('a real Amazon order confirmation', () => {
    expect(detectScam(msg({ fromName: 'Amazon.com', fromAddress: 'auto-confirm@amazon.com', subject: 'Your Amazon.com order #112-4456', bodyText: 'Your order has shipped. Track your package at https://www.amazon.com/gp/css/order-history' }))).toBeNull()
  })
  it('a friend mentioning a brand', () => {
    expect(detectScam(msg({ fromName: 'Sarah', fromAddress: 'sarah@gmail.com', subject: 'Did you see this on Amazon?', bodyText: 'The blender we talked about is on sale, want me to order it for you?' }))).toBeNull()
  })
  it('a real bank statement notice with its own domain and a plain link', () => {
    expect(detectScam(msg({ fromName: 'Chase', fromAddress: 'no.reply.alerts@chase.com', subject: 'Your statement is ready', bodyText: 'Your statement is ready to view. Sign in at https://secure.chase.com to see it.' }))).toBeNull()
  })
  it('a newsletter with an unsubscribe link', () => {
    expect(detectScam(msg({ fromName: 'The Weekly Recipe', fromAddress: 'hello@recipes.example', subject: 'Five fall soups', bodyText: 'Here are this week’s recipes. Unsubscribe: https://recipes.example/unsubscribe' }))).toBeNull()
  })
  it('a doctor asking to confirm an appointment (not a credential ask)', () => {
    expect(detectScam(msg({ fromName: "Dr. Patel's office", fromAddress: 'frontdesk@patelfamilymed.com', subject: 'Please confirm your appointment Thursday 10:00', bodyText: 'Reply YES to confirm or call 555-0142 to reschedule.' }))).toBeNull()
  })
  it('sent mail is never flagged', () => {
    expect(detectScam(msg({ fromMe: true, subject: 'You have won', bodyText: 'gift card wire transfer bitcoin' }))).toBeNull()
  })
})

describe('scam guard — ordering and trust', () => {
  it('lists likely scams before possible ones', () => {
    const likely = msg({ fromName: 'PayPal', fromAddress: 'x@paypal-help.co', subject: 'Verify your account', bodyText: 'Your account will be suspended. Verify your account details now.' })
    const possible = msg({ fromAddress: 'promo@unknownshop.example', subject: 'Act now, final notice', bodyText: 'Last chance to renew, pay today.' })
    const out = detectScams([possible, likely])
    expect(out.map((w) => w.level)).toEqual(['likely'].concat(out.length > 1 ? ['possible'] : []))
    expect(out[0].messageId).toBe(likely.id)
  })
  it('a sender the person replies to softens the verdict', () => {
    const trusted = trustedSendersFrom([{ addresses: ['bob@example.com'], repliedByMe: 4, received: 10, isNew: false }, { addresses: ['new@example.com'], repliedByMe: 0, received: 1, isNew: true }])
    expect(trusted.has('bob@example.com')).toBe(true)
    expect(trusted.has('new@example.com')).toBe(false)
    const m = msg({ fromName: 'Bob', fromAddress: 'bob@example.com', subject: 'urgent - need the wire transfer today', bodyText: 'Can you wire the money for the deposit today? Final notice from the landlord.' })
    const alone = detectScam(m)
    const known = detectScam(m, { trustedSenders: trusted })
    expect(alone?.level).toBe('possible')
    expect(known).toBeNull()
  })
})
