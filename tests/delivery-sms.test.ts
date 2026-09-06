import { beforeEach, describe, expect, it, vi } from 'vitest'

/** v1.4 item 14: texts through carrier gateways go plain — no HTML part for the gateway to mangle. */
const sent: any[] = []
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async (opts: unknown) => {
        sent.push(opts)
      }
    })
  }
}))

import { isSmsGateway, sendMail, smsAddress } from '../src/main/delivery/email'
import type { AccountConfig } from '../src/shared/types'

const outbox: AccountConfig = { id: 'g', label: 'me@gmail.com', email: 'me@gmail.com', provider: 'gmail', host: '', port: 465, folders: [], createdAt: '' }

describe('SMS gateway delivery', () => {
  beforeEach(() => {
    sent.length = 0
  })

  it('recognises carrier gateway addresses', () => {
    expect(isSmsGateway(smsAddress('5551234567', 'verizon')!)).toBe(true)
    expect(isSmsGateway('5551234567@txt.att.net')).toBe(true)
    expect(isSmsGateway('jane@gmail.com')).toBe(false)
    expect(isSmsGateway('')).toBe(false)
  })

  it('omits the HTML part when none is given, and keeps it for email', async () => {
    await sendMail(outbox, 'pw', '5551234567@vtext.com', '', undefined, 'InboxScout: 2 things need you')
    expect(sent[0]).toEqual({ from: 'me@gmail.com', to: '5551234567@vtext.com', subject: '', text: 'InboxScout: 2 things need you' })
    expect('html' in sent[0]).toBe(false)
    await sendMail(outbox, 'pw', 'me@example.com', 'InboxScout brief', '<p>hi</p>', 'hi')
    expect(sent[1].html).toBe('<p>hi</p>')
  })
})
