import type { Skill } from '../types'

const MONEY = '\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?'
const DATE =
  '\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b'
const TIME = '\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)'

/** Watchers for creative, tech and independent people (skill ids start with "k-"). */
export const CREATIVE_SKILLS: Skill[] = [
  {
    id: 'k-bookings',
    name: 'Bookings & sessions',
    icon: '🗓️',
    description: 'Gathers session bookings, class reservations, reschedules, and no-shows into one list with dates.',
    defaultFor: ['photographer', 'studio', 'coach', 'restaurant'],
    match: [
      'booking (?:confirmed|request|received|cancel)',
      'new booking',
      'booked (?:a|an|your) (?:session|class|appointment|table)',
      'class (?:booked|reserved|waitlist)',
      'session (?:booked|confirmed|reschedul|request)',
      'reservation (?:for|confirmed|cancel|request)',
      'party of \\d+',
      'no[- ]show',
      'late cancel',
      'reschedule (?:our|my|the|this) (?:session|class|appointment|shoot|lesson)',
      'inquiry for (?:your|a|an) (?:session|shoot|class)'
    ],
    senderMatch: ['@mindbodyonline\\.com', '@vagaro\\.com', '@honeybook\\.com', '@acuityscheduling\\.com', '@calendly\\.com', '@opentable\\.com', '@resy\\.com'],
    extractors: [
      { field: 'when', pattern: `(${DATE}[^\\n.]{0,20}?${TIME}|${DATE}|${TIME})`, flags: 'i' },
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' }
    ],
    urgentWhen: ['today', 'tomorrow', 'tonight', 'no[- ]show', 'cancel', 'double[- ]book'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {when} ({from})',
    sectionTitle: 'Bookings & sessions',
    promptHint: 'Every booking, session, class, or reservation goes in the deadlines list with its date and time; cancellations and no-shows are issues.'
  },
  {
    id: 'k-orders',
    name: 'Orders, returns & chargebacks',
    icon: '🛒',
    description: 'Watches marketplace orders, return and refund requests, chargebacks, and low-stock warnings.',
    defaultFor: ['ecommerce'],
    match: [
      'new order',
      'order #\\s?\\d{3,}',
      'return request',
      'refund request',
      'chargeback',
      'payment dispute',
      'a-to-z claim',
      'item not received',
      'low stock',
      'out of stock',
      'restock',
      'unfulfilled order',
      'listing (?:suspended|removed|deactivated)',
      'account health',
      'payout (?:hold|delayed|failed)'
    ],
    senderMatch: ['noreply@.*shopify', '@etsy\\.com', 'seller-notification@amazon', '@ebay\\.com', '@woocommerce\\.com'],
    extractors: [
      { field: 'orderId', pattern: 'order\\s?#?\\s?([A-Z0-9-]{4,})', flags: 'i' },
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `(?:respond|reply|resolve|before|by) (?:by |on )?(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['chargeback', 'dispute', 'suspended', 'account health', 'respond (?:by|within)', 'policy violation', 'payout (?:hold|failed)'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — order {orderId} {amount} · respond by {dueDate} ({from})',
    sectionTitle: 'Orders & returns',
    promptHint: 'Chargebacks, disputes, and marketplace warnings are issues with a response deadline; extract the order number and any respond-by date exactly.'
  },
  {
    id: 'k-incidents',
    name: 'Alerts, outages & tickets',
    icon: '🚨',
    description: 'Catches on-call pages, failed builds and backups, security alerts, and tickets waiting on you.',
    defaultFor: ['developer', 'itadmin'],
    match: [
      'pagerduty',
      'opsgenie',
      '\\bincident\\b',
      'alert(?:s)? (?:triggered|firing|resolved)',
      'build failed',
      'pipeline failed',
      'deploy(?:ment)? failed',
      'service (?:down|degraded|unavailable)',
      'ticket #?\\s?\\d{3,}',
      'new ticket',
      'ticket (?:assigned|escalated|reopened)',
      'sla (?:breach|warning)',
      'backup (?:failed|error)',
      'security (?:alert|advisory)',
      'dependabot',
      'vulnerability',
      'pull request (?:review requested|changes requested)',
      'review requested'
    ],
    senderMatch: ['@pagerduty\\.com', '@opsgenie\\.net', 'notifications@github\\.com', '@sentry\\.io', '@datadoghq\\.com', '@statuspage\\.io'],
    extractors: [
      { field: 'ticket', pattern: '(?:ticket|incident|case|inc)\\s?#?\\s?([A-Z]{0,4}-?\\d{3,})', flags: 'i' },
      { field: 'severity', pattern: '\\b(sev ?[0-4]|p[0-4]|critical|high|medium|low)\\b', flags: 'i' }
    ],
    urgentWhen: ['sev ?[01]', '\\bp[01]\\b', 'critical', '\\bdown\\b', 'outage', 'breach', 'ransomware', 'compromised', 'production'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {ticket} {severity} ({from})',
    sectionTitle: 'Alerts & tickets',
    promptHint: 'Incidents, failed builds, failed backups, and security alerts are issues; the next step is to investigate or acknowledge them. Resolved alerts are informational.'
  },
  {
    id: 'k-gigs',
    name: 'Gigs, shoots & contracts',
    icon: '🎤',
    description: 'Tracks gig and shoot confirmations, contracts, call times, and fees so every date is on the list.',
    defaultFor: ['musician', 'photographer', 'designer'],
    match: [
      '\\bgigs?\\b',
      'setlist',
      'set list',
      'soundcheck',
      'load[- ]in',
      'call time',
      '\\bvenue\\b',
      'booking fee',
      'performance (?:fee|agreement|contract)',
      'contract (?:attached|signed|for your|to sign|ready)',
      'shoot (?:date|confirmed|day|timeline)',
      'shot list',
      'deposit (?:due|received|to hold)',
      'tech rider',
      'statement of work'
    ],
    senderMatch: ['@gigsalad\\.com', '@thebash\\.com', '@honeybook\\.com', '@dubsado\\.com', '@docusign\\.net', '@hellosign\\.com'],
    extractors: [
      { field: 'when', pattern: `(${DATE})`, flags: 'i' },
      { field: 'callTime', pattern: `(?:call time|load[- ]in|soundcheck|arrive)[^\\n]{0,15}?(${TIME})`, flags: 'i' },
      { field: 'fee', pattern: `(${MONEY})`, flags: 'i' }
    ],
    urgentWhen: ['cancel', 'tonight', 'tomorrow', 'deposit due', 'sign by', 'need (?:an )?answer', 'still available'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {when} · call {callTime} · {fee} ({from})',
    sectionTitle: 'Gigs & contracts',
    promptHint: 'Each gig, shoot, or contract is a tracked entity with a date and fee; unsigned contracts and unpaid deposits are issues.'
  },
  {
    id: 'k-collabs',
    name: 'Pitches, sponsors & brand deals',
    icon: '🤝',
    description: 'Surfaces editor replies, sponsorship and brand-deal offers, and collaboration requests with their deadlines.',
    defaultFor: ['writer', 'designer', 'photographer', 'musician'],
    match: [
      'sponsorship',
      'sponsored (?:post|content|video|segment)',
      'brand (?:deal|partnership|collab)',
      'paid partnership',
      'partnership opportunity',
      'collab(?:oration)? (?:request|opportunity|proposal)',
      'affiliate (?:program|link|commission)',
      'media kit',
      'your pitch',
      'pitch (?:accepted|declined|received)',
      'we(?:\'d| would) love to (?:feature|work with|partner)',
      'byline',
      'draft (?:due|deadline)',
      'usage rights',
      'licensing (?:request|inquiry)'
    ],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `(?:deadline|due|by|respond by|before)[:\\s]+(?:on |by )?(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['deadline', 'draft due', 'respond by', 'expires', 'final call', 'last chance to confirm'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{from}: {subject} — {amount} · due {dueDate}',
    sectionTitle: 'Pitches & partnerships',
    promptHint: 'Sponsorship and brand-deal offers, editor replies, and collaboration requests need a reply; note the fee and any deadline. Mass marketing that only looks like an offer is noise.'
  },
  {
    id: 'k-reviews',
    name: 'Reviews & ratings',
    icon: '⭐',
    description: 'Spots new customer reviews and ratings so the bad ones get a reply and the good ones get a thank-you.',
    defaultFor: ['ecommerce', 'restaurant', 'studio', 'coach'],
    match: [
      'new review',
      'left (?:you )?a (?:review|rating)',
      'review (?:posted|received|published)',
      '\\d[- ]star (?:review|rating)',
      'rated (?:you|your business|their (?:visit|order|experience))',
      'seller feedback',
      'product review',
      'yelp',
      'google (?:business|review)',
      'tripadvisor',
      'trustpilot',
      'testimonial',
      'reply to (?:this|the|your) review'
    ],
    senderMatch: ['@yelp\\.com', 'business-noreply@google\\.com', '@tripadvisor\\.com', '@trustpilot\\.com'],
    extractors: [{ field: 'stars', pattern: '(\\d(?:\\.\\d)?)[- ]star', flags: 'i' }],
    urgentWhen: ['[12][- ]star', 'negative review', 'complaint', 'refund', 'never again', 'health (?:code|violation)', 'rude'],
    minImportance: 1,
    forceCategory: 'work',
    lineTemplate: '{stars}-star review — {subject} ({from})',
    sectionTitle: 'Reviews',
    promptHint: 'A review of 1 or 2 stars is an issue whose next step is a public reply; 4 and 5 stars are good news worth a thank-you.'
  },
  {
    id: 'k-renewals',
    name: 'Domains, licences & subscriptions',
    icon: '🔑',
    description: 'Watches domain, certificate, software licence, and subscription renewals so nothing quietly expires.',
    defaultFor: ['developer', 'itadmin', 'designer'],
    match: [
      'domain (?:expir|renew|will expire|is expiring)',
      'ssl certificate',
      'certificate (?:expir|renew)',
      'licen[cs]e (?:expir|renew|key)',
      'subscription (?:renew|expir|ending|will end)',
      'your plan (?:renews|expires|has been)',
      'renewal (?:notice|reminder|invoice)',
      'trial (?:ends|ending|expires)',
      'seats? (?:added|removed|limit)',
      'quota (?:exceeded|warning|limit)',
      'usage limit'
    ],
    senderMatch: ['@namecheap\\.com', '@godaddy\\.com', '@cloudflare\\.com', '@adobe\\.com', '@figma\\.com', '@atlassian\\.com', '@jetbrains\\.com', 'letsencrypt'],
    extractors: [
      { field: 'dueDate', pattern: `(?:expires?|renews?|ends?|due)[^\\n]{0,12}?(?:on |by )?(${DATE})`, flags: 'i' },
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' }
    ],
    urgentWhen: ['expires? (?:today|tomorrow|in \\d days?)', 'final (?:notice|reminder)', 'suspended', 'payment failed', 'quota exceeded'],
    minImportance: 2,
    lineTemplate: '{subject} — {amount} · renews {dueDate} ({from})',
    sectionTitle: 'Renewals & subscriptions',
    promptHint: 'Expiring domains, certificates, and licences are deadlines with the exact expiry date; routine paid-renewal receipts are informational.'
  }
]
