import type { Skill } from '../types'

const MONEY = '\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?'
const DATE =
  '\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b'

/** Watchers for people who work in or run the office side of a business. */
export const BUSINESS_SKILLS: Skill[] = [
  {
    id: 'b-pipeline',
    name: 'Quotes, proposals & deals',
    icon: '🤝',
    description: 'Follows quotes, proposals, and contracts with prospects so no deal goes quiet or expires unnoticed.',
    defaultFor: ['sales', 'consultant', 'finance', 'marketing'],
    match: [
      '\\bproposal\\b',
      '\\bquote\\b',
      '\\bpricing\\b',
      'contract (?:signed|sent|review|ready)',
      'closed[- ]won',
      'closed[- ]lost',
      '\\brfp\\b',
      'discovery call',
      '\\bdemo\\b',
      'follow[- ]up on (?:our|the) (?:call|proposal|quote)',
      'decision by',
      'purchase order',
      'signed (?:the )?agreement',
      '\\brenewal\\b',
      'ready to (?:sign|move forward)'
    ],
    senderMatch: ['@[a-z0-9.-]*salesforce\\.com', '@[a-z0-9.-]*hubspot\\.com', '@[a-z0-9.-]*pipedrive\\.com', '@[a-z0-9.-]*pandadoc\\.com', '@[a-z0-9.-]*docusign\\.(?:com|net)'],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `(?:decision|respond|reply|sign|valid|expires?|closes?|decide) (?:by|on|before|until) (${DATE})`, flags: 'i' },
      { field: 'stage', pattern: '\\b(closed[- ]won|closed[- ]lost|verbal yes|signed|in negotiation|proposal sent|demo scheduled|quote sent)\\b', flags: 'i' }
    ],
    urgentWhen: ['expires? (?:today|tomorrow|this week)', 'going with (?:another|a different)', 'decided not to', 'ready to (?:sign|move forward|buy)', 'budget (?:is )?approved', 'need (?:it|this|the quote) by'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {amount} {stage} · decide by {dueDate} ({from})',
    sectionTitle: 'Deal pipeline',
    promptHint: 'Track each prospect as a deal with a stage (prospect, demo, proposal, negotiation, closed); a prospect waiting on a quote or reply is always an issue.'
  },
  {
    id: 'b-hiring',
    name: 'Candidates & interviews',
    icon: '🧑‍💼',
    description: 'Keeps candidates, interview times, offers, and start-date paperwork from slipping through the cracks.',
    defaultFor: ['hr', 'manager'],
    match: [
      '\\bcandidates?\\b',
      '\\bapplicants?\\b',
      'interview (?:scheduled|confirmed|feedback|scorecard|availability|panel|loop|request)',
      'phone screen',
      'offer (?:letter|accepted|declined|extended|expires)',
      'background check',
      'reference check',
      'job (?:posting|requisition|req|description)',
      'start date',
      'onboarding (?:checklist|paperwork|schedule)',
      'new hire',
      '\\bresume\\b',
      '\\bi-9\\b',
      'e-verify'
    ],
    senderMatch: ['@[a-z0-9.-]*greenhouse\\.io', '@[a-z0-9.-]*lever\\.co', '@[a-z0-9.-]*workable\\.com', '@[a-z0-9.-]*bamboohr\\.com', '@[a-z0-9.-]*indeed\\.com', '@[a-z0-9.-]*ziprecruiter\\.com'],
    extractors: [
      { field: 'role', pattern: '(?:position|role|opening|req)(?: of| for|:)?\\s+([A-Z][A-Za-z /&-]{3,40}?)(?=[,.\\n)]| at | with | -)', flags: '' },
      { field: 'when', pattern: `(?:interview|screen|call|start date|starts?)[^\\n]{0,40}?(?:on|is|for|:) (${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['offer (?:expires|deadline)', 'competing offer', 'another offer', 'withdraw', 'interview (?:today|tomorrow)', 'background check (?:flag|issue|failed|delayed)', 'start(?:s|ing) (?:monday|tomorrow)', 'no[- ]show'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {role} · {when} ({from})',
    sectionTitle: 'Hiring',
    promptHint: 'Track each open role and each candidate in process; interview times go in the deadlines list, and offers with expiry dates are issues.'
  },
  {
    id: 'b-receivables',
    name: 'Money owed to you',
    icon: '💰',
    description: 'Watches the invoices you sent to clients: what was paid, what bounced, and what is overdue.',
    defaultFor: ['consultant', 'accountant', 'lawyer'],
    match: [
      'invoice (?:#|no\\.?|number|sent|paid|overdue|reminder|attached)',
      'payment received',
      'payment (?:failed|declined|bounced|returned)',
      'past due',
      'outstanding balance',
      '\\bremittance\\b',
      'ach (?:payment|transfer|deposit)',
      'check (?:is )?in the mail',
      'net (?:15|30|45|60)',
      'deposit received',
      'w-9 request',
      'retainer (?:paid|received|replenish|balance)',
      'accounts receivable',
      'aging report',
      'you(?:\'ve| have) been paid'
    ],
    senderMatch: ['@[a-z0-9.-]*stripe\\.com', '@[a-z0-9.-]*squareup\\.com', '@[a-z0-9.-]*paypal\\.com', '@[a-z0-9.-]*intuit\\.com', '@[a-z0-9.-]*freshbooks\\.com', '@[a-z0-9.-]*bill\\.com', '@[a-z0-9.-]*waveapps\\.com', '@[a-z0-9.-]*honeybook\\.com'],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'invoiceNumber', pattern: 'invoice\\s?(?:#|no\\.?|number)?\\s?:?\\s?#?([A-Z0-9-]{3,20})\\b', flags: 'i' },
      { field: 'dueDate', pattern: `(?:due|by|before|no later than) (?:on )?(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['payment (?:failed|declined|bounced|returned)', '\\bdisputes?\\b', 'chargeback', '(?:60|90|120) days', 'collections', 'refus(?:e|ed|ing) to pay', 'cannot pay', 'can\'t pay', 'final notice'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {amount} · invoice {invoiceNumber} · due {dueDate} ({from})',
    sectionTitle: 'Money owed to you',
    promptHint: 'Invoices the user sent are receivables, not bills: a paid invoice is good news, an overdue or bounced one is an issue with a follow-up as the next step.'
  },
  {
    id: 'b-legaldates',
    name: 'Court & filing deadlines',
    icon: '⚖️',
    description: 'Pulls court dates, filing deadlines, discovery dates, and e-filing results into one list so nothing is missed.',
    defaultFor: ['lawyer'],
    match: [
      'court date',
      '\\bhearing\\b',
      '\\bdocket\\b',
      'filing deadline',
      'discovery (?:deadline|responses|due|request)',
      '\\bdeposition\\b',
      '\\bsubpoena\\b',
      'statute of limitations',
      '\\bmotion (?:to|for)\\b',
      'brief (?:due|filed)',
      'trial date',
      '\\bmediation\\b',
      '\\barbitration\\b',
      'e-?filing (?:accepted|rejected|confirmation|receipt)',
      '(?:response|answer|reply|opposition) (?:is )?due',
      'scheduling order',
      'notice of (?:hearing|deposition|appeal|motion)'
    ],
    senderMatch: ['@[a-z0-9.-]*pacer\\.gov', '@[a-z0-9.-]*courts?\\.[a-z.]+gov', '@[a-z0-9.-]*clio\\.com', '@[a-z0-9.-]*mycase\\.com', '@[a-z0-9.-]*efile[a-z0-9.-]*\\.', '@[a-z0-9.-]*tylerhost\\.net'],
    extractors: [
      { field: 'caseNumber', pattern: '(?:case|matter|docket|cause)\\s?(?:no\\.?|number|#)?:?\\s?([A-Z0-9][A-Z0-9:-]{3,24})\\b', flags: 'i' },
      { field: 'dueDate', pattern: `(?:due|deadline|by|before|set for|scheduled for|hearing on|on or before|no later than)[:\\s]+(?:on )?(${DATE})`, flags: 'i' },
      { field: 'when', pattern: `(${DATE}[^\\n.]{0,20}?\\d{1,2}(?::\\d{2})?\\s?(?:am|pm))`, flags: 'i' }
    ],
    urgentWhen: ['rejected', '\\btoday\\b', '\\btomorrow\\b', 'order to show cause', 'emergency', 'ex parte', 'sanctions', 'default judgment', 'expires', 'statute of limitations', 'continuance denied'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {caseNumber} · {dueDate} {when} ({from})',
    sectionTitle: 'Court & filing deadlines',
    promptHint: 'Every court date, hearing, or filing deadline goes in the deadlines list with its matter; a rejected e-filing is an urgent issue. Describe matters only in general terms.'
  },
  {
    id: 'b-campaigns',
    name: 'Campaigns & reports',
    icon: '📊',
    description: 'Gathers ad, email, and social performance reports, and flags accounts that are paused, rejected, or out of budget.',
    defaultFor: ['marketing'],
    match: [
      'campaign (?:performance|report|results|summary|ended|paused|approved|rejected|is live)',
      'ad (?:account|spend|disapproved|rejected|set)',
      'budget (?:exhausted|depleted|limit reached|cap)',
      '(?:weekly|monthly|daily) (?:report|performance|summary)',
      'analytics (?:report|summary|digest)',
      'open rate',
      'click[- ]through',
      '\\bimpressions\\b',
      '\\bconversions?\\b',
      '\\broas\\b',
      'newsletter (?:sent|delivered|report|stats)',
      'post (?:published|scheduled|failed to publish)',
      'account (?:suspended|restricted|flagged|disabled)',
      'seo report',
      'search console',
      'unsubscribe rate'
    ],
    senderMatch: ['@[a-z0-9.-]*google\\.com', '@[a-z0-9.-]*facebookmail\\.com', '@[a-z0-9.-]*mailchimp\\.com', '@[a-z0-9.-]*klaviyo(?:mail)?\\.com', '@[a-z0-9.-]*hootsuite\\.com', '@[a-z0-9.-]*sproutsocial\\.com', '@[a-z0-9.-]*semrush\\.com', '@[a-z0-9.-]*ahrefs\\.com', '@[a-z0-9.-]*linkedin\\.com'],
    extractors: [
      { field: 'spend', pattern: `(?:spend|spent|cost|budget)[^\\n$]{0,20}?(${MONEY})`, flags: 'i' },
      { field: 'rate', pattern: '(\\d{1,3}(?:\\.\\d+)?%\\s?(?:open|click|click-through|conversion|unsubscribe|bounce) rate)', flags: 'i' }
    ],
    urgentWhen: ['disapproved', 'rejected', 'suspended', 'restricted', 'disabled', 'payment (?:failed|declined)', 'budget (?:exhausted|depleted|limit reached)', 'policy violation', 'spam complaint', 'domain (?:blocked|blacklisted)'],
    minImportance: 1,
    forceCategory: 'work',
    lineTemplate: '{subject} — spend {spend} · {rate} ({from})',
    sectionTitle: 'Campaigns & reports',
    promptHint: 'Routine performance reports are low-key updates; an ad account that is rejected, suspended, or out of budget is an issue to fix today.'
  },
  {
    id: 'b-tickets',
    name: 'Support tickets & SLAs',
    icon: '🎫',
    description: 'Tracks help-desk tickets, escalations, and SLA warnings so the customers waiting longest come first.',
    defaultFor: ['support'],
    match: [
      'ticket (?:#|no\\.?|number|id|\\d{3,})',
      '\\[ticket',
      'support (?:ticket|request|case)',
      'case (?:#|number|id) ?\\d',
      'sla (?:breach|warning|at risk|violation|missed)',
      '\\bescalat(?:ed|ion)\\b',
      '\\breopened\\b',
      'awaiting (?:your|agent) (?:reply|response)',
      'customer (?:replied|responded|reported)',
      '\\bcsat\\b',
      'satisfaction survey',
      'first response',
      '\\bunassigned\\b',
      'new (?:ticket|conversation|request) from'
    ],
    senderMatch: ['@[a-z0-9.-]*zendesk\\.com', '@[a-z0-9.-]*freshdesk\\.com', '@[a-z0-9.-]*intercom(?:-mail)?\\.(?:com|io)', '@[a-z0-9.-]*helpscout\\.(?:com|net)', '@[a-z0-9.-]*servicenow(?:services)?\\.com', '@[a-z0-9.-]*gorgias\\.(?:com|io)'],
    extractors: [
      { field: 'ticketId', pattern: '(?:ticket|case|request|conversation)\\s?(?:#|no\\.?|id|number)?\\s?:?\\s?#?(\\d{3,10})\\b', flags: 'i' },
      { field: 'priority', pattern: 'priority[:\\s]+(urgent|critical|high|p1|p2|normal|medium|low)\\b', flags: 'i' }
    ],
    urgentWhen: ['sla (?:breach|violation|missed|breached)', '\\bbreached\\b', '\\burgent\\b', '\\bcritical\\b', '\\bp1\\b', '\\boutage\\b', 'escalated', 'cancel (?:my|their|our) (?:account|subscription|service)', 'legal action', 'data loss', 'security (?:incident|breach)'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: 'Ticket {ticketId}: {subject} — {priority} ({from})',
    sectionTitle: 'Support tickets',
    promptHint: 'Group by ticket; the oldest unanswered and any SLA-at-risk or escalated tickets are the top issues, each with a reply as the next step.'
  },
  {
    id: 'b-signoffs',
    name: 'Approvals & sign-offs',
    icon: '✅',
    description: 'Collects the approvals, signatures, and status reports that are waiting on you, with their deadlines.',
    defaultFor: ['manager', 'projectmanager', 'admin', 'hr', 'marketing', 'finance'],
    match: [
      '(?:needs|awaiting|pending|requires|requesting|waiting for) (?:your )?(?:approval|sign-?off|signature|review)',
      'please (?:approve|review and approve|sign|review and sign)',
      'approval (?:request|needed|required)',
      'for your (?:approval|signature|review)',
      'sign-?off (?:needed|required|requested)',
      'expense report',
      'pto request',
      'time[- ]off request',
      'purchase request',
      'change request',
      'status report',
      '\\baction items?\\b',
      'budget request',
      'reminder:[^\\n]{0,80}(?:approve|sign|review)',
      'document (?:is )?ready for (?:your )?signature'
    ],
    senderMatch: ['@[a-z0-9.-]*docusign\\.(?:com|net)', '@[a-z0-9.-]*pandadoc\\.com', '@[a-z0-9.-]*hellosign\\.com', '@[a-z0-9.-]*dropboxsign\\.com', '@[a-z0-9.-]*adobesign\\.com', '@[a-z0-9.-]*concursolutions\\.com', '@[a-z0-9.-]*expensify\\.com', '@[a-z0-9.-]*workday\\.com', '@[a-z0-9.-]*asana\\.com', '@[a-z0-9.-]*atlassian\\.(?:com|net)', '@[a-z0-9.-]*monday\\.com', '@[a-z0-9.-]*smartsheet\\.com'],
    extractors: [
      { field: 'amount', pattern: `(${MONEY})`, flags: 'i' },
      { field: 'dueDate', pattern: `(?:by|before|due|no later than|deadline|needed by) (?:on )?(${DATE})`, flags: 'i' }
    ],
    urgentWhen: ['\\btoday\\b', '\\btomorrow\\b', 'end of day', '\\beod\\b', '\\bblocked\\b', '\\bblocking\\b', 'holding up', 'expires', 'final reminder', 'overdue', 'second reminder'],
    minImportance: 2,
    forceCategory: 'work',
    lineTemplate: '{subject} — {amount} · by {dueDate} ({from})',
    sectionTitle: 'Waiting on your approval',
    promptHint: 'Anything waiting on the user to approve, sign, or review is an actionable item; if someone is blocked by it, it is an issue.'
  }
]
