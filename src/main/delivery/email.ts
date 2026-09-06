import nodemailer from 'nodemailer'
import type { AccountConfig } from '../../shared/types'

/**
 * Delivery: InboxScout only ever sends to *you* (your own email or phone),
 * using one of your own connected app-password accounts as the outbox.
 * It never emails other people on your behalf - replies are drafts you send.
 */

const SMTP: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
  icloud: { host: 'smtp.mail.me.com', port: 587, secure: false }
}

/** US carrier email-to-SMS gateways: free, no account, plain text only. */
export const SMS_GATEWAYS: Record<string, { name: string; domain: string }> = {
  att: { name: 'AT&T', domain: 'txt.att.net' },
  verizon: { name: 'Verizon', domain: 'vtext.com' },
  tmobile: { name: 'T-Mobile', domain: 'tmomail.net' },
  sprint: { name: 'Sprint', domain: 'messaging.sprintpcs.com' },
  uscellular: { name: 'US Cellular', domain: 'email.uscc.net' },
  googlefi: { name: 'Google Fi', domain: 'msg.fi.google.com' },
  cricket: { name: 'Cricket', domain: 'sms.cricketwireless.net' },
  boost: { name: 'Boost', domain: 'sms.myboostmobile.com' },
  metro: { name: 'Metro by T-Mobile', domain: 'mymetropcs.com' },
  mint: { name: 'Mint Mobile', domain: 'tmomail.net' },
  visible: { name: 'Visible', domain: 'vtext.com' }
}

/** Pure: phone + carrier → gateway address. */
export function smsAddress(phone: string, carrier: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  const gw = SMS_GATEWAYS[carrier]
  if (!gw || digits.length !== 10) return null
  return `${digits}@${gw.domain}`
}

/** Pure: a text message that fits one SMS segment-ish. */
export function smsText(headline: string, topTitles: string[]): string {
  let text = `InboxScout: ${headline}`
  for (const t of topTitles.slice(0, 3)) {
    const next = `${text} • ${t}`
    if (next.length > 150) break
    text = next
  }
  return text.slice(0, 155)
}

/** Which connected account can act as the outbox (needs an SMTP preset + app password). */
export function pickOutbox(accounts: AccountConfig[], preferredId: string | null): AccountConfig | null {
  const eligible = accounts.filter((a) => SMTP[a.provider])
  return eligible.find((a) => a.id === preferredId) ?? eligible[0] ?? null
}

export async function sendMail(
  outbox: AccountConfig,
  password: string,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const cfg = SMTP[outbox.provider]
  if (!cfg) throw new Error(`No outgoing mail settings for ${outbox.provider}.`)
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: outbox.email, pass: password }
  })
  await transport.sendMail({ from: outbox.email, to, subject, text, html })
}
