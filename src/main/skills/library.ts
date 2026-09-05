import type { Skill } from './types'

const MONEY = '\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?'
const DATE =
  '\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b'

/** Built-in skills. Ordered roughly by how universal they are. */
export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'vip',
    name: 'Important people',
    icon: '⭐',
    description: 'Anything from people you name is always treated as important.',
    defaultFor: ['owner', 'realestate', 'utility', 'general'],
    match: [], // populated at runtime from settings.vipSenders
    minImportance: 3,
    lineTemplate: '{from}: {subject}',
    sectionTitle: 'From important people'
  },
  {
    id: 'bills',
    name: 'Bills & invoices',
    icon: '💵',
    description: 'Spots bills, invoices, and payment due dates so nothing goes overdue.',
    defaultFor: ['owner', 'realestate', 'utility', 'general'],
    match: ['\\binvoice\\b', '\\bbill(?:ing)? (?:is )?(?:due|ready|statement)', 'payment (?:due|reminder|overdue)', 'amount due', 'past due', 'autopay'],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `due (?:on |by )?(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['past due', 'overdue', 'final notice', 'disconnect'],
    minImportance: 2,
    lineTemplate: '{subject} — {amount} due {dueDate} ({from})',
    sectionTitle: 'Bills & invoices',
    promptHint: 'Bills and invoices are always actionable; extract the amount and due date exactly.'
  },
  {
    id: 'appointments',
    name: 'Appointments & meetings',
    icon: '📅',
    description: 'Collects appointments, meetings, and confirmations into one list of upcoming dates.',
    defaultFor: ['owner', 'realestate', 'utility', 'general'],
    match: ['appointment', 'meeting (?:invite|request|scheduled)', 'confirm(?:ed|ation) (?:for|of) your', 'reschedul', 'calendar invite', 'see you (?:on|at)'],
    extractors: [
      { field: 'when', pattern: `(${DATE}[^\\n.]{0,20}?\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)?|\\d{1,2}(?::\\d{2})?\\s?(?:am|pm))`, flags: 'i' }
    ],
    urgentWhen: ['today', 'tomorrow', 'cancel'],
    minImportance: 2,
    lineTemplate: '{subject} — {when} ({from})',
    sectionTitle: 'Appointments',
    promptHint: 'Put every appointment or meeting time in the deadlines list with its date and time.'
  },
  {
    id: 'deals',
    name: 'Real-estate deals',
    icon: '🏠',
    description: 'Tracks offers, contingencies, inspections, escrow and closing dates for each property.',
    defaultFor: ['realestate'],
    match: ['\\boffer\\b', 'counter ?offer', 'escrow', 'earnest money', 'contingenc', 'inspection', 'appraisal', 'closing (?:date|disclosure)', '\\bmls\\b', 'under contract', 'listing agreement', 'title company'],
    extractors: [
      { field: 'mls', pattern: 'mls\\s?#?\\s?(\\d{6,9})', flags: 'i' },
      { field: 'address', pattern: '(\\d{2,6} [A-Z][a-zA-Z]+ (?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Ct|Court|Way|Pl|Place)\\b\\.?)', flags: '' },
      { field: 'date', pattern: `(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['contingency (?:expires|deadline)', 'closing (?:is )?(?:tomorrow|today)', 'signature (?:needed|required)', 'expires'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{address} — {subject} {date} ({from})',
    sectionTitle: 'Deal pipeline',
    promptHint: 'Track each property as its own deal with a stage: listed, offer, under contract/escrow, closed.'
  },
  {
    id: 'fieldops',
    name: 'Work orders & compliance',
    icon: '🦺',
    description: 'Watches work orders, shift changes, safety bulletins, and mandatory training deadlines.',
    defaultFor: ['utility'],
    match: ['work order', 'shift (?:change|swap|schedule)', 'safety (?:bulletin|alert|notice)', 'outage', 'mandatory training', 'compliance', 'certification (?:expir|renew)', 'lockout', 'tailboard', 'osha'],
    extractors: [
      { field: 'workOrder', pattern: '(?:work order|wo)\\s?#?\\s?([A-Z0-9-]{4,})', flags: 'i' },
      { field: 'dueDate', pattern: `(?:due|by|before|complete by) (${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['mandatory', 'immediately', 'safety alert', 'outage', 'expir'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} {workOrder} — due {dueDate} ({from})',
    sectionTitle: 'Operations & compliance',
    promptHint: 'Compliance and training deadlines are always issues; schedule and shift changes are always actionable.'
  },
  {
    id: 'shipping',
    name: 'Orders & deliveries',
    icon: '📦',
    description: 'Pulls tracking numbers and delivery dates from order and shipping emails.',
    defaultFor: ['general', 'owner'],
    match: ['tracking number', 'has shipped', 'out for delivery', 'delivered', 'your order', 'shipment'],
    extractors: [
      { field: 'tracking', pattern: '\\b(1Z[0-9A-Z]{16}|\\d{12,22}|[A-Z]{2}\\d{9}[A-Z]{2})\\b', flags: '' },
      { field: 'eta', pattern: `(?:arriv|deliver)[a-z]* (?:by |on )?(${DATE}|today|tomorrow|[a-z]+day)`, flags: 'i' }
    ],
    minImportance: 1,
    lineTemplate: '{subject} — arriving {eta} ({from})',
    sectionTitle: 'Deliveries'
  },
  {
    id: 'travel',
    name: 'Travel',
    icon: '✈️',
    description: 'Gathers flight, hotel, and rental confirmations with their dates and confirmation codes.',
    defaultFor: ['owner', 'general'],
    match: ['flight', 'boarding pass', 'itinerary', 'hotel (?:reservation|confirmation)', 'check-in', 'rental car', 'confirmation (?:code|number)'],
    extractors: [
      { field: 'code', pattern: 'confirmation (?:code|number|#)[:\\s]+([A-Z0-9]{5,8})', flags: 'i' },
      { field: 'date', pattern: `(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['cancel', 'delay', 'gate change', 'check-in (?:now|open)'],
    minImportance: 2,
    lineTemplate: '{subject} — {date} · code {code}',
    sectionTitle: 'Travel'
  },
  {
    id: 'family',
    name: 'School & family',
    icon: '🎒',
    description: 'Keeps school notices, permission slips, and family events from getting buried.',
    defaultFor: ['general'],
    match: ['permission slip', 'school', 'teacher', 'pta', 'field trip', 'report card', 'parent[- ]teacher', 'practice (?:is|has been)', 'recital', 'birthday party'],
    extractors: [{ field: 'date', pattern: `(${DATE})`, flags: 'i' }],
    urgentWhen: ['due (?:today|tomorrow)', 'sign and return', 'closed tomorrow', 'early dismissal'],
    minImportance: 2,
    forceCategory: 'personal',
    lineTemplate: '{subject} — {date} ({from})',
    sectionTitle: 'School & family'
  },
  {
    id: 'health',
    name: 'Health',
    icon: '🩺',
    description: 'Notices doctor appointments, prescriptions, and lab results (flagged as private).',
    defaultFor: ['general'],
    match: ['doctor', 'dentist', 'prescription', 'pharmacy', 'lab results?', 'patient portal', 'insurance claim', 'refill'],
    extractors: [{ field: 'date', pattern: `(${DATE})`, flags: 'i' }],
    urgentWhen: ['results? (?:are|is) (?:ready|available)', 'refill (?:due|ready)', 'appointment (?:today|tomorrow)'],
    minImportance: 2,
    forceCategory: 'personal',
    lineTemplate: '{subject} — {date} ({from})',
    sectionTitle: 'Health'
  },
  {
    id: 'jobsearch',
    name: 'Job search',
    icon: '💼',
    description: 'Follows applications, interview invitations, and offers.',
    defaultFor: [],
    match: ['your application', 'interview', 'offer letter', 'recruiter', 'position (?:at|with)', 'next steps in (?:the|our) (?:hiring|interview)'],
    extractors: [{ field: 'date', pattern: `(${DATE})`, flags: 'i' }],
    urgentWhen: ['interview', 'offer', 'respond by'],
    minImportance: 2,
    lineTemplate: '{subject} — {date} ({from})',
    sectionTitle: 'Job search'
  },
  {
    id: 'customers',
    name: 'Customer requests',
    icon: '🙋',
    description: 'Surfaces customer questions, complaints, and quote requests that need a reply.',
    defaultFor: ['owner'],
    match: ['quote', 'estimate', 'complaint', 'refund', 'not working', 'issue with', 'can you (?:help|come|fix)', 'how much (?:would|does|for)', 'availability'],
    urgentWhen: ['complaint', 'refund', 'unacceptable', 'cancel my', 'still waiting'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{from}: {subject}',
    sectionTitle: 'Customers waiting on you',
    promptHint: 'Customer complaints and quote requests are high-priority issues with a reply as the next step.'
  }
]
