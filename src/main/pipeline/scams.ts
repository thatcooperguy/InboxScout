import type { MessageRecord, ScamWarning } from '../../shared/types'

/**
 * Scam guard (v1.6). Deterministic, no model in the loop, so it protects every install including
 * the ones that never add an AI key. Each signal is a plain sentence the person can read; the
 * score decides whether a message is *likely* a scam (kept out of "Needs you" entirely) or only
 * *possibly* one (still shown, with a warning). Pure and unit-tested.
 *
 * It errs toward warning: a warning costs a glance; a missed scam can cost a pension.
 */

/** A name the message may claim, and the domains that really belong to it. */
const BRANDS: { name: RegExp; label: string; domains: string[] }[] = [
  { name: /\bpay ?pal\b/i, label: 'PayPal', domains: ['paypal.com'] },
  { name: /\bamazon\b/i, label: 'Amazon', domains: ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de'] },
  { name: /\bapple\b|\bicloud\b|\bapp store\b/i, label: 'Apple', domains: ['apple.com', 'icloud.com'] },
  { name: /\bmicrosoft\b|\boffice ?365\b|\boutlook\b/i, label: 'Microsoft', domains: ['microsoft.com', 'outlook.com', 'live.com', 'hotmail.com', 'office.com'] },
  { name: /\bgoogle\b|\bgmail\b/i, label: 'Google', domains: ['google.com', 'gmail.com', 'youtube.com', 'googlemail.com'] },
  { name: /\bnetflix\b/i, label: 'Netflix', domains: ['netflix.com'] },
  { name: /\bfacebook\b|\bmeta\b/i, label: 'Facebook', domains: ['facebook.com', 'facebookmail.com', 'meta.com'] },
  { name: /\binstagram\b/i, label: 'Instagram', domains: ['instagram.com', 'facebookmail.com'] },
  { name: /\busps\b|\bpostal service\b/i, label: 'USPS', domains: ['usps.com', 'usps.gov'] },
  { name: /\bups\b/i, label: 'UPS', domains: ['ups.com'] },
  { name: /\bfedex\b/i, label: 'FedEx', domains: ['fedex.com'] },
  { name: /\bdhl\b/i, label: 'DHL', domains: ['dhl.com', 'dhl.de'] },
  { name: /\birs\b|\binternal revenue\b/i, label: 'the IRS', domains: ['irs.gov'] },
  { name: /\bsocial security\b|\bssa\b/i, label: 'Social Security', domains: ['ssa.gov'] },
  { name: /\bmedicare\b/i, label: 'Medicare', domains: ['medicare.gov', 'cms.gov'] },
  { name: /\bchase\b/i, label: 'Chase', domains: ['chase.com', 'jpmorgan.com', 'jpmchase.com'] },
  { name: /\bwells ?fargo\b/i, label: 'Wells Fargo', domains: ['wellsfargo.com'] },
  { name: /\bbank of america\b|\bbofa\b/i, label: 'Bank of America', domains: ['bankofamerica.com', 'bofa.com'] },
  { name: /\bciti(bank)?\b/i, label: 'Citi', domains: ['citi.com', 'citibank.com'] },
  { name: /\bcapital one\b/i, label: 'Capital One', domains: ['capitalone.com'] },
  { name: /\bvenmo\b/i, label: 'Venmo', domains: ['venmo.com'] },
  { name: /\bzelle\b/i, label: 'Zelle', domains: ['zellepay.com', 'zelle.com'] },
  { name: /\bcash ?app\b/i, label: 'Cash App', domains: ['cash.app', 'squareup.com'] },
  { name: /\bcoinbase\b/i, label: 'Coinbase', domains: ['coinbase.com'] },
  { name: /\bnorton\b|\blifelock\b/i, label: 'Norton', domains: ['norton.com', 'nortonlifelock.com'] },
  { name: /\bmcafee\b/i, label: 'McAfee', domains: ['mcafee.com'] },
  { name: /\bgeek squad\b|\bbest buy\b/i, label: 'Best Buy', domains: ['bestbuy.com', 'geeksquad.com'] },
  { name: /\bwalmart\b/i, label: 'Walmart', domains: ['walmart.com'] },
  { name: /\bcostco\b/i, label: 'Costco', domains: ['costco.com'] },
  { name: /\bebay\b/i, label: 'eBay', domains: ['ebay.com'] },
  { name: /\bxfinity\b|\bcomcast\b/i, label: 'Xfinity', domains: ['xfinity.com', 'comcast.com', 'comcast.net'] },
  { name: /\bat&t\b|\batt\b/i, label: 'AT&T', domains: ['att.com', 'att.net'] },
  { name: /\bverizon\b/i, label: 'Verizon', domains: ['verizon.com', 'verizon.net', 'vzw.com'] },
  { name: /\bdocusign\b/i, label: 'DocuSign', domains: ['docusign.com', 'docusign.net'] },
  { name: /\bdropbox\b/i, label: 'Dropbox', domains: ['dropbox.com', 'dropboxmail.com'] }
]

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'aol.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'mail.com', 'gmx.com', 'yandex.com'])

/** Words a real institution uses in the mail that scammers copy — used to tell "PayPal" in a subject apart from a friend mentioning PayPal. */
const INSTITUTIONAL = /\byour (account|order|payment|invoice|package|delivery|parcel|subscription|membership|refund|statement|card|wallet|device)\b|\b(security|billing|support|fraud) (team|department|alert|notice)\b|\bunusual (activity|sign-?in)\b|\bsign-?in attempt\b|\bsuspended\b|\block(ed)?\b|\bverify\b|\bconfirm your\b|\bupdate your (payment|billing|account)\b|\bcustomer (service|support)\b/i

const URGENT = /\b(urgent|immediately|right away|within (24|48) hours|today only|final (notice|warning)|last chance|act now|expires? (today|tonight|tomorrow)|will be (suspended|closed|locked|deleted|terminated)|permanently (closed|locked))\b/i
const CREDENTIALS = /\b(verify|confirm|update|validate|re-?enter) your (account|identity|password|pass ?code|pin|ssn|social security|card|bank|billing|payment) (details|information|number)?\b|\bpassword (has )?expired\b|\benter your (password|pin|ssn)\b|\bsocial security number\b|\bdate of birth and\b/i
const PAYMENT = /\bgift ?cards?\b|\bitunes cards?\b|\bgoogle play cards?\b|\bsteam cards?\b|\bwire (transfer|the money|funds)\b|\bwestern union\b|\bmoneygram\b|\bbitcoin\b|\bcrypto(currency)?\b|\bprepaid (card|debit)\b|\bsend (me |us )?(the )?money\b|\bpay(ment)? in cash\b/i
const EMERGENCY = /\b(in jail|arrested|bail|stranded|in the hospital|car accident|been mugged|lost my (wallet|passport)|need (your )?help (right away|urgently|immediately))\b/i
const FAMILY = /\b(grandma|grandpa|grandmother|grandfather|nana|papa|mom|dad|it'?s me|your (grandson|granddaughter|son|daughter|nephew|niece))\b/i
const PRIZE = /\b(you (have )?won|winner|lottery|sweepstakes|prize|jackpot|inheritance|unclaimed (funds|money)|beneficiary|next of kin|million (dollars|usd)|\$\d{1,3}(,\d{3}){2,})\b/i
const FEE = /\b(processing|handling|release|transfer|clearance|activation|delivery|customs|redelivery) fee\b|\bsmall fee\b|\bpay (a|the) fee\b/i
const TECH_SUPPORT = /\b(your (computer|device|pc|mac) (is|has been|was) (infected|hacked|compromised)|virus(es)? (detected|found)|malware (detected|found)|call (us|our|the) (support|toll-?free|helpline|number)|(technical|tech) support|auto-?renew(al|ed)|has been renewed|renewal (of|for) your)\b/i
const SEXTORTION = /\b(i (have )?recorded you|your (webcam|camera)|i hacked your|compromising|adult (sites|videos)|pay (me )?in bitcoin)\b/i
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/
const SHORTENER = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|ow\.ly|shorturl\.at|rebrand\.ly|tiny\.cc)\//i
const IP_URL = /https?:\/\/\d{1,3}(\.\d{1,3}){3}/i
const PUNYCODE = /https?:\/\/[^\s/]*xn--/i
const URL = /https?:\/\/([^\s/<>"')]+)/gi

export interface ScamContext {
  /** Addresses the person has replied to or hears from regularly. Spoofing is possible, so this only softens the score. */
  trustedSenders?: Set<string>
}

const domainOf = (address: string): string => {
  const at = address.lastIndexOf('@')
  return at < 0 ? '' : address.slice(at + 1).toLowerCase().trim()
}
const belongsTo = (domain: string, owned: string[]): boolean => owned.some((d) => domain === d || domain.endsWith(`.${d}`))
const senderLabel = (m: Pick<MessageRecord, 'fromName' | 'fromAddress'>): string => (m.fromName?.trim() ? `${m.fromName.trim()} <${m.fromAddress}>` : m.fromAddress)

/** Inspect one message; null when nothing looks off. */
export function detectScam(m: MessageRecord, ctx: ScamContext = {}): ScamWarning | null {
  if (m.fromMe) return null
  const subject = m.subject ?? ''
  const body = (m.bodyText || m.snippet || '').slice(0, 6000)
  const text = `${subject}\n${body}`
  const fromName = m.fromName ?? ''
  const domain = domainOf(m.fromAddress ?? '')
  const reasons: string[] = []
  let score = 0
  // The most specific advice wins (blackmail > emergency > prize > tech support > payment > brand).
  let advice = ''
  let adviceRank = 0
  const advise = (rank: number, text: string): void => {
    if (rank > adviceRank) {
      adviceRank = rank
      advice = text
    }
  }

  // 1. Claims a brand it does not come from.
  let claimedBrand: (typeof BRANDS)[number] | null = null
  for (const b of BRANDS) {
    const inName = b.name.test(fromName)
    const inSubject = b.name.test(subject) && INSTITUTIONAL.test(text)
    if (!inName && !inSubject) continue
    claimedBrand = b
    if (belongsTo(domain, b.domains)) {
      score -= 2 // the real company talking about its own account; only the other signals can still raise it
    } else if (b.name.test(domain)) {
      score += 3
      reasons.push(`The address (${domain}) only looks like ${b.label}; it is not ${b.label}'s real address.`)
    } else {
      score += 3
      reasons.push(`It says it is from ${b.label}, but the address (${m.fromAddress}) is not a ${b.label} address.`)
    }
    break
  }

  // 2. A "bank", "support team", or "billing" writing from a free mailbox.
  if (FREE_MAIL.has(domain) && /\b(bank|security team|billing|support team|customer service|account team|fraud department|help ?desk)\b/i.test(`${fromName}\n${subject}`)) {
    score += 2
    reasons.push(`A company would not write from a personal ${domain} mailbox.`)
  }

  // 3. Pressure and credential fishing.
  const urgent = URGENT.test(text)
  if (CREDENTIALS.test(text)) {
    score += 2
    reasons.push('It asks you to confirm a password, account number, or other private details by email. Real companies do not.')
  }
  if (urgent) {
    score += 1
    reasons.push('It pushes you to act right away. Pressure is how scams stop you from thinking.')
  }

  // 4. Odd ways to pay.
  if (PAYMENT.test(text)) {
    score += 2
    reasons.push('It wants payment by gift card, wire, crypto, or cash. No real company or government office asks for those.')
    advise(1, 'Do not buy any cards or send any money.')
  }

  // 5. "It's me, I'm in trouble" from a stranger.
  if (EMERGENCY.test(text) && (FAMILY.test(text) || PAYMENT.test(text) || /\bmoney\b/i.test(text))) {
    score += 3
    reasons.push('It sounds like a relative in an emergency who needs money fast. That is a common trick.')
    advise(4, 'Call that person yourself, on the number you already have, before doing anything.')
  }

  // 6. Prizes, inheritances, and the fee that unlocks them.
  if (PRIZE.test(text)) {
    score += FEE.test(text) ? 4 : 2
    reasons.push(FEE.test(text) ? 'A prize or inheritance that needs a fee first is never real.' : 'It says you won or inherited money you never applied for.')
    advise(3, 'Real prizes never ask you to pay first. Ignore it.')
  }

  // 7. Tech support and surprise "renewals".
  if (TECH_SUPPORT.test(text)) {
    score += PHONE.test(text) ? 3 : 2
    reasons.push(PHONE.test(text) ? 'It says something is wrong with your computer or a subscription and gives a number to call. Do not call it.' : 'It says something is wrong with your computer or a subscription. Real warnings come from the software itself, not by email.')
    advise(2, 'Do not call the number and do not let anyone connect to your computer.')
  }

  // 8. Blackmail.
  if (SEXTORTION.test(text)) {
    score += 3
    reasons.push('It threatens you and asks for money. These are sent to millions of people at random.')
    advise(5, 'Delete it. It is a bluff.')
  }

  // 9. Links that hide where they go, or go to a domain the brand does not own.
  if (SHORTENER.test(text) || IP_URL.test(text) || PUNYCODE.test(text)) {
    score += 2
    reasons.push('Its links hide where they really go.')
  } else if (claimedBrand) {
    const hosts = new Set<string>()
    for (const match of text.matchAll(URL)) hosts.add(match[1].toLowerCase().split(':')[0])
    const foreign = [...hosts].filter((h) => !belongsTo(h, claimedBrand!.domains) && !/\b(unsubscribe|list-manage|sendgrid|mailchimp|constantcontact|hubspot|salesforce|click\.|links\.|email\.)/i.test(h))
    if (foreign.length && CREDENTIALS.test(text)) {
      score += 2
      reasons.push(`Its link goes to ${foreign[0]}, not to ${claimedBrand.label}.`)
    }
  }

  // Someone the person actually corresponds with softens the verdict (spoofing is still possible).
  if (ctx.trustedSenders?.has((m.fromAddress ?? '').toLowerCase())) score -= 2

  if (score < 2 || reasons.length === 0) return null
  const level: ScamWarning['level'] = score >= 4 ? 'likely' : 'possible'
  if (!advice) {
    advice = claimedBrand
      ? `If you have an account with ${claimedBrand.label}, open its website or app yourself instead of using anything in this email.`
      : 'Do not click its links or reply. If it worries you, ask someone you trust to look at it with you.'
  }
  return { messageId: m.id, subject: subject || '(no subject)', from: senderLabel(m), fromAddress: m.fromAddress ?? '', level, reasons, advice }
}

/** All warnings for a batch, likely ones first. */
export function detectScams(messages: MessageRecord[], ctx: ScamContext = {}): ScamWarning[] {
  const out: ScamWarning[] = []
  for (const m of messages) {
    const w = detectScam(m, ctx)
    if (w) out.push(w)
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'likely' ? -1 : 1))
}

/** Senders the person has replied to, or hears from steadily and is not new — from the people engine. */
export function trustedSendersFrom(people: { addresses: string[]; repliedByMe: number; received: number; isNew?: boolean }[]): Set<string> {
  const out = new Set<string>()
  for (const p of people) {
    if (p.repliedByMe > 0 || (p.received >= 3 && !p.isNew)) for (const a of p.addresses) out.add(a.toLowerCase())
  }
  return out
}
