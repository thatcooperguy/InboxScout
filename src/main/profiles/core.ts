import type { WorkProfile } from './profiles'

/** The four original profiles, kept with their ids so existing settings keep working. */
export const CORE_PROFILES: WorkProfile[] = [
  {
    id: 'owner',
    name: 'Business owner / executive',
    group: 'business',
    icon: '🏢',
    tagline: 'You run a company: vendors, customers, staff, money, contracts.',
    pulseName: 'Company Pulse',
    workDescription:
      'The user owns or runs a company. Work mail includes vendors, customers, finance, banking, ' +
      'legal, staff and HR matters, contracts, invoices, and anything about company operations or projects.',
    urgencyHints: [
      'contract or renewal deadlines',
      'customer escalations and complaints',
      'payments, invoices, or payroll problems',
      'anything a staff member is blocked on and waiting for the owner to approve'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'customers', 'shipping', 'travel'],
    signals: [
      { pattern: '\\b(payroll|quickbooks|gusto|adp)\\b', weight: 2 },
      { pattern: '\\b(vendor|supplier|purchase order|net 30|w-9|1099)\\b', weight: 2 },
      { pattern: '\\b(llc|inc\\.?|corp|s-corp|ein|business license|sales tax)\\b', weight: 2 },
      { pattern: '\\b(our team|the team|staff meeting|new hire|onboarding|offer letter)\\b' },
      { pattern: '\\b(contract|msa|sow|proposal|renewal)\\b' },
      { pattern: '\\b(customer|client) (?:complaint|escalation|feedback)\\b', weight: 2 },
      { pattern: '\\b(stripe|square|shopify|paypal business|merchant)\\b' },
      { pattern: '\\b(board meeting|investor|cap table|p&l|profit and loss)\\b', weight: 3 }
    ]
  },
  {
    id: 'realestate',
    name: 'Real-estate agent',
    group: 'trades',
    icon: '🏠',
    tagline: 'Buyers, sellers, listings, showings, offers, escrow, closings.',
    pulseName: 'Deal Pipeline',
    workDescription:
      'The user is a real-estate agent. Work mail includes clients (buyers and sellers), listings, showings, ' +
      'offers and counteroffers, lenders, title companies, inspectors, appraisers, escrow, MLS notices, and brokerage matters. ' +
      'Track each active deal as its own entity, named by property address or client, with a stage: ' +
      'listed, offer, under contract / escrow, or closed.',
    urgencyHints: [
      'expiring contingencies or option periods',
      'closing dates approaching',
      'unanswered client messages',
      'missing documents or signatures',
      'inspection and appraisal scheduling'
    ],
    entityNoun: 'deal',
    defaultSkills: ['vip', 'bills', 'appointments', 'deals'],
    signals: [
      { pattern: '\\b(mls|showing(?:s| request| time)|listing agreement|open house)\\b', weight: 3 },
      { pattern: '\\b(escrow|earnest money|contingenc(?:y|ies)|counter ?offer|under contract)\\b', weight: 3 },
      { pattern: '\\b(title company|closing disclosure|appraisal|home inspection|buyer(?:\'s)? agent|seller(?:\'s)? agent)\\b', weight: 2 },
      { pattern: '\\b(brokerage|broker|realtor|zillow|redfin|showingtime|dotloop|docusign)\\b', weight: 2 },
      { pattern: '\\b(lender|pre-?approval|mortgage broker|loan officer)\\b' },
      { pattern: '\\b(comps|cma|price reduction|days on market)\\b', weight: 2 },
      { pattern: '\\b(buyer|seller) (?:consultation|lead|inquiry)\\b', weight: 2 },
      { pattern: '\\b(lockbox|supra|keybox|sign rider|yard sign)\\b', weight: 3 },
      { pattern: '\\b(commission (?:split|check|statement)|referral fee|brokerage fee)\\b', weight: 2 },
      { pattern: '\\b(disclosure(?:s)? (?:packet|package)|seller(?:\'s)? disclosure|purchase agreement)\\b', weight: 2 }
    ]
  },
  {
    id: 'utility',
    name: 'Utility / field professional',
    group: 'trades',
    icon: '⚡',
    tagline: 'Shifts, outages, work orders, safety bulletins, training deadlines.',
    pulseName: 'Operations Pulse',
    workDescription:
      'The user works for a utility or field-operations company (for example a power company). Work mail includes ' +
      'shift and schedule notices, outage and safety bulletins, work orders, compliance and mandatory training deadlines, ' +
      'union or HR notices, and vendor or equipment matters.',
    urgencyHints: [
      'compliance or training due dates',
      'urgent directives from supervisors',
      'schedule or shift changes',
      'safety bulletins requiring acknowledgment'
    ],
    entityNoun: 'job',
    defaultSkills: ['vip', 'bills', 'appointments', 'fieldops'],
    signals: [
      { pattern: '\\b(outage|substation|lineman|lineworker|transformer|feeder|circuit|kv)\\b', weight: 3 },
      { pattern: '\\b(work order|tailboard|lockout|tagout|osha|safety bulletin|near miss)\\b', weight: 2 },
      { pattern: '\\b(shift (?:swap|change|schedule)|on[- ]call|storm duty|overtime)\\b', weight: 2 },
      { pattern: '\\b(mandatory training|certification (?:expir|renew)|compliance training|ferc|nerc)\\b', weight: 2 },
      { pattern: '\\b(union|local \\d{2,4}|ibew|steward|grievance)\\b', weight: 2 },
      { pattern: '\\b(dispatch|crew|fleet|truck \\d+|meter)\\b' },
      { pattern: '\\b(bucket truck|digger derrick|hot stick|rubber gloves|arc flash|ppe)\\b', weight: 3 },
      { pattern: '\\b(gas main|water main|pipeline|right[- ]of[- ]way|easement|vegetation management)\\b', weight: 2 },
      { pattern: '\\b(smart meter|scada|switching order|clearance|de-?energiz)\\b', weight: 3 },
      { pattern: '\\b(mutual aid|storm restoration|restoration crew|call[- ]out list)\\b', weight: 3 }
    ]
  },
  {
    id: 'general',
    name: 'General professional',
    group: 'life',
    icon: '👤',
    tagline: 'A job, a household, and an inbox — the sensible default.',
    pulseName: 'Work Pulse',
    workDescription:
      'The user is a working professional. Work mail is anything from their employer, colleagues, clients, or ' +
      'professional services; personal mail is family, friends, household, health, and personal finance.',
    urgencyHints: ['deadlines', 'messages waiting on a reply from the user', 'meeting requests needing an answer'],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'shipping', 'travel', 'family', 'health'],
    signals: []
  }
]
