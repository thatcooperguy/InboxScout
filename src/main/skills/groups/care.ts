import type { Skill } from '../types'

const MONEY = '\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?'
const DATE =
  '\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b'
const TIME = '\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)'

/**
 * Watchers for health, education & public-service people: shifts, licences,
 * grades and testing, grants and pledges, patient-portal notices, tuition and
 * aid, and client sessions. They extract dates, amounts, and reference ids only.
 */
export const CARE_SKILLS: Skill[] = [
  {
    id: 'c-shifts',
    name: 'Shifts & schedules',
    icon: '🕐',
    description: 'Catches shift schedules, open shifts, overtime, call coverage, and time-off answers.',
    defaultFor: ['nurse', 'physician', 'childcare', 'schooladmin'],
    match: [
      'shift (?:bid|swap|change|schedule|pick-?up|coverage|open|assignment)',
      'open shifts?',
      'schedule (?:for next|is posted|has been posted|change|has changed)',
      'overtime (?:available|request|approved|mandat)',
      'on-?call (?:schedule|coverage)',
      'call schedule',
      'staffing (?:need|shortage|request)',
      'time-?off (?:request|approved|denied)',
      'pto (?:request|approved|denied)',
      'self-?schedul',
      'float(?:ing)? to',
      'low census',
      'call-?off',
      '\\b(?:kronos|ukg|shiftwizard|nursegrid|qgenda|when i work|homebase)\\b'
    ],
    extractors: [
      { field: 'when', pattern: `(${DATE}[^\\n.]{0,20}?${TIME}|${DATE}|${TIME})`, flags: 'i' },
      { field: 'shift', pattern: '\\b(day shift|night shift|evening shift|nights?|days?|weekend|\\d{1,2}(?::\\d{2})?\\s?(?:a|p)m?\\s?-\\s?\\d{1,2}(?::\\d{2})?\\s?(?:a|p)m?)\\b', flags: 'i' }
    ],
    urgentWhen: ['mandat(?:ed|ory)', '\\b(?:today|tonight|tomorrow)\\b', 'schedule (?:change|has changed)', 'respond by', 'bid (?:closes|deadline)', 'uncovered'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {when} {shift} ({from})',
    sectionTitle: 'Shifts & schedules',
    promptHint: 'Schedule changes and open-shift or bid windows are actionable; put every shift date and time in the deadlines list.'
  },
  {
    id: 'c-credentials',
    name: 'Licences & renewals',
    icon: '📜',
    description: 'Watches licence, certification, CE/CME, background-check, and mandatory-training renewals.',
    defaultFor: ['nurse', 'physician', 'therapist', 'teacher', 'childcare', 'government'],
    match: [
      'licen[sc]e (?:renewal|expir|is due|renew|verification)',
      'renew your (?:license|licence|certification|registration|credential)',
      'certification (?:expir|renew|is due|lapse)',
      '\\b(?:ce|cme|ceu)s? (?:credits?|hours|requirement|deadline|due|report)',
      'contact hours',
      'continuing education',
      '\\b(?:acls|bls|pals|cpr|first aid) (?:renewal|expir|card|class|certification)',
      'dea (?:registration|renewal)',
      're-?credentialing',
      'credentialing (?:application|packet|renewal|expir)',
      'background check (?:renewal|expir|due|required)',
      'fingerprint',
      'teaching (?:license|certificate|credential)',
      'clearance (?:expir|renew)',
      'board (?:certification|recertification)',
      'mandatory training (?:due|overdue|deadline)',
      'annual (?:ethics|compliance|hipaa|safety) training'
    ],
    extractors: [
      { field: 'dueDate', pattern: `(?:expires?|expiring|expiration(?: date)?|due|renew(?:al)? by|before|no later than|deadline)(?: on| is|:)? (${DATE})`, flags: 'i' },
      { field: 'credential', pattern: '\\b((?:rn|lpn|lvn|cna|lcsw|lmft|lpc|md|do|dds|dvm|acls|bls|pals|cpr|dea|cme|ceu|npi) ?(?:license|licence|certification|registration|renewal|credits?|hours)?)\\b', flags: 'i' }
    ],
    urgentWhen: ['expir(?:es|ed|ing) (?:today|tomorrow|this week|in \\d+ days)', '\\blapsed?\\b', 'final (?:notice|reminder)', 'past due', 'suspend', 'inactive status'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {credential} due {dueDate} ({from})',
    sectionTitle: 'Licences & renewals',
    promptHint: 'A lapsed licence or certification can stop this person working; every renewal date is an issue with the date as the deadline.'
  },
  {
    id: 'c-grades',
    name: 'Grades, testing & IEPs',
    icon: '📝',
    description: 'Tracks grades due, report cards, testing windows, IEP and 504 meetings, and conferences.',
    defaultFor: ['teacher', 'professor', 'schooladmin', 'student'],
    match: [
      'grades? (?:are )?due',
      'gradebook',
      'grading (?:period|deadline|window)',
      'report cards?',
      'progress reports?',
      'iep (?:meeting|review|due|draft|annual)',
      '504 (?:meeting|plan)',
      'testing window',
      'state (?:testing|assessment)',
      'standardized test',
      'benchmark (?:assessment|testing)',
      '\\b(?:map testing|nwea|i-?ready|star assessment)\\b',
      'parent[- ]teacher conference',
      'conference (?:sign-?ups?|schedule|night)',
      '(?:final|midterm) grades?',
      'grade submission',
      'course evaluations?',
      'end of (?:quarter|semester|term|marking period)',
      'marking period',
      'exam schedule'
    ],
    extractors: [
      { field: 'dueDate', pattern: `(?:due|by|deadline|closes?|window closes?|submitted by|no later than)(?: on| is|:)? (${DATE})`, flags: 'i' },
      { field: 'when', pattern: `(${DATE}[^\\n.]{0,20}?${TIME})`, flags: 'i' }
    ],
    urgentWhen: ['due (?:today|tomorrow|by (?:end of|eod))', 'overdue', 'missing grades', 'final reminder', 'meeting (?:today|tomorrow)'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — due {dueDate} {when} ({from})',
    sectionTitle: 'Grades, testing & meetings',
    promptHint: 'Grade deadlines, testing windows, and IEP or 504 meetings always go in the deadlines list; refer to students by initials only.'
  },
  {
    id: 'c-grants',
    name: 'Grants, donors & pledges',
    icon: '🎁',
    description: 'Follows grant deadlines and reports, donor gifts, pledges, and fundraising campaigns.',
    defaultFor: ['nonprofit', 'professor', 'government', 'clergy', 'schooladmin'],
    match: [
      'grant (?:deadline|report|application|proposal|award|renewal|cycle|agreement|due|opportunity)',
      'letter of inquiry',
      '\\bloi\\b',
      'funding opportunity',
      '\\b(?:nofo|foa|rfp|rfa)\\b',
      '(?:progress|final|interim) report (?:due|for|is)',
      'no-?cost extension',
      'pledge (?:reminder|payment|received|form|card|balance)',
      '\\bdonor\\b',
      'donation (?:received|receipt|of)',
      'gift (?:received|acknowledg)',
      'matching gift',
      'annual appeal',
      'capital campaign',
      'fundrais',
      'sponsorship',
      'foundation (?:grant|award|funding)'
    ],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `(?:due|deadline|submit(?:ted)? by|no later than|by|closes?)(?: on| is|:)? (${DATE})`, flags: 'i' },
      { field: 'grantId', pattern: '(?:grant|award|proposal|application) (?:#|no\\.?|number|id)[:\\s]*([A-Z0-9-]{4,})', flags: 'i' }
    ],
    urgentWhen: ['due (?:today|tomorrow|this week)', 'deadline (?:extended to|is) (?:today|tomorrow)', 'final reminder', 'overdue', 'award (?:letter|notification|decision)', 'not funded', 'declined'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {amount} due {dueDate} ({from})',
    sectionTitle: 'Grants, donors & pledges',
    promptHint: 'Grant and report deadlines are issues; donor and funder messages get a reply as the next step. Extract amounts and dates exactly.'
  },
  {
    id: 'c-portal',
    name: 'Portal, referral & prior-auth notices',
    icon: '🗂️',
    description: 'Spots patient-portal, referral, prior-authorization, and claim notices; keeps only dates and reference numbers.',
    defaultFor: ['physician', 'therapist', 'nurse'],
    match: [
      'prior auth(?:orization)?',
      'pre-?authorization',
      'authorization (?:approved|denied|pending|required|request|expir)',
      'referral (?:received|pending|request|sent|approved|expir|order)',
      'patient portal',
      'portal message',
      'new message in (?:your|the) portal',
      'claim (?:denied|denial|rejected|pending|status)',
      '\\b(?:cpt|icd-?10)\\b',
      'peer-?to-?peer',
      'medical records? request',
      'records? release',
      'lab (?:orders?|results?) (?:pending|ready|need)',
      'unsigned (?:notes|orders|encounters)',
      'results? (?:pending|ready) (?:for|in)',
      'inbasket|in-?basket'
    ],
    extractors: [
      { field: 'refId', pattern: '(?:auth(?:orization)?|reference|ref|case|referral|claim|request|order) (?:#|no\\.?|number|id)[:\\s]*([A-Z0-9-]{5,})', flags: 'i' },
      { field: 'dueDate', pattern: `(?:expires?|valid (?:through|until)|respond by|due|by|before)(?: on|:)? (${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['denied|denial', 'expir(?:es|ing) (?:today|tomorrow|soon|this week)', '\\bstat\\b', '\\burgent\\b', 'peer-?to-?peer', 'critical (?:result|value)', 'final (?:notice|request)'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — ref {refId} · by {dueDate} ({from})',
    sectionTitle: 'Portal, referrals & authorizations',
    promptHint: 'These are work notices about patients: report only status, dates, and reference numbers; never repeat names, diagnoses, or other patient details in the brief.'
  },
  {
    id: 'c-tuition',
    name: 'Tuition, aid & registration',
    icon: '🎒',
    description: 'Keeps financial-aid, tuition, registration, housing, and drop deadlines in one place.',
    defaultFor: ['student'],
    match: [
      'financial aid',
      '\\bfafsa\\b',
      'tuition (?:due|bill|payment|statement|balance)',
      '\\bbursar\\b',
      '\\bregistrar\\b',
      'student account',
      'registration (?:opens?|closes?|deadline|hold|window|is now open)',
      'register for (?:classes|courses)',
      'add/drop|add-drop|drop deadline|withdrawal deadline',
      'scholarship (?:award|application|renewal|deadline|disbursement)',
      'loan (?:disbursement|servicer|payment|exit counseling)',
      'enrollment (?:verification|deposit)',
      'housing (?:deposit|application|contract|deadline|selection)',
      'meal plan',
      'hold on your (?:account|registration)',
      'graduation application|apply to graduate'
    ],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `(?:due|deadline|by|before|no later than|closes?|last day)(?: on| is| to [a-z ]{3,20}| for [a-z ]{3,20})?(?::)? (${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['hold on your', 'past due|overdue', 'last day to', 'deadline (?:today|tomorrow)', 'will be dropped|dropped from', 'disbursement (?:delayed|cancel)', 'late fee'],
    minImportance: 2,
    lineTemplate: '{subject} — {amount} by {dueDate} ({from})',
    sectionTitle: 'Tuition, aid & registration',
    promptHint: 'Aid, tuition, registration, and housing deadlines are always issues; a hold on the account is urgent because it blocks registration.'
  },
  {
    id: 'c-sessions',
    name: 'Sessions, intakes & enrollments',
    icon: '🗓️',
    description: 'Gathers client sessions, intakes, cancellations, supervision, and new-family enrollments.',
    defaultFor: ['therapist', 'childcare', 'clergy'],
    match: [
      'intake (?:form|paperwork|packet|session|appointment|call)',
      'new client (?:inquiry|referral|intake)',
      'session (?:reminder|confirmed|cancell?ed|cancell?ation|request|notes|scheduled)',
      'no-?show',
      'late cancel',
      'superbill',
      'treatment plan (?:due|review)',
      'supervision (?:hours|session|log)',
      'telehealth (?:link|session|appointment)',
      '\\b(?:psychology today|simplepractice|therapynotes|theranest|headway)\\b',
      'home visit',
      'case (?:plan|review|conference)',
      'enrollment (?:packet|forms?|agreement)',
      'new enrollment|waitlist for',
      'care plan',
      'pastoral (?:visit|care)',
      'counseling (?:session|appointment)'
    ],
    extractors: [
      { field: 'when', pattern: `(${DATE}[^\\n.]{0,20}?${TIME}|${DATE}|${TIME})`, flags: 'i' }
    ],
    urgentWhen: ['crisis|safety plan|emergency', '\\b(?:today|tonight|tomorrow)\\b', 'cancell?(?:ed|ation)', 'no-?show', 'hospital'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {when} ({from})',
    sectionTitle: 'Sessions & intakes',
    promptHint: 'Treat sessions, intakes, and visits as work appointments; refer to people by initials or "a client", and never repeat clinical or personal details in the brief.'
  }
]
