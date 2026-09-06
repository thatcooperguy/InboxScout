import type { BriefPeople, Category, MessageRecord, PersonRole, PersonTier } from '../../shared/types'

/**
 * People engine — who is in this person's life, learned from mail across every
 * connected inbox. Pure and electron-free.
 *
 * Heuristics and thresholds (all documented next to the code that applies them):
 *  - Identity: addresses are lower-cased and "+tags" stripped from the local part; two addresses
 *    are the same person when they share a display name AND a domain.
 *  - Replies are counted once per thread using threadKey + date ordering.
 *  - cadenceDays = median gap between their inbound messages (null with < 3 inbound messages).
 *  - automated: noreply-style local part, List-Unsubscribe on > 50% of their mail, or ≥ 5 messages
 *    with no reply in either direction and nothing ever sent to them.
 *  - service: billing/support/appointments/customer-care style local part, or a known transactional domain.
 *  - colleague: same domain as one of the owner's work (non-freemail) addresses, or a two-way
 *    work-category correspondent without vendor/client signals.
 *  - vendor/client: work category + direction of invoice/quote/estimate/order/proposal/statement words.
 *  - family: kin/affection words in their mail or the owner's replies (non-work mail), or a shared
 *    surname with the owner in personal mail.
 *  - friend: personal mail with traffic both ways.
 *  - tier: score = 3×(replies each way, capped at 10) + 10 bonus for replies both ways
 *    + recency-weighted volume (e^(−age/60 days) per message) + 2 per extra account.
 *    inner = top 8 by score with replies both ways (or family with any two-way traffic);
 *    regular = two-way traffic; occasional = everyone else. automated/service never inner;
 *    quietPeople always occasional.
 *  - goingQuiet: inner/regular, cadence known, and days since lastSeen > max(14, 2.5 × cadence).
 *  - isNew: firstSeen within 21 days, received ≥ 2, not automated.
 */
export interface Person {
  /** Normalised primary address (lower-case). */
  key: string
  name: string
  addresses: string[]
  domain: string
  received: number
  sent: number
  /** Threads where the owner replied to them. */
  repliedByMe: number
  /** Threads where they replied to the owner. */
  repliedToMe: number
  firstSeen: string
  lastSeen: string
  /** Typical days between their messages (null when too few). */
  cadenceDays: number | null
  accounts: string[]
  role: PersonRole
  tier: PersonTier
  score: number
  goingQuiet: boolean
  quietDays: number
  isNew: boolean
  /** Messages either way in the last 30 days (used for brief wording). */
  recent30?: number
  /** Median hours the owner takes to reply to them (null when never replied). */
  replyHoursByMe?: number | null
  /** Median hours they take to reply to the owner (null when they never replied). */
  replyHoursToMe?: number | null
}

export interface PeopleInput {
  messages: MessageRecord[]
  categoryOf: (messageId: string) => Category | undefined
  /** All of the owner's addresses (every connected account, lower-case). */
  myAddresses: string[]
  now: Date
  /** Owner's display name if known (from sent mail) — helps spot family by surname. */
  ownerName?: string | null
  /** Addresses the owner marked "not important". */
  quietPeople?: string[]
}

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com',
  'hotmail.co.uk', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com',
  'proton.me', 'pm.me', 'gmx.com', 'gmx.de', 'mail.com', 'zoho.com', 'fastmail.com', 'hey.com', 'comcast.net',
  'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net', 'btinternet.com', 'sky.com'
])

/** Known transactional / service domains (receipts, shipping, banking, platforms). */
const SERVICE_DOMAINS = [
  'paypal.com', 'stripe.com', 'amazon.com', 'amazon.co.uk', 'amazon.ca', 'apple.com', 'google.com', 'microsoft.com',
  'uber.com', 'lyft.com', 'doordash.com', 'grubhub.com', 'instacart.com', 'ebay.com', 'etsy.com', 'shopify.com',
  'squareup.com', 'intuit.com', 'quickbooks.com', 'venmo.com', 'chase.com', 'wellsfargo.com', 'bankofamerica.com',
  'citi.com', 'capitalone.com', 'americanexpress.com', 'aexp.com', 'discover.com', 'fedex.com', 'ups.com',
  'usps.com', 'dhl.com', 'airbnb.com', 'booking.com', 'expedia.com', 'hotels.com', 'delta.com', 'united.com',
  'southwest.com', 'aa.com', 'jetblue.com', 'netflix.com', 'spotify.com', 'dropbox.com', 'github.com',
  'linkedin.com', 'facebookmail.com', 'twitter.com', 'x.com', 'instagram.com', 'zoom.us', 'calendly.com',
  'docusign.net', 'docusign.com', 'hellosign.com', 'mailchimp.com', 'sendgrid.net', 'walmart.com', 'target.com',
  'costco.com', 'bestbuy.com', 'homedepot.com', 'lowes.com', 'ticketmaster.com', 'eventbrite.com', 'opentable.com',
  'yelp.com', 'nextdoor.com', 'ring.com', 'nest.com', 'xfinity.com', 'verizon.com', 't-mobile.com', 'att.com'
]

const AUTOMATED_LOCAL = /(^|[._-])(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|notify|mailer-?daemon|postmaster|bounces?|alerts?|newsletters?|digest|updates|auto-?mailer|automated)([._-]|$)/i

const SERVICE_LOCAL = /^(billing|invoices?|invoicing|support|help|helpdesk|help-?desk|appointments?|scheduling|customer-?care|customer-?service|customerservice|customers?|service|services?|accounts?|orders?|receipts?|reservations?|bookings?|care|team|contact|shipping|delivery|payments?|statements?|reminders?|membership|welcome|hello|info)$/i

/** Lower-case, trim, strip angle brackets, drop "+tag" in the local part. */
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = String(raw).trim().toLowerCase()
  const lt = s.lastIndexOf('<')
  if (lt >= 0) {
    const gt = s.indexOf('>', lt)
    s = s.slice(lt + 1, gt >= 0 ? gt : undefined).trim()
  }
  s = s.replace(/^mailto:/, '').replace(/^["'\s]+|["'\s]+$/g, '')
  const at = s.indexOf('@')
  if (at < 0) return s
  let local = s.slice(0, at)
  const domain = s.slice(at + 1).replace(/\.+$/, '')
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (!local || !domain) return ''
  return `${local}@${domain}`
}

export function domainOf(address: string): string {
  const at = address.indexOf('@')
  return at >= 0 ? address.slice(at + 1) : ''
}

function cleanName(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = String(raw).replace(/[\r\n\t]+/g, ' ').trim()
  s = s.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').trim()
  if (!s || s.includes('@')) return ''
  // "Last, First" → "First Last"
  const comma = s.match(/^([^,]+),\s*([^,]+)$/)
  if (comma) s = `${comma[2].trim()} ${comma[1].trim()}`
  return s
}

interface ParsedAddress {
  address: string
  name: string
}

/** Split "Name <a@b>, c@d, \"Last, First\" <e@f>" into normalised parts. */
export function parseAddressList(raw: string | null | undefined): ParsedAddress[] {
  if (!raw) return []
  const parts: string[] = []
  let cur = ''
  let inQuote = false
  let inAngle = false
  for (const ch of String(raw)) {
    if (ch === '"') inQuote = !inQuote
    else if (ch === '<' && !inQuote) inAngle = true
    else if (ch === '>' && !inQuote) inAngle = false
    if ((ch === ',' || ch === ';') && !inQuote && !inAngle) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  const out: ParsedAddress[] = []
  for (const p of parts) {
    const t = p.trim()
    if (!t) continue
    const address = normalizeAddress(t)
    if (!address || !address.includes('@')) continue
    let name = ''
    const lt = t.lastIndexOf('<')
    if (lt > 0) name = cleanName(t.slice(0, lt))
    out.push({ address, name })
  }
  return out
}

function nameFromAddress(address: string): string {
  const local = address.split('@')[0] ?? ''
  const words = local.split(/[._\-\d]+/).filter(Boolean)
  if (!words.length) return address
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function parseDate(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : NaN
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by)
}

function topKey(map: Map<string, number>): string | null {
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of map) {
    if (n > bestN || (n === bestN && best !== null && k < best)) {
      best = k
      bestN = n
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Owner name
// ---------------------------------------------------------------------------

export function inferOwnerName(messages: MessageRecord[], myAddresses: string[]): string | null {
  const mine = new Set(myAddresses.map(normalizeAddress).filter(Boolean))
  const counts = new Map<string, string>()
  const tally = new Map<string, number>()
  for (const m of messages ?? []) {
    if (!m) continue
    const from = normalizeAddress(m.fromAddress)
    if (!(m.fromMe || (from && mine.has(from)))) continue
    const name = cleanName(m.fromName)
    if (!name) continue
    const k = nameKey(name)
    if (!k) continue
    bump(tally, k)
    if (!counts.has(k)) counts.set(k, name)
  }
  const best = topKey(tally)
  return best ? counts.get(best) ?? null : null
}

function surnameOf(name: string | null | undefined): string {
  const clean = cleanName(name).replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const tokens = clean.split(/\s+/).filter((t) => /^[a-z][a-z'’-]+$/i.test(t))
  if (tokens.length < 2) return ''
  return tokens[tokens.length - 1].toLowerCase()
}

// ---------------------------------------------------------------------------
// Role signals
// ---------------------------------------------------------------------------

const KIN_RE =
  /\b(mom|mum|mommy|mummy|mama|dad|daddy|papa|pops|grandma|grandpa|granny|nana|gran|gramps|grandmother|grandfather|auntie|aunt|uncle|cousin|niece|nephew|sis|sister|brother|bro|son|daughter|hubby|wifey|my love|love you|love ya|honey|sweetheart|sweetie|darling|xoxo|hugs and kisses)\b/i

const VENDOR_RE = /\b(invoice|quote|quotation|estimate|statement|your order|order confirmation|receipt|payment due|past due|amount due)\b/i
const CLIENT_OUT_RE = /\b(invoice|quote|quotation|estimate|proposal|statement|order)\b/i
const CLIENT_ASK_RE = /\b(can you|could you|would you|please send|please share|do you have|are you available|when can you)\b/i

function textOf(m: MessageRecord): string {
  const body = (m.bodyText ?? '').slice(0, 2000)
  return `${m.subject ?? ''}\n${m.snippet ?? ''}\n${body}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface Agg {
  addresses: Set<string>
  names: Map<string, number>
  nameDisplay: Map<string, string>
  accounts: Set<string>
  received: number
  sent: number
  inboundDates: number[]
  allDates: number[]
  unsubscribe: number
  categories: Map<Category, number>
  kinSignal: boolean
  vendorSignal: number
  clientSignal: number
  repliedByMe: number
  repliedToMe: number
  replyHoursByMe: number[]
  replyHoursToMe: number[]
  recent30: number
}

function newAgg(): Agg {
  return {
    addresses: new Set(),
    names: new Map(),
    nameDisplay: new Map(),
    accounts: new Set(),
    received: 0,
    sent: 0,
    inboundDates: [],
    allDates: [],
    unsubscribe: 0,
    categories: new Map(),
    kinSignal: false,
    vendorSignal: 0,
    clientSignal: 0,
    repliedByMe: 0,
    repliedToMe: 0,
    replyHoursByMe: [],
    replyHoursToMe: [],
    recent30: 0
  }
}

export function buildPeople(input: PeopleInput): Person[] {
  try {
    return buildPeopleInner(input)
  } catch {
    return []
  }
}

function buildPeopleInner(input: PeopleInput): Person[] {
  const messages = (input.messages ?? []).filter((m): m is MessageRecord => !!m)
  const nowMs = input.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now.getTime() : Date.now()
  const mine = new Set((input.myAddresses ?? []).map(normalizeAddress).filter(Boolean))
  const quiet = new Set((input.quietPeople ?? []).map(normalizeAddress).filter(Boolean))
  const ownerName = input.ownerName ?? inferOwnerName(messages, input.myAddresses ?? [])
  const ownerSurname = surnameOf(ownerName)
  const ownerWorkDomains = new Set<string>()
  for (const a of mine) {
    const d = domainOf(a)
    if (d && !FREEMAIL_DOMAINS.has(d)) ownerWorkDomains.add(d)
  }

  const isOwner = (m: MessageRecord): boolean => {
    if (m.fromMe) return true
    const from = normalizeAddress(m.fromAddress)
    return !!from && mine.has(from)
  }

  // Pass 1: which addresses appear, with which names/domains (for alias merging).
  const addrNames = new Map<string, Map<string, number>>()
  const addrDisplay = new Map<string, string>()
  const noteName = (address: string, name: string): void => {
    if (!addrNames.has(address)) addrNames.set(address, new Map())
    if (!name) return
    const k = nameKey(name)
    if (!k) return
    bump(addrNames.get(address)!, k)
    if (!addrDisplay.has(k)) addrDisplay.set(k, name)
  }
  for (const m of messages) {
    if (isOwner(m)) {
      for (const p of parseAddressList(m.toAddresses)) if (!mine.has(p.address)) noteName(p.address, p.name)
    } else {
      const from = normalizeAddress(m.fromAddress)
      if (from && from.includes('@')) noteName(from, cleanName(m.fromName))
    }
  }

  // Union-find over addresses: same display name + same domain → same person.
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    let r = a
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!
    let c = a
    while (parent.get(c) !== undefined && parent.get(c) !== r) {
      const next = parent.get(c)!
      parent.set(c, r)
      c = next
    }
    return r
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  const byNameDomain = new Map<string, string>()
  for (const [address, names] of addrNames) {
    parent.set(address, address)
    const domain = domainOf(address)
    for (const k of names.keys()) {
      if (k.length < 3) continue
      const nd = `${k}|${domain}`
      const existing = byNameDomain.get(nd)
      if (existing) union(existing, address)
      else byNameDomain.set(nd, address)
    }
  }

  // Pass 2: aggregate per person.
  const aggs = new Map<string, Agg>()
  const aggFor = (address: string): Agg => {
    const root = find(address)
    let a = aggs.get(root)
    if (!a) {
      a = newAgg()
      aggs.set(root, a)
    }
    a.addresses.add(address)
    return a
  }
  const addName = (a: Agg, name: string): void => {
    const k = nameKey(name)
    if (!k) return
    bump(a.names, k)
    if (!a.nameDisplay.has(k)) a.nameDisplay.set(k, name)
  }

  const cutoff30 = nowMs - 30 * DAY_MS
  for (const m of messages) {
    const t = parseDate(m.date)
    const cat = input.categoryOf ? safeCategory(input.categoryOf, m.id) : undefined
    if (isOwner(m)) {
      const text = textOf(m)
      const kin = KIN_RE.test(text)
      const clientOut = CLIENT_OUT_RE.test(text)
      for (const p of parseAddressList(m.toAddresses)) {
        if (mine.has(p.address)) continue
        const a = aggFor(p.address)
        a.sent++
        if (m.accountId) a.accounts.add(m.accountId)
        if (Number.isFinite(t)) {
          a.allDates.push(t)
          if (t >= cutoff30) a.recent30++
        }
        addName(a, p.name)
        if (cat) bump(a.categories, cat)
        if (kin) a.kinSignal = true
        if (clientOut) a.clientSignal++
      }
    } else {
      const from = normalizeAddress(m.fromAddress)
      if (!from || !from.includes('@')) continue
      const a = aggFor(from)
      a.received++
      if (m.accountId) a.accounts.add(m.accountId)
      if (Number.isFinite(t)) {
        a.allDates.push(t)
        a.inboundDates.push(t)
        if (t >= cutoff30) a.recent30++
      }
      addName(a, cleanName(m.fromName))
      if (m.listUnsubscribe) a.unsubscribe++
      if (cat) bump(a.categories, cat)
      const text = textOf(m)
      if (KIN_RE.test(text)) a.kinSignal = true
      // An ask ("can you send a quote?") is a client signal even when it mentions quote/invoice words.
      if (CLIENT_ASK_RE.test(text)) a.clientSignal++
      else if (VENDOR_RE.test(text)) a.vendorSignal++
    }
  }

  // Pass 3: replies per thread (once per thread per person per direction).
  const threads = new Map<string, MessageRecord[]>()
  for (const m of messages) {
    const key = m.threadKey || m.messageId || m.id
    let list = threads.get(key)
    if (!list) {
      list = []
      threads.set(key, list)
    }
    list.push(m)
  }
  for (const list of threads.values()) {
    if (list.length < 2) continue
    list.sort((x, y) => (parseDate(x.date) || 0) - (parseDate(y.date) || 0))
    const byMe = new Set<string>()
    const toMe = new Set<string>()
    // last inbound message time per person root, and last owner message time (addressed to whom).
    const lastInbound = new Map<string, number>()
    let lastOwnerAt = NaN
    const lastOwnerTo = new Set<string>()
    let ownerSeen = false
    for (const m of list) {
      const t = parseDate(m.date)
      if (isOwner(m)) {
        const recipients = parseAddressList(m.toAddresses)
          .map((p) => p.address)
          .filter((a) => !mine.has(a))
        const targets = recipients.length ? recipients.map(find) : [...lastInbound.keys()]
        for (const root of new Set(targets)) {
          const a = aggs.get(root)
          if (!a) continue
          const inboundAt = lastInbound.get(root)
          if (inboundAt !== undefined && !byMe.has(root)) {
            byMe.add(root)
            a.repliedByMe++
            if (Number.isFinite(t) && Number.isFinite(inboundAt)) a.replyHoursByMe.push(Math.max(0, (t - inboundAt) / 3_600_000))
          }
        }
        ownerSeen = true
        lastOwnerAt = t
        lastOwnerTo.clear()
        for (const r of targets) lastOwnerTo.add(r)
      } else {
        const from = normalizeAddress(m.fromAddress)
        if (!from || !from.includes('@')) continue
        const root = find(from)
        const a = aggs.get(root)
        if (!a) continue
        if (ownerSeen && !toMe.has(root)) {
          toMe.add(root)
          a.repliedToMe++
          if (Number.isFinite(t) && Number.isFinite(lastOwnerAt)) a.replyHoursToMe.push(Math.max(0, (t - lastOwnerAt) / 3_600_000))
        }
        lastInbound.set(root, t)
      }
    }
  }

  // Pass 4: assemble Person records.
  const people: Person[] = []
  for (const [root, a] of aggs) {
    if (!a.received && !a.sent) continue
    const addresses = [...a.addresses].sort()
    const key = a.addresses.has(root) ? root : addresses[0]
    const domain = domainOf(key)
    const bestName = topKey(a.names)
    const name = (bestName && a.nameDisplay.get(bestName)) || nameFromAddress(key)
    const dates = a.allDates.sort((x, y) => x - y)
    const firstMs = dates.length ? dates[0] : nowMs
    const lastMs = dates.length ? dates[dates.length - 1] : nowMs
    const inbound = a.inboundDates.sort((x, y) => x - y)
    let cadenceDays: number | null = null
    if (inbound.length >= 3) {
      const gaps: number[] = []
      for (let i = 1; i < inbound.length; i++) gaps.push((inbound[i] - inbound[i - 1]) / DAY_MS)
      const med = median(gaps)
      cadenceDays = med === null ? null : Math.round(med * 10) / 10
    }
    const total = a.received + a.sent
    const majorityCategory = topKey(a.categories) as Category | null
    const twoWayReplies = a.repliedByMe > 0 && a.repliedToMe > 0
    const twoWayTraffic = twoWayReplies || (a.received > 0 && a.sent > 0)

    const role = inferRole({
      key,
      domain,
      a,
      total,
      majorityCategory,
      twoWayTraffic,
      ownerWorkDomains,
      ownerSurname,
      name
    })

    // Score: replies both ways matter most, then recency-weighted volume, then account spread.
    let recency = 0
    for (const t of dates) {
      const age = Math.max(0, (nowMs - t) / DAY_MS)
      recency += Math.exp(-age / 60)
    }
    const score =
      3 * (Math.min(a.repliedByMe, 10) + Math.min(a.repliedToMe, 10)) +
      (twoWayReplies ? 10 : 0) +
      Math.min(recency, 40) +
      2 * Math.max(0, a.accounts.size - 1)

    const quietDays = Math.max(0, Math.floor((nowMs - lastMs) / DAY_MS))
    const isNew = role !== 'automated' && a.received >= 2 && nowMs - firstMs <= 21 * DAY_MS

    people.push({
      key,
      name,
      addresses,
      domain,
      received: a.received,
      sent: a.sent,
      repliedByMe: a.repliedByMe,
      repliedToMe: a.repliedToMe,
      firstSeen: new Date(firstMs).toISOString(),
      lastSeen: new Date(lastMs).toISOString(),
      cadenceDays,
      accounts: [...a.accounts].sort(),
      role,
      tier: 'occasional',
      score: Math.round(score * 100) / 100,
      goingQuiet: false,
      quietDays,
      isNew,
      recent30: a.recent30,
      replyHoursByMe: median(a.replyHoursByMe),
      replyHoursToMe: median(a.replyHoursToMe)
    })
  }

  // Tiering.
  people.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key))
  const INNER_MAX = 8
  let innerCount = 0
  for (const p of people) {
    const isQuiet = p.addresses.some((addr) => quiet.has(addr))
    const neverInner = p.role === 'automated' || p.role === 'service'
    const twoWayReplies = p.repliedByMe > 0 && p.repliedToMe > 0
    const twoWayTraffic = twoWayReplies || (p.received > 0 && p.sent > 0)
    if (isQuiet) {
      p.tier = 'occasional'
    } else if (!neverInner && innerCount < INNER_MAX && (twoWayReplies || (p.role === 'family' && twoWayTraffic))) {
      p.tier = 'inner'
      innerCount++
    } else if (twoWayTraffic) {
      p.tier = 'regular'
    } else {
      p.tier = 'occasional'
    }
    if ((p.tier === 'inner' || p.tier === 'regular') && p.cadenceDays !== null) {
      const threshold = Math.max(14, 2.5 * p.cadenceDays)
      p.goingQuiet = p.quietDays > threshold
    }
  }
  return people
}

function safeCategory(fn: (id: string) => Category | undefined, id: string): Category | undefined {
  try {
    return fn(id)
  } catch {
    return undefined
  }
}

interface RoleCtx {
  key: string
  domain: string
  a: Agg
  total: number
  majorityCategory: Category | null
  twoWayTraffic: boolean
  ownerWorkDomains: Set<string>
  ownerSurname: string
  name: string
}

function inferRole(ctx: RoleCtx): PersonRole {
  const { key, domain, a, total, majorityCategory, twoWayTraffic, ownerWorkDomains, ownerSurname, name } = ctx
  const local = key.split('@')[0] ?? ''
  const noReplies = a.repliedByMe === 0 && a.repliedToMe === 0

  // automated: noreply-style address, or List-Unsubscribe on more than half of their mail.
  if (AUTOMATED_LOCAL.test(local)) return 'automated'
  if (a.received > 0 && a.unsubscribe / a.received > 0.5) return 'automated'

  // service: billing/support/appointments style senders and known transactional domains.
  // (Checked before the silence rule so a billing@ address that sends five bills stays "service".)
  if (SERVICE_LOCAL.test(local)) return 'service'
  if (SERVICE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return 'service'

  // automated: ≥5 messages with no reply either way and nothing ever sent to them.
  if (noReplies && a.sent === 0 && total >= 5) return 'automated'

  // colleague by shared work domain.
  if (domain && ownerWorkDomains.has(domain)) return 'colleague'

  // family: kin words in non-work mail, or shared surname in personal mail.
  const isWork = majorityCategory === 'work'
  if (a.kinSignal && !isWork) return 'family'
  if (ownerSurname && majorityCategory === 'personal') {
    const theirSurname = surnameOf(name)
    if (theirSurname && theirSurname === ownerSurname) return 'family'
  }

  if (isWork) {
    if (a.vendorSignal > 0 && a.vendorSignal >= a.clientSignal) return 'vendor'
    if (a.clientSignal > 0) return 'client'
    if (twoWayTraffic) return 'colleague'
    return 'unknown'
  }

  if (majorityCategory === 'personal' && twoWayTraffic) return 'friend'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// VIP + brief summary
// ---------------------------------------------------------------------------

/** Addresses that should always count as important (inner circle), for the VIP skill. */
export function inferVipAddresses(people: Person[]): string[] {
  const out = new Set<string>()
  for (const p of people ?? []) {
    if (!p || p.tier !== 'inner') continue
    if (p.role === 'automated' || p.role === 'service') continue
    for (const a of p.addresses) if (a) out.add(a)
  }
  return [...out]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function clip(s: string, max = 120): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

function shortName(p: Person, max = 40): string {
  const n = (p.name || nameFromAddress(p.key)).trim()
  return n.length > max ? n.slice(0, max - 1).trimEnd() + '…' : n
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "every day", "every ~5 days", "every week", "every 2 weeks", "every month"… */
function everyPhrase(cadenceDays: number): string {
  const d = cadenceDays
  if (d <= 1.5) return 'every day'
  if (d < 6) return `every ~${Math.round(d)} days`
  if (d <= 8.5) return 'every week'
  if (d < 12) return `every ~${Math.round(d)} days`
  if (d <= 17) return 'every 2 weeks'
  if (d < 25) return `every ~${Math.round(d / 7)} weeks`
  if (d <= 38) return 'every month'
  if (d < 80) return `every ~${Math.round(d / 7)} weeks`
  return `every ~${Math.round(d / 30)} months`
}

/** "3 days", "3 weeks", "about a month", "2 months". */
function agoPhrase(days: number): string {
  if (days < 1) return 'less than a day'
  if (days < 14) return plural(Math.round(days), 'day')
  if (days < 45) return plural(Math.round(days / 7), 'week')
  if (days < 75) return 'about a month'
  return plural(Math.round(days / 30), 'month')
}

function replyPhrase(p: Person): string {
  const both = p.repliedByMe > 0 && p.repliedToMe > 0
  const within = (h: number | null | undefined): string | null => {
    if (h === null || h === undefined || !Number.isFinite(h)) return null
    if (h <= 6) return 'within a few hours'
    if (h <= 24) return 'within a day'
    if (h <= 72) return 'within a few days'
    return null
  }
  if (both) {
    const mine = within(p.replyHoursByMe)
    const theirs = within(p.replyHoursToMe)
    if (mine && theirs) {
      const slower = Math.max(p.replyHoursByMe ?? 0, p.replyHoursToMe ?? 0)
      return `you both reply ${within(slower) ?? 'within a few days'}`
    }
    return 'you both reply'
  }
  if (p.repliedByMe > 0) {
    const w = within(p.replyHoursByMe)
    return w ? `you usually reply ${w}` : 'you usually reply'
  }
  if (p.repliedToMe > 0) {
    const w = within(p.replyHoursToMe)
    return w ? `they usually reply ${w}` : 'they usually reply'
  }
  return ''
}

function roleWord(role: PersonRole): string {
  switch (role) {
    case 'family':
      return 'family'
    case 'friend':
      return 'friend'
    case 'colleague':
      return 'colleague'
    case 'client':
      return 'client'
    case 'vendor':
      return 'vendor'
    case 'service':
      return 'service'
    case 'automated':
      return 'automated'
    default:
      return ''
  }
}

function innerNote(p: Person): string {
  const bits: string[] = []
  const recent = p.recent30 ?? 0
  const rw = roleWord(p.role)
  if (rw) bits.push(rw)
  if (recent > 0) bits.push(`${plural(recent, 'email')} this month`)
  else if (p.received + p.sent > 0) bits.push(`last heard ${agoPhrase(p.quietDays)} ago`)
  if (p.cadenceDays !== null && (p.role === 'family' || recent === 0)) bits.push(`writes ${everyPhrase(p.cadenceDays)}`)
  const reply = replyPhrase(p)
  if (reply) bits.push(reply)
  return clip(bits.join(' · '))
}

export function summarizePeople(people: Person[], now: Date): BriefPeople {
  const list = (people ?? []).filter((p): p is Person => !!p)
  const nowMs = now instanceof Date && Number.isFinite(now.getTime()) ? now.getTime() : Date.now()
  const daysSince = (iso: string): number => {
    const t = parseDate(iso)
    return Number.isFinite(t) ? Math.max(0, (nowMs - t) / DAY_MS) : 0
  }

  const inner = list
    .filter((p) => p.tier === 'inner' && p.role !== 'automated' && p.role !== 'service')
    .sort((x, y) => y.score - x.score)
    .slice(0, 6)
    .map((p) => ({
      name: clip(shortName(p), 60),
      address: p.key,
      role: p.role,
      note: innerNote(p)
    }))

  const goingQuiet = list
    .filter((p) => p.goingQuiet && p.cadenceDays !== null && p.role !== 'automated' && p.role !== 'service')
    .sort((x, y) => y.score - x.score)
    .slice(0, 4)
    .map((p) => {
      const days = Math.max(p.quietDays, Math.floor(daysSince(p.lastSeen)))
      return clip(`You usually hear from ${shortName(p, 30)} (${p.key}) ${everyPhrase(p.cadenceDays!)} — it's been ${agoPhrase(days)}.`)
    })

  const newFaces = list
    .filter((p) => p.isNew && p.role !== 'automated')
    .sort((x, y) => y.received - x.received || y.score - x.score)
    .slice(0, 4)
    .map((p) => {
      const org = p.domain && !FREEMAIL_DOMAINS.has(p.domain) ? orgName(p.domain) : ''
      const where = org ? ` at ${org}` : ''
      const since = shortDate(p.firstSeen)
      return clip(`New: ${shortName(p, 30)}${where} (${plural(p.received, 'email')}${since ? ` since ${since}` : ''})`)
    })

  return { inner, goingQuiet, newFaces }
}

function orgName(domain: string): string {
  const parts = domain.split('.').filter(Boolean)
  if (!parts.length) return ''
  // drop TLD(s): example.co.uk → example
  let base = parts[0]
  if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(parts[parts.length - 2])) base = parts[parts.length - 3]
  else if (parts.length >= 2) base = parts[parts.length - 2]
  if (['mail', 'email', 'smtp', 'notifications'].includes(base) && parts.length >= 3) base = parts[parts.length - 2]
  return base.charAt(0).toUpperCase() + base.slice(1)
}
