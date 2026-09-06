import type { WorkProfile } from '../profiles'

/**
 * Business & office profiles: people who work in or run the office side of a
 * company. The "owner" profile lives in core.ts and is not repeated here.
 */
export const BUSINESS_PROFILES: WorkProfile[] = [
  {
    id: 'manager',
    name: 'Manager / team lead',
    group: 'business',
    icon: '🧭',
    tagline: 'You lead a team: approvals, 1:1s, reviews, hiring, and keeping people unblocked.',
    pulseName: 'Team Pulse',
    workDescription:
      'The user manages a team inside a company. Work mail includes anything from their direct reports, their own boss, ' +
      'HR and finance, approval requests, performance reviews, hiring for the team, goals and planning, and company announcements. ' +
      'Track each person on the team and each team initiative as its own entity, named by the person or the initiative.',
    urgencyHints: [
      'a direct report blocked and waiting on the manager to approve or decide',
      'approval requests (time off, expenses, budget) with a deadline',
      'performance review or calibration deadlines',
      'escalations from customers or other teams about the team',
      'requests from the manager\'s own boss or leadership'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-signoffs', 'b-hiring', 'travel'],
    signals: [
      { pattern: '\\b(1:1s?|one-on-ones?|skip-level)\\b', weight: 2 },
      { pattern: '\\b(performance reviews?|mid-year reviews?|annual reviews?|review cycle)\\b', weight: 2 },
      { pattern: '\\b(direct reports?|my reports|my team\'s)\\b', weight: 2 },
      { pattern: '\\b(headcount|open req|backfill|hiring plan)\\b', weight: 2 },
      { pattern: '\\b(okrs?|quarterly goals|team goals|kpi review)\\b', weight: 2 },
      { pattern: '\\b(all-hands|all hands|team offsite|offsite agenda|town hall)\\b', weight: 2 },
      { pattern: '\\b(pto request|time[- ]off request|leave request|vacation request|approve their pto)\\b', weight: 2 },
      { pattern: '\\b(promo cycle|promotion cycle|calibration|comp cycle|merit cycle)\\b', weight: 2 },
      { pattern: '\\b(engagement survey|pulse survey|lattice|15five|culture amp)\\b', weight: 2 },
      { pattern: '\\b(standup notes|weekly sync|staff sync|team sync|manager sync)\\b' },
      { pattern: '\\b(expense approval|budget approval|needs your approval|awaiting your approval|pending your approval)\\b', weight: 2 },
      { pattern: '\\b(org chart|reorg|reporting line|new manager|team structure)\\b' },
      { pattern: '\\b(hiring manager|interview debrief|debrief notes)\\b' },
      { pattern: '\\b(escalated to me|looping you in|for your awareness|fyi for your team)\\b' },
      { pattern: '\\b(management training|leadership training|manager training|leadership offsite)\\b' }
    ]
  },
  {
    id: 'sales',
    name: 'Sales rep / account manager',
    group: 'business',
    icon: '📈',
    tagline: 'Prospects, demos, quotes, and deals moving through your pipeline.',
    pulseName: 'Deal Pipeline',
    workDescription:
      'The user sells for a company and manages customer accounts. Work mail includes prospects and customers, ' +
      'demos and discovery calls, quotes, proposals and contracts, CRM notifications, renewals, and their sales manager. ' +
      'Track each open opportunity as its own deal, named by the customer company, with a stage: prospect, demo, proposal, ' +
      'negotiation, or closed.',
    urgencyHints: [
      'a prospect or customer waiting on a quote, proposal, or answer',
      'quotes and proposals about to expire',
      'contracts ready to sign or stuck in review',
      'renewals coming up or at risk of churning',
      'end-of-quarter or quota deadlines'
    ],
    entityNoun: 'deal',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-pipeline', 'customers', 'travel'],
    signals: [
      { pattern: '\\b(salesforce|hubspot|pipedrive|zoho crm|salesloft|outreach\\.io|gong|apollo\\.io|zoominfo)\\b', weight: 3 },
      { pattern: '\\b(pipeline review|pipeline call|pipeline update|forecast call|deal review)\\b', weight: 3 },
      { pattern: '\\b(quota|attainment|commission statement|comp plan|accelerators?)\\b', weight: 2 },
      { pattern: '\\b(discovery call|demo request|product demo|demo scheduled|demo booked|intro call)\\b', weight: 2 },
      { pattern: '\\b(closed[- ]won|closed[- ]lost|won the deal|lost the deal)\\b', weight: 3 },
      { pattern: '\\b(prospects?|prospecting|cold outreach|cold call|outbound sequence|lead list)\\b', weight: 2 },
      { pattern: '\\b(mqls?|sales qualified leads?|opportunity stage|new opp|opps?)\\b', weight: 2 },
      { pattern: '\\b(rfps?|rfqs?|rfis?|request for proposal|pricing proposal)\\b', weight: 2 },
      { pattern: '\\b(account executive|account manager|sdr|bdr|sales engineer|sales manager|vp of sales)\\b', weight: 2 },
      { pattern: '\\b(qbr|quarterly business review|account plan|territory|book of business)\\b', weight: 2 },
      { pattern: '\\b(upsell|cross-sell|expansion deal|renewal quote|trial expiring|trial ends)\\b', weight: 2 },
      { pattern: '\\b(decision[- ]maker|champion|procurement review|security questionnaire)\\b' },
      { pattern: '\\b(order form|pricing sheet|price list|discount approval)\\b' },
      { pattern: '\\b(sales kickoff|sko|sales meeting|sales call|sales team)\\b' },
      { pattern: '\\b(linkedin sales navigator|sales navigator|calendly link|book a time with me)\\b' }
    ]
  },
  {
    id: 'marketing',
    name: 'Marketing / social-media manager',
    group: 'business',
    icon: '📣',
    tagline: 'Campaigns, ads, content, analytics reports, and launches.',
    pulseName: 'Campaign Pulse',
    workDescription:
      'The user runs marketing or social media for a company. Work mail includes ad and campaign performance reports, ' +
      'email and social tools, content and design reviews, agencies and freelancers, analytics, launches, and events. ' +
      'Track each campaign or launch as its own entity, named by the campaign or product.',
    urgencyHints: [
      'ad accounts disapproved, suspended, or out of budget',
      'launch or send dates approaching',
      'content or creative waiting on the user\'s review or approval',
      'sudden drops in performance or unsubscribes',
      'press or partner deadlines'
    ],
    entityNoun: 'campaign',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-campaigns', 'b-signoffs'],
    signals: [
      { pattern: '\\b(campaign performance|campaign report|campaign results|ad campaign|email campaign|campaign launch)\\b', weight: 2 },
      { pattern: '\\b(google ads|meta ads|facebook ads|instagram ads|linkedin ads|tiktok ads|ad spend|ppc)\\b', weight: 3 },
      { pattern: '\\b(mailchimp|klaviyo|constant contact|hootsuite|sprout social|semrush|ahrefs|marketo|pardot)\\b', weight: 3 },
      { pattern: '\\b(open rate|click[- ]through rate|ctr|cpc|cpm|roas|impressions)\\b', weight: 2 },
      { pattern: '\\b(seo|keyword rankings?|backlinks?|search console|google analytics|ga4|organic traffic)\\b', weight: 2 },
      { pattern: '\\b(content calendar|editorial calendar|social calendar|blog post draft|copy review|brand guidelines)\\b', weight: 2 },
      { pattern: '\\b(social media|instagram post|tiktok|reels|influencer|creator partnership|ugc)\\b', weight: 2 },
      { pattern: '\\b(landing page|lead magnet|webinar registration|webinar promo|newsletter draft|drip sequence)\\b', weight: 2 },
      { pattern: '\\b(press release|media kit|pr pitch|media coverage|brand mention)\\b', weight: 2 },
      { pattern: '\\b(a/b test|split test|utm|conversion rate|funnel|attribution)\\b', weight: 2 },
      { pattern: '\\b(product launch|launch plan|go-to-market|gtm plan|brand awareness|brand campaign)\\b', weight: 2 },
      { pattern: '\\b(creative assets|ad creative|banner ad|design request|logo files|brand refresh)\\b' },
      { pattern: '\\b(marketing budget|marketing plan|marketing report|marketing manager|cmo|growth marketing|demand gen)\\b', weight: 2 },
      { pattern: '\\b(hashtag|followers|engagement rate|post went live|scheduled post)\\b' },
      { pattern: '\\b(event sponsorship|trade show booth|conference booth|swag order|promo codes?)\\b' }
    ]
  },
  {
    id: 'hr',
    name: 'HR / recruiter',
    group: 'business',
    icon: '🤝',
    tagline: 'Candidates, interviews, offers, onboarding, benefits, and employee matters.',
    pulseName: 'Hiring Pulse',
    workDescription:
      'The user works in human resources or recruiting. Work mail includes candidates and applicants, interview scheduling ' +
      'and feedback, offers and onboarding, benefits and leave, employee relations, policies, and hiring managers. ' +
      'Track each open role and each candidate in process as its own entity, named by the role and candidate. Employee ' +
      'matters are confidential and should be described only in general terms.',
    urgencyHints: [
      'offers about to expire or candidates with competing offers',
      'interviews to schedule or feedback that is overdue',
      'benefits enrollment or leave deadlines',
      'employee relations issues and complaints',
      'background checks or paperwork blocking a start date'
    ],
    entityNoun: 'application',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-hiring', 'b-signoffs'],
    signals: [
      { pattern: '\\b(candidates?|applicants?|resume received|phone screen|screening call)\\b', weight: 2 },
      { pattern: '\\b(greenhouse|lever|workable|bamboohr|rippling|justworks|ziprecruiter|indeed|linkedin recruiter|icims|paylocity|paycom)\\b', weight: 3 },
      { pattern: '\\b(job requisition|requisition|job posting|job req|job description|open positions?)\\b', weight: 2 },
      { pattern: '\\b(background check|reference check|i-9|e-verify|drug screen|new hire paperwork|onboarding checklist)\\b', weight: 2 },
      { pattern: '\\b(open enrollment|benefits enrollment|benefits renewal|group health plan|401k enrollment|cobra notice)\\b', weight: 2 },
      { pattern: '\\b(fmla|leave of absence|parental leave|ada accommodation|accommodation request|short-term disability)\\b', weight: 2 },
      { pattern: '\\b(employee handbook|policy acknowledgment|harassment training|eeoc|eeo-1|labor law poster)\\b', weight: 2 },
      { pattern: '\\b(termination|exit interview|offboarding|severance|final paycheck|separation agreement)\\b', weight: 2 },
      { pattern: '\\b(interview feedback|interview scorecard|panel interview|interview loop|schedule an interview|interview availability)\\b', weight: 2 },
      { pattern: '\\b(salary band|compensation band|pay equity|merit increase|comp review|salary survey)\\b', weight: 2 },
      { pattern: '\\b(performance improvement plan|pip|write-up|disciplinary|employee relations|er case)\\b', weight: 2 },
      { pattern: '\\b(hr manager|hr business partner|hr generalist|hrbp|chro|people ops|people team|people operations|hr department)\\b', weight: 2 },
      { pattern: '\\b(offer accepted|offer declined|offer extended|start date confirmed|signed offer)\\b' },
      { pattern: '\\b(dei|diversity and inclusion|employee engagement|employee recognition|employee survey|culture committee)\\b' },
      { pattern: '\\b(workers comp|unemployment claim|wage and hour|pto policy|pto balance)\\b' }
    ]
  },
  {
    id: 'accountant',
    name: 'Accountant / bookkeeper / tax preparer',
    group: 'business',
    icon: '🧾',
    tagline: 'Client books, reconciliations, tax returns, filings, and missing documents.',
    pulseName: 'Books & Filings',
    workDescription:
      'The user does accounting, bookkeeping, or tax preparation for clients or an employer. Work mail includes client ' +
      'documents and questions, accounting software notices, tax filings and IRS or state notices, reconciliations and ' +
      'month-end close, financial statements, and audit requests. Track each client (or each return / close) as its own ' +
      'entity, named by the client, with a stage: waiting on documents, in progress, ready for review, or filed.',
    urgencyHints: [
      'tax filing and extension deadlines',
      'IRS or state notices with response dates',
      'clients who still owe documents before a deadline',
      'payroll tax or sales tax filing dates',
      'month-end or year-end close dates'
    ],
    entityNoun: 'client',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-receivables', 'customers'],
    signals: [
      { pattern: '\\b(quickbooks|qbo|xero|freshbooks|sage intacct|netsuite|wave accounting|zoho books)\\b', weight: 2 },
      { pattern: '\\b(tax returns?|form 1040|form 1120|form 1065|schedule c|k-1s?|irs notice|cp2000)\\b', weight: 3 },
      { pattern: '\\b(bank reconciliation|reconciliations?|month-end close|month end close|year-end close|trial balance|general ledger)\\b', weight: 3 },
      { pattern: '\\b(journal entry|journal entries|accounts payable|accounts receivable|chart of accounts|accruals?)\\b', weight: 3 },
      { pattern: '\\b(cpa|cpe credits|aicpa|enrolled agent|cpa firm|tax preparer|tax season)\\b', weight: 2 },
      { pattern: '\\b(w-2s|w-2|form 941|form 940|form 1096|1099-nec|1099-misc)\\b', weight: 2 },
      { pattern: '\\b(estimated taxes?|quarterly estimates|1040-es|extension filed|filing extension|tax extension|tax deadline)\\b', weight: 2 },
      { pattern: '\\b(financial statements|balance sheet|income statement|cash flow statement|management report)\\b', weight: 2 },
      { pattern: '\\b(depreciation|fixed assets?|amortization schedule|inventory count|cogs|write-offs?)\\b', weight: 2 },
      { pattern: '\\b(lacerte|proseries|ultratax|taxdome|drake tax|bill\\.com|expensify|hubdoc|dext|karbon)\\b', weight: 3 },
      { pattern: '\\b(bookkeeping|bookkeeper|books are closed|close the books|cleanup project|catch-up bookkeeping)\\b', weight: 2 },
      { pattern: '\\b(missing receipts|bank statements|source documents|client documents|tax documents|tax organizer)\\b', weight: 2 },
      { pattern: '\\b(audit support|audit request|auditors?|sales tax return|payroll taxes?)\\b' },
      { pattern: '\\b(itemized deductions|tax deductions?|tax credits?|refund status|amended return)\\b' },
      { pattern: '\\b(net income|gross margin|budget vs actual|variance analysis|cash position|ar aging|ap aging)\\b' }
    ]
  },
  {
    id: 'projectmanager',
    name: 'Project manager',
    group: 'business',
    icon: '🗂',
    tagline: 'Milestones, status reports, blockers, scope changes, and sign-offs.',
    pulseName: 'Project Pulse',
    workDescription:
      'The user manages projects for a company or clients. Work mail includes project tool notifications, status reports, ' +
      'stakeholders and sponsors, vendors and contractors on the project, scope and change requests, risks and blockers, ' +
      'and milestone sign-offs. Track each project as its own entity, named by the project, with a stage: planning, in ' +
      'progress, at risk, or closing.',
    urgencyHints: [
      'milestones or go-live dates slipping',
      'blockers and dependencies waiting on someone',
      'scope or change requests needing a decision',
      'stakeholder sign-offs that are overdue',
      'budget or resource shortfalls'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-signoffs', 'travel'],
    signals: [
      { pattern: '\\b(asana|jira|monday\\.com|smartsheet|basecamp|clickup|wrike|ms project|microsoft project)\\b', weight: 2 },
      { pattern: '\\b(project plan|project charter|project status|project kickoff|project timeline|project schedule)\\b', weight: 3 },
      { pattern: '\\b(milestones?|deliverables?|gantt|critical path|work breakdown|wbs)\\b', weight: 2 },
      { pattern: '\\b(status report|weekly status|steering committee|steerco|stakeholder update|stakeholders?)\\b', weight: 2 },
      { pattern: '\\b(scope change|change request|scope creep|out of scope|in scope|scope document)\\b', weight: 2 },
      { pattern: '\\b(risk register|raid log|issues? log|action items|decision log|lessons learned)\\b', weight: 2 },
      { pattern: '\\b(resource allocation|resource plan|resourcing|capacity planning|staffing plan)\\b', weight: 2 },
      { pattern: '\\b(pmp|pmp certified|scrum master|prince2|agile coach|program manager|pmo)\\b', weight: 2 },
      { pattern: '\\b(blocked on|blockers?|slipping|behind schedule|schedule slip|on track|at risk)\\b', weight: 2 },
      { pattern: '\\b(go-live|go live|cutover|uat|user acceptance testing|sign-off on|signoff)\\b', weight: 2 },
      { pattern: '\\b(burn rate|budget burn|earned value|forecast to complete|hours remaining|percent complete)\\b', weight: 2 },
      { pattern: '\\b(workstreams?|phase 1|phase 2|phase one|phase two|implementation plan|rollout plan)\\b' },
      { pattern: '\\b(sprint planning|sprint review|retrospective|retro notes|backlog grooming|backlog refinement)\\b' },
      { pattern: '\\b(kickoff call|kick-off call|kickoff deck|handoff plan|hand-off plan|cross-team dependency)\\b' },
      { pattern: '\\b(project budget|project closeout|closeout report|post-mortem|postmortem|project retrospective)\\b' }
    ]
  },
  {
    id: 'support',
    name: 'Customer service / support rep',
    group: 'business',
    icon: '🎧',
    tagline: 'Tickets, escalations, SLAs, and customers waiting on an answer.',
    pulseName: 'Ticket Pulse',
    workDescription:
      'The user answers customer support or service requests. Work mail includes help-desk ticket notifications, ' +
      'customer replies and complaints, escalations, SLA warnings, product and outage notices from their own company, ' +
      'and satisfaction surveys. Track each open ticket or escalation as its own entity, named by ticket number and customer.',
    urgencyHints: [
      'tickets about to breach or already past their SLA',
      'escalated or angry customers',
      'customers threatening to cancel or dispute a charge',
      'outages or known issues affecting many customers',
      'tickets reopened or waiting on the rep\'s reply'
    ],
    entityNoun: 'case',
    defaultSkills: ['vip', 'appointments', 'b-tickets', 'customers', 'shipping'],
    signals: [
      { pattern: '\\b(support ticket|ticket number|ticket #\\s?\\d+|case number|ticket id|zendesk ticket)\\b', weight: 3 },
      { pattern: '\\b(zendesk|freshdesk|intercom|help scout|helpscout|kayako|servicenow|jira service desk|gorgias)\\b', weight: 3 },
      { pattern: '\\b(sla breach|sla violation|sla|first response time|response time|time to resolution|resolution time)\\b', weight: 2 },
      { pattern: '\\b(escalated ticket|escalate this|tier 2|tier 1|tier 3|l1 support|l2 support|escalation queue)\\b', weight: 2 },
      { pattern: '\\b(csat|nps score|customer satisfaction|satisfaction survey|survey response|rate your experience)\\b', weight: 2 },
      { pattern: '\\b(knowledge base|help center|kb article|macro|canned response|saved reply)\\b', weight: 2 },
      { pattern: '\\b(refund request|return request|rma|return authorization|replacement unit|replacement order)\\b' },
      { pattern: '\\b(customer reported|reported an issue|cannot log in|unable to log in|login issue|not working for the customer)\\b', weight: 2 },
      { pattern: '\\b(ticket reopened|ticket closed|ticket resolved|awaiting customer|pending customer|awaiting your reply|reopened)\\b', weight: 2 },
      { pattern: '\\b(live chat|chat transcript|callback request|call back the customer|missed chat)\\b', weight: 2 },
      { pattern: '\\b(warranty claim|troubleshooting steps|troubleshoot|known issue|workaround|bug report from)\\b' },
      { pattern: '\\b(support queue|ticket queue|ticket volume|ticket backlog|unassigned tickets|my tickets)\\b', weight: 2 },
      { pattern: '\\b(support team|support lead|support manager|customer success|customer support|cs team|help desk)\\b', weight: 2 },
      { pattern: '\\b(account locked|password reset request|reset their password|2fa issue|verification code not received)\\b' },
      { pattern: '\\b(angry customer|frustrated customer|customer is upset|threatening to cancel|cancel their subscription|churn risk)\\b' }
    ]
  },
  {
    id: 'admin',
    name: 'Office admin / executive assistant / receptionist',
    group: 'business',
    icon: '🗓',
    tagline: 'Calendars, visitors, travel, supplies, signatures, and keeping the office running.',
    pulseName: 'Office Pulse',
    workDescription:
      'The user keeps an office or an executive running: scheduling and calendars, visitors and phone messages, travel ' +
      'and expenses, supplies and facilities, documents for signature, and events. Work mail is anything sent to them or ' +
      'on behalf of the people they support. Track each executive or recurring responsibility as its own entity, named ' +
      'by the person or the task (for example "board meeting" or "office move").',
    urgencyHints: [
      'meetings to schedule or move today or tomorrow',
      'travel that needs booking or changing',
      'visitors, deliveries, or calls waiting at the front desk',
      'documents waiting for a signature by a deadline',
      'supplies or facilities problems affecting the office'
    ],
    entityNoun: 'task',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-signoffs', 'travel', 'shipping'],
    signals: [
      { pattern: '\\b(calendar hold|hold on the calendar|find a time|availability for a|reschedule his|reschedule her|move the meeting)\\b', weight: 2 },
      { pattern: '\\b(catering order|catering|lunch order|coffee order|conference room|room booking|book the room|room reservation)\\b', weight: 2 },
      { pattern: '\\b(travel arrangements|book a flight for|flight for|hotel for|itinerary for|car service|concur)\\b', weight: 2 },
      { pattern: '\\b(office supplies|supply order|staples|office depot|uline|toner|printer paper|paper towels|water delivery)\\b', weight: 2 },
      { pattern: '\\b(visitor log|visitor badge|front desk|reception desk|receptionist|guest arriving|visitor arriving|sign in at the front)\\b', weight: 3 },
      { pattern: '\\b(board packet|board deck|agenda for|meeting agenda|meeting minutes|take minutes|minutes from)\\b', weight: 2 },
      { pattern: '\\b(executive assistant|ea to|on behalf of|assistant to|admin assistant|administrative assistant|office manager)\\b', weight: 3 },
      { pattern: '\\b(mail room|mailroom|courier|fedex pickup|ups pickup|package at the front|notary appointment)\\b' },
      { pattern: '\\b(parking pass|parking validation|building access|key card|keycard|badge access|facilities request|building management)\\b', weight: 2 },
      { pattern: '\\b(for your signature|needs signing|please sign and return|signature page|wet signature|countersigned)\\b' },
      { pattern: '\\b(holiday party|team lunch|office event|birthday card|rsvp by|potluck)\\b' },
      { pattern: '\\b(phone message for|voicemail for|missed call for|call for you|someone called for|left a message for)\\b', weight: 2 },
      { pattern: '\\b(office move|desk assignment|seating chart|new desk|office keys|alarm code|cleaning crew|janitorial)\\b', weight: 2 },
      { pattern: '\\b(travel receipts|reimbursement form|petty cash|corporate card|amex statement|p-card)\\b' },
      { pattern: '\\b(gift basket|flowers for|thank-you note|thank you note|greeting cards|business cards order|name plate)\\b' }
    ]
  },
  {
    id: 'consultant',
    name: 'Consultant / agency owner / freelancer',
    group: 'business',
    icon: '💡',
    tagline: 'Clients, proposals, retainers, deliverables, and getting paid on time.',
    pulseName: 'Client Pulse',
    workDescription:
      'The user is an independent consultant, freelancer, or runs a small agency serving clients. Work mail includes ' +
      'current and prospective clients, proposals and contracts, deliverables and feedback, invoices and payments, ' +
      'subcontractors, and the tools they use to run the business. Track each client engagement as its own entity, ' +
      'named by client, with a stage: proposal, active, delivered, or paid.',
    urgencyHints: [
      'proposals or contracts a prospect is waiting on',
      'deliverable due dates and client review deadlines',
      'unpaid or overdue invoices',
      'client feedback or scope changes needing a reply',
      'a client threatening to pause or end the engagement'
    ],
    entityNoun: 'client',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-pipeline', 'b-receivables', 'customers', 'travel'],
    signals: [
      { pattern: '\\b(engagement letter|scope of engagement|scope of work|monthly retainer|retainer fee|on retainer)\\b', weight: 2 },
      { pattern: '\\b(billable hours|hours logged|toggl|clockify|hourly rate|day rate|rate card)\\b', weight: 2 },
      { pattern: '\\b(client kickoff|client deliverable|client feedback|client workshop|client onboarding|client call|client presentation)\\b', weight: 2 },
      { pattern: '\\b(net 15|deposit invoice|upfront payment|50% upfront|final invoice|invoice for services|payment terms)\\b', weight: 2 },
      { pattern: '\\b(independent contractor|freelance|freelancer|upwork|fiverr|toptal|contractor agreement)\\b', weight: 2 },
      { pattern: '\\b(agency retainer|creative brief|deck review|client deck|pitch deck|capabilities deck|proposal deck)\\b', weight: 2 },
      { pattern: '\\b(mutual nda|non-disclosure agreement|master services agreement|consulting agreement|services agreement)\\b', weight: 2 },
      { pattern: '\\b(testimonial|case study|referral from|referred you|word of mouth|portfolio review)\\b' },
      { pattern: '\\b(taking new clients|booked through|availability next month|capacity next|project start date)\\b' },
      { pattern: '\\b(advisory call|advisory retainer|assessment report|recommendations report|discovery workshop|findings and recommendations)\\b', weight: 2 },
      { pattern: '\\b(honeybook|dubsado|bonsai|hellobonsai|moxie|paymo)\\b', weight: 3 },
      { pattern: '\\b(consultant|consulting|consultancy|solo practice|my practice|fractional)\\b', weight: 2 },
      { pattern: '\\b(project fee|fixed fee|flat rate project|scope and pricing|proposal sent|proposal approved)\\b' },
      { pattern: '\\b(subcontract|white-label|white label|partner agency|referral partner)\\b' },
      { pattern: '\\b(client roster|active clients|client list|late paying client|chase the invoice)\\b' }
    ]
  },
  {
    id: 'finance',
    name: 'Financial advisor / insurance agent / banker',
    group: 'business',
    icon: '🏦',
    tagline: 'Clients, policies, portfolios, compliance, and renewal dates.',
    pulseName: 'Client Book',
    workDescription:
      'The user advises clients on money: investments, insurance, or banking. Work mail includes clients and prospects, ' +
      'custodians, carriers and underwriters, compliance and licensing, policy and account notices, statements, and ' +
      'review meetings. Track each client household or policy as its own entity, named by client, and never quote ' +
      'account numbers or balances in the brief beyond what is needed.',
    urgencyHints: [
      'policy lapses, renewals, or premium due dates',
      'client requests to move money, file a claim, or change beneficiaries',
      'compliance, licensing, or continuing-education deadlines',
      'underwriting or account-opening paperwork that is stuck',
      'market events prompting client questions'
    ],
    entityNoun: 'client',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-pipeline', 'b-signoffs', 'customers'],
    signals: [
      { pattern: '\\b(policy number|policy renewal|policyholder|policy lapse|premium due|premium payment|premium increase)\\b', weight: 3 },
      { pattern: '\\b(life insurance|term life|whole life|annuity|annuities|long-term care insurance|disability insurance|umbrella policy)\\b', weight: 3 },
      { pattern: '\\b(portfolio review|asset allocation|rebalance|rebalancing|risk tolerance|investment policy statement|model portfolio)\\b', weight: 2 },
      { pattern: '\\b(ira rollover|roth conversion|401k rollover|rmd|required minimum distribution|529 plan|beneficiary designation)\\b', weight: 2 },
      { pattern: '\\b(finra|series 7|series 65|series 66|broker-dealer|ria|fiduciary|suitability|compliance review)\\b', weight: 3 },
      { pattern: '\\b(wealth management|financial plan|financial planning|retirement plan|retirement income|estate plan|estate planning)\\b', weight: 2 },
      { pattern: '\\b(redtail|wealthbox|emoney|moneyguidepro|orion advisor|riskalyze|nitrogen|applied epic|ezlynx|hawksoft)\\b', weight: 3 },
      { pattern: '\\b(line of credit|credit memo|kyc|bsa|aml|suspicious activity|loan committee|branch manager)\\b', weight: 2 },
      { pattern: '\\b(client review meeting|annual review meeting|quarterly statement|custodian|account opening|acat|transfer of assets)\\b', weight: 2 },
      { pattern: '\\b(surrender charge|illustration|binder|certificate of insurance|coverage quote|quote for coverage|underwriting)\\b', weight: 2 },
      { pattern: '\\b(medicare supplement|medigap|part d|aca plan|marketplace plan|group health|group benefits)\\b', weight: 2 },
      { pattern: '\\b(cost basis|tax-loss harvesting|capital gains distribution|qualified dividends|1099-div|1099-r)\\b', weight: 2 },
      { pattern: '\\b(claims adjuster|claim filed|claim number|auto policy|homeowners policy|renters policy|commercial policy)\\b', weight: 2 },
      { pattern: '\\b(financial advisor|financial adviser|insurance agent|wealth advisor|relationship manager|private banker|independent agent)\\b', weight: 3 },
      { pattern: '\\b(aum|assets under management|advisory fee|trail commission|carrier appointment|insurance carrier)\\b', weight: 2 },
      { pattern: '\\b(deposit account|cd rate|certificate of deposit|wire transfer request|overdraft|treasury management)\\b' }
    ]
  },
  {
    id: 'lawyer',
    name: 'Lawyer / paralegal / legal office',
    group: 'business',
    icon: '⚖️',
    tagline: 'Court dates, filings, discovery, opposing counsel, and client matters.',
    pulseName: 'Matter Pulse',
    workDescription:
      'The user works in a law office as a lawyer, paralegal, or legal staff. Work mail includes clients, courts and ' +
      'e-filing systems, opposing counsel, discovery and depositions, contracts and redlines, settlements, billing, and ' +
      'bar or continuing-education matters. Track each matter as its own entity, named by client and matter, with its ' +
      'next deadline. Treat everything as privileged and describe matters only in general terms.',
    urgencyHints: [
      'court dates, hearings, and filing deadlines',
      'discovery or response deadlines',
      'statute of limitations dates',
      'e-filings rejected by the court',
      'client or opposing counsel waiting on a response'
    ],
    entityNoun: 'case',
    defaultSkills: ['vip', 'appointments', 'bills', 'b-legaldates', 'b-receivables'],
    signals: [
      { pattern: '\\b(court date|court hearing|hearing scheduled|hearing set|docket|calendar call|oral argument|status conference)\\b', weight: 3 },
      { pattern: '\\b(discovery request|discovery deadline|discovery responses|interrogatories|deposition|depo|subpoena|request for production)\\b', weight: 3 },
      { pattern: '\\b(motion to|motion for|brief due|filing deadline|statute of limitations|reply brief|opposition brief|notice of appeal)\\b', weight: 3 },
      { pattern: '\\b(opposing counsel|co-counsel|plaintiff|defendant|petitioner|respondent|counsel for)\\b', weight: 3 },
      { pattern: '\\b(clio|mycase|practicepanther|westlaw|lexisnexis|lexis|pacer|casetext|e-filing|efiling|efile|filevine|smokeball)\\b', weight: 3 },
      { pattern: '\\b(paralegal|associate attorney|of counsel|attorney|esq|bar number|bar association|cle credits)\\b', weight: 2 },
      { pattern: '\\b(settlement offer|settlement agreement|settlement demand|mediation|arbitration|demand letter|release agreement)\\b', weight: 2 },
      { pattern: '\\b(conflict check|conflicts check|new matter|matter number|case number|case no)\\b', weight: 2 },
      { pattern: '\\b(redlines?|redlined|contract review|term sheet|indemnification|governing law|execution version)\\b', weight: 2 },
      { pattern: '\\b(affidavit|declaration of|exhibit a|exhibits|stipulation|proposed order|notarized)\\b', weight: 2 },
      { pattern: '\\b(retainer agreement|fee agreement|flat fee|iolta|trust account|client trust|billing statement)\\b', weight: 2 },
      { pattern: '\\b(probate|power of attorney|guardianship|living will|estate administration|trust amendment)\\b', weight: 2 },
      { pattern: '\\b(judge|magistrate|clerk of court|courthouse|jury|trial date|pretrial|pre-trial)\\b', weight: 2 },
      { pattern: '\\b(litigation|lawsuit|complaint filed|served with|service of process|summons|counterclaim)\\b', weight: 2 },
      { pattern: '\\b(law firm|law office|legal assistant|managing partner|partner meeting)\\b' },
      { pattern: '\\b(privileged|attorney-client|attorney client privilege|work product|confidential legal)\\b' }
    ]
  }
]
