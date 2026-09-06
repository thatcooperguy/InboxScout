import type { WorkProfile } from '../profiles'

/**
 * Life & home profiles: people whose inbox is mostly about running a life
 * rather than a job. For them the "important stream" is benefits, medical
 * notices, family logistics, the home, money, or paperwork — and the pulse
 * tracks those instead of work projects.
 */
export const LIFE_PROFILES: WorkProfile[] = [
  {
    id: 'retiree',
    name: 'Retiree / senior',
    group: 'life',
    icon: '🌅',
    tagline: 'Medicare, Social Security, pension, doctors, grandkids, and community life.',
    pulseName: 'Life Pulse',
    workDescription:
      'The user is retired. There is little or no employer mail; treat benefits and money notices (Medicare, Social Security, ' +
      'pension, annuities, retirement accounts), medical and pharmacy notices, and community or family plans as the important stream. ' +
      'Track each open matter as a claim or appointment, named by the agency, doctor, or plan it belongs to ' +
      '(for example "Medicare Part D enrollment" or "cardiology follow-up"). Newsletters and promotions are noise.',
    urgencyHints: [
      'enrollment or election windows closing (Medicare, Part D, pension options)',
      'a benefit notice that asks for a reply or a form by a date',
      'prescription refills running out or ready for pickup',
      'doctor appointments today or tomorrow',
      'anything that looks like a scam asking for money or account details',
      'family plans that need an answer'
    ],
    entityNoun: 'claim',
    defaultSkills: ['vip', 'bills', 'appointments', 'health', 'family', 'l-benefits', 'l-medications', 'l-statements'],
    signals: [
      { pattern: '\\b(medicare|medigap|medicare advantage|part d)\\b', weight: 3 },
      { pattern: '\\b(social security|ssa\\.gov|my social security)\\b', weight: 3 },
      { pattern: '\\b(pension|pension plan|pensioner|defined benefit)\\b', weight: 2 },
      { pattern: '\\b(aarp|silver ?sneakers|senior center|senior discount)\\b', weight: 3 },
      { pattern: '\\b(required minimum distribution|rmd)\\b', weight: 3 },
      { pattern: '\\b(annuity|annuities|401k rollover|ira distribution)\\b', weight: 2 },
      { pattern: '\\b(grandkids|grandchildren|grandson|granddaughter|grandma|grandpa)\\b', weight: 2 },
      { pattern: '\\b(retirement community|independent living|55\\+ community)\\b', weight: 2 },
      { pattern: '\\b(living trust|estate plan|beneficiary designation)\\b', weight: 2 },
      { pattern: '\\b(hearing aid|cataract|bone density|shingles vaccine)\\b', weight: 2 },
      { pattern: '\\b(supplemental plan|annual enrollment period|open enrollment for medicare)\\b', weight: 2 },
      { pattern: '\\b(church bulletin|garden club|bridge club|book club)\\b' },
      { pattern: '\\b(cruise|bus tour|senior trip)\\b' }
    ]
  },
  {
    id: 'parent',
    name: 'Parent / household manager',
    group: 'life',
    icon: '🧸',
    tagline: 'School, activities, the pediatrician, camps, carpools, and everyone\'s calendar.',
    pulseName: 'Family Pulse',
    workDescription:
      'The user runs a household with children. Employer mail may be absent or secondary; treat school notices, activities and ' +
      'practices, camps and registrations, pediatrician and dentist notices, and family logistics as the important stream. ' +
      'Track each child\'s commitments as appointments or projects, named by the child and the activity ' +
      '(for example "Maya — soccer season" or "Leo — summer camp signup"). Retail promotions are noise.',
    urgencyHints: [
      'permission slips, forms, or payments due this week',
      'registration or signup windows that fill up or close',
      'a practice, game, or pickup time that changed',
      'school closures, early dismissals, or a sick-child call',
      'pediatrician or dentist appointments today or tomorrow'
    ],
    entityNoun: 'appointment',
    defaultSkills: ['vip', 'bills', 'appointments', 'family', 'health', 'shipping', 'l-activities', 'l-medications'],
    signals: [
      { pattern: '\\b(pediatrician|pediatric|well[- ]child visit)\\b', weight: 3 },
      { pattern: '\\b(daycare|preschool|after[- ]?school care|before[- ]?school care)\\b', weight: 3 },
      { pattern: '\\b(classdojo|parentsquare|seesaw|brightwheel|procare|bloomz)\\b', weight: 3 },
      { pattern: '\\b(camp registration|summer camp|day camp|camp session)\\b', weight: 3 },
      { pattern: '\\b(your child|your student|your kiddo|your son|your daughter)\\b', weight: 2 },
      { pattern: '\\b(carpool|car ?line|school pickup|drop[- ]off line)\\b', weight: 2 },
      { pattern: '\\b(playdate|babysitter|sleepover|birthday party)\\b', weight: 2 },
      { pattern: '\\b(pta|pto|room parent|class parent|snack schedule)\\b', weight: 2 },
      { pattern: '\\b(little league|youth soccer|swim team|gymnastics|dance class|piano lesson)\\b', weight: 2 },
      { pattern: '\\b(lunch account|lunch money|school lunch|myschoolbucks)\\b', weight: 3 },
      { pattern: '\\b(picture day|spirit week|book fair|science fair)\\b', weight: 2 },
      { pattern: '\\b(permission slip|field trip|report card|early dismissal)\\b' },
      { pattern: '\\b(orthodontist|braces|immunization record)\\b', weight: 2 }
    ]
  },
  {
    id: 'caregiver',
    name: 'Caregiver for a family member',
    group: 'life',
    icon: '🤝',
    tagline: 'Managing a loved one\'s appointments, medications, insurance, and home care.',
    pulseName: 'Care Pulse',
    workDescription:
      'The user looks after an aging parent, spouse, or other relative. Treat that person\'s medical appointments, medications, ' +
      'insurance and benefit notices, home-care agency and facility messages, and legal or financial paperwork (power of attorney, ' +
      'care plans) as the important stream, even if the user also has a job. Track each open matter as a case named by the ' +
      'person and the topic (for example "Mom — cardiology" or "Dad — home health aide schedule").',
    urgencyHints: [
      'medications running out, prior authorizations, or a pharmacy waiting on a decision',
      'an appointment, discharge, or care-plan change in the next two days',
      'insurance or Medicaid paperwork with a response deadline',
      'a care agency or facility reporting a missed shift, fall, or incident',
      'legal documents (POA, advance directive) needing a signature'
    ],
    entityNoun: 'case',
    defaultSkills: ['vip', 'bills', 'appointments', 'health', 'family', 'l-medications', 'l-benefits'],
    signals: [
      { pattern: '\\b(power of attorney|healthcare proxy|advance directive|living will)\\b', weight: 3 },
      { pattern: '\\b(home care agency|home health aide|home health|in[- ]home care|caregiver)\\b', weight: 3 },
      { pattern: '\\b(hospice|palliative care|comfort care)\\b', weight: 3 },
      { pattern: '\\b(assisted living|memory care|nursing home|skilled nursing|rehab facility)\\b', weight: 3 },
      { pattern: '\\b(respite care|adult day care|adult day program)\\b', weight: 3 },
      { pattern: '\\b(medication list|pill organizer|med reminder|medication schedule)\\b', weight: 2 },
      { pattern: '\\b(care plan|plan of care|care conference|discharge plan)\\b', weight: 2 },
      { pattern: '\\b(dementia|alzheimer|parkinson|stroke recovery)\\b', weight: 2 },
      { pattern: '\\b(long[- ]term care insurance|medicaid waiver|medicaid application)\\b', weight: 3 },
      { pattern: '\\b(walker|wheelchair|hospital bed|durable medical equipment|oxygen supply)\\b', weight: 2 },
      { pattern: '\\b(?:mom|dad|mother|father|grandmother|grandfather)(?:\'s)? (?:appointment|medication|doctor|care|nurse)\\b', weight: 2 },
      { pattern: '\\b(family medical leave|fmla|caregiver support|caregiver leave)\\b' },
      { pattern: '\\b(fall risk|incident report|missed visit|shift coverage)\\b', weight: 2 }
    ]
  },
  {
    id: 'homeowner',
    name: 'Homeowner or renter',
    group: 'life',
    icon: '🔑',
    tagline: 'HOA, mortgage or rent, utilities, repairs, insurance, and warranties.',
    pulseName: 'Home Pulse',
    workDescription:
      'The user\'s important stream is their home: HOA or landlord notices, mortgage or rent, utilities, repair and service ' +
      'visits, home insurance and warranty claims, and deliveries. Employer mail, if any, is secondary. ' +
      'Track each open matter as a project named by what it is about (for example "roof leak repair" or "lease renewal"), ' +
      'with a status: waiting on quote, scheduled, done, or paid.',
    urgencyHints: [
      'rent, mortgage, or utility payments due or past due',
      'a repair visit, inspection, or delivery window in the next two days',
      'lease renewal, HOA violation, or insurance claim deadlines',
      'utility shutoff, water leak, or safety notices',
      'a contractor or landlord waiting on an answer'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'shipping', 'family', 'l-home'],
    signals: [
      { pattern: '\\b(hoa|homeowners association|condo association|association dues)\\b', weight: 3 },
      { pattern: '\\b(mortgage payment|mortgage statement|escrow shortage|property tax)\\b', weight: 2 },
      { pattern: '\\b(lease renewal|rent is due|rent payment|security deposit|move[- ]out inspection)\\b', weight: 3 },
      { pattern: '\\b(home warranty|appliance warranty|warranty claim)\\b', weight: 3 },
      { pattern: '\\b(homeowners insurance|renters insurance|home insurance|insurance claim adjuster)\\b', weight: 2 },
      { pattern: '\\b(water bill|electric bill|gas bill|trash pickup|recycling schedule)\\b', weight: 2 },
      { pattern: '\\b(plumber|hvac|furnace|water heater|roofer|electrician visit)\\b' },
      { pattern: '\\b(pest control|termite|lawn service|snow removal|gutter cleaning)\\b', weight: 2 },
      { pattern: '\\b(landlord|property manager|leasing office|maintenance request)\\b' },
      { pattern: '\\b(smart thermostat|nest|ring doorbell|home security system|adt)\\b', weight: 2 },
      { pattern: '\\b(home depot|lowe\'s|wayfair|ikea order)\\b', weight: 2 },
      { pattern: '\\b(neighborhood watch|nextdoor|block party|street parking permit)\\b', weight: 2 },
      { pattern: '\\b(renovation quote|kitchen remodel|bathroom remodel|contractor estimate)\\b', weight: 2 }
    ]
  },
  {
    id: 'jobseeker',
    name: 'Job seeker / between jobs',
    group: 'life',
    icon: '🔍',
    tagline: 'Applications, interviews, unemployment benefits, networking, and COBRA.',
    pulseName: 'Job Pipeline',
    workDescription:
      'The user is looking for work. There is no current employer mail; treat job applications, recruiter and interview messages, ' +
      'networking replies, unemployment benefits, and health coverage (COBRA, marketplace) as the important stream. ' +
      'Track each application as its own entity named by company and role, with a stage: applied, screening, interviewing, ' +
      'offer, or closed. Job-board digests are low priority unless they contain a reply from a real person.',
    urgencyHints: [
      'interview invitations that need a reply or scheduling',
      'an offer or deadline to accept',
      'unemployment claim certification or documents due',
      'COBRA or health-coverage election deadlines',
      'a recruiter or contact waiting on the user',
      'assessment or take-home tasks with a due date'
    ],
    entityNoun: 'application',
    defaultSkills: ['vip', 'bills', 'appointments', 'jobsearch', 'shipping', 'l-benefits'],
    signals: [
      { pattern: '\\b(unemployment (?:benefits|claim|insurance|office)|weekly certification|weekly claim)\\b', weight: 3 },
      { pattern: '\\b(cobra (?:election|coverage|continuation|notice))\\b', weight: 3 },
      { pattern: '\\b(indeed|ziprecruiter|glassdoor|linkedin jobs|dice\\.com|wellfound)\\b', weight: 2 },
      { pattern: '\\b(your application (?:was|has been|for)|application (?:status|received|update))\\b', weight: 2 },
      { pattern: '\\b(phone screen|screening call|hiring manager|talent acquisition)\\b', weight: 3 },
      { pattern: '\\b(resume|résumé|cover letter|portfolio review)\\b', weight: 2 },
      { pattern: '\\b(severance|final paycheck|separation agreement|layoff)\\b', weight: 2 },
      { pattern: '\\b(job fair|career fair|career coach|outplacement)\\b', weight: 3 },
      { pattern: '\\b(interview (?:invitation|scheduled|confirmation|loop|panel)|second[- ]round|final round)\\b', weight: 2 },
      { pattern: '\\b(take[- ]home assignment|coding assessment|skills assessment|hackerrank)\\b', weight: 3 },
      { pattern: '\\b(networking coffee|informational interview|referral for)\\b', weight: 2 },
      { pattern: '\\b(job alert|new jobs (?:for|matching)|recommended jobs)\\b' },
      { pattern: '\\b(health insurance marketplace|healthcare\\.gov|special enrollment period)\\b', weight: 2 }
    ]
  },
  {
    id: 'volunteer',
    name: 'Volunteer / community organizer',
    group: 'life',
    icon: '🙌',
    tagline: 'Signups, rosters, fundraisers, meetings, and keeping a club or league running.',
    pulseName: 'Community Pulse',
    workDescription:
      'The user organizes or leads a community group: a club, league, troop, congregation committee, or volunteer effort. ' +
      'Treat signups, rosters, schedules, fundraisers, venue bookings, and messages from members and other organizers as the ' +
      'important stream; a paying job, if any, is separate. Track each event or drive as a project named by the event ' +
      '(for example "spring fundraiser" or "fall league registration"), with what is still needed.',
    urgencyHints: [
      'an event in the next few days that is short on volunteers or supplies',
      'venue, permit, or field bookings that need confirmation',
      'registration or signup deadlines',
      'a member or parent waiting on an answer',
      'money collected or owed for the group'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'family', 'shipping', 'l-activities'],
    signals: [
      { pattern: '\\b(signupgenius|sign ?up genius|volunteer sign ?up|signup sheet)\\b', weight: 3 },
      { pattern: '\\b(volunteer (?:shift|hours|coordinator|needed|opportunity))\\b', weight: 3 },
      { pattern: '\\b(roster|team roster|league roster|member list)\\b', weight: 2 },
      { pattern: '\\b(fundraiser|fundraising|bake sale|raffle|silent auction|gofundme)\\b', weight: 2 },
      { pattern: '\\b(booster club|boosters|little league board|rec league|adult league)\\b', weight: 3 },
      { pattern: '\\b(troop|scoutmaster|den leader|scouts)\\b', weight: 3 },
      { pattern: '\\b(potluck|community cleanup|food drive|coat drive|toy drive)\\b', weight: 3 },
      { pattern: '\\b(field permit|park reservation|pavilion rental|hall rental)\\b', weight: 3 },
      { pattern: '\\b(committee meeting|meeting minutes|agenda for|quorum)\\b' },
      { pattern: '\\b(membership dues|membership renewal|new member)\\b', weight: 2 },
      { pattern: '\\b(teamsnap|leagueapps|sportsengine|mailchimp campaign|eventbrite)\\b', weight: 3 },
      { pattern: '\\b(referee|umpire|coach assignments|game schedule)\\b', weight: 2 },
      { pattern: '\\b(parish council|vestry|congregation|youth group)\\b', weight: 2 }
    ]
  },
  {
    id: 'investor',
    name: 'Personal investor / side-hustler',
    group: 'life',
    icon: '📈',
    tagline: 'Brokerage, dividends, tax forms, a rental or two, maybe some crypto.',
    pulseName: 'Money Pulse',
    workDescription:
      'The user manages their own investments and side income: brokerage and retirement accounts, dividends and statements, ' +
      'tax forms, a rental property or small side business, and possibly crypto. Treat those as the important stream; ' +
      'an employer, if any, is separate. Track each holding, property, or side venture as a project named plainly ' +
      '(for example "Elm St rental" or "brokerage — Roth IRA"), with any deadline attached.',
    urgencyHints: [
      'tax forms arriving or filing deadlines',
      'margin calls, failed transfers, or security alerts on an account',
      'a tenant, buyer, or customer waiting on a reply',
      'statements that show an unexpected charge or missing payment',
      'estimated tax payments due'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'shipping', 'l-statements', 'l-home'],
    signals: [
      { pattern: '\\b(brokerage|brokerage account|trade confirmation|order executed)\\b', weight: 3 },
      { pattern: '\\b(dividend|dividends|dividend reinvestment|drip)\\b', weight: 3 },
      { pattern: '\\b(1099-div|1099-int|1099-b|1099-r|schedule k-1|form 8949)\\b', weight: 3 },
      { pattern: '\\b(schwab|fidelity|vanguard|robinhood|e\\*trade|etrade|interactive brokers|webull|m1 finance)\\b', weight: 3 },
      { pattern: '\\b(coinbase|kraken|binance|crypto|bitcoin|ethereum|cold wallet)\\b', weight: 2 },
      { pattern: '\\b(capital gains|cost basis|wash sale|tax[- ]loss harvesting)\\b', weight: 3 },
      { pattern: '\\b(rental income|tenant|rent received|security deposit refund)\\b' },
      { pattern: '\\b(roth ira|traditional ira|sep ira|solo 401k|hsa contribution)\\b', weight: 2 },
      { pattern: '\\b(estimated tax|quarterly tax|1040-es|turbotax|self[- ]employment tax)\\b', weight: 2 },
      { pattern: '\\b(etsy shop|ebay sales|side hustle|side gig|airbnb host|turo)\\b', weight: 3 },
      { pattern: '\\b(monthly statement is available|statement is ready|account statement)\\b' },
      { pattern: '\\b(expense ratio|index fund|etf|bond ladder|treasury direct|i bonds)\\b', weight: 2 },
      { pattern: '\\b(margin call|options expiration|limit order|stop loss)\\b', weight: 3 }
    ]
  },
  {
    id: 'military',
    name: 'Military / veteran family',
    group: 'life',
    icon: '🎖️',
    tagline: 'VA, TRICARE, PCS orders, deployment news, base housing, and family readiness.',
    pulseName: 'Family Readiness',
    workDescription:
      'The user is a service member, veteran, or military spouse. Treat VA and TRICARE notices, PCS orders and moves, ' +
      'deployment and unit family-readiness messages, base housing, pay and allowances, and benefit claims as the important ' +
      'stream. Track each open matter as a case named by the agency or event (for example "VA disability claim" or ' +
      '"PCS to Fort X — housing"), with its next date.',
    urgencyHints: [
      'report dates, PCS move windows, or orders that changed',
      'VA or TRICARE appointments, claim evidence requests, and appeal deadlines',
      'housing move-in, move-out, or inspection dates',
      'pay, BAH, or allowance problems',
      'family readiness alerts during a deployment',
      'ID card, DEERS, or enrollment expirations'
    ],
    entityNoun: 'case',
    defaultSkills: ['vip', 'bills', 'appointments', 'health', 'family', 'travel', 'l-orders', 'l-benefits'],
    signals: [
      { pattern: '\\b(tricare|tricare prime|tricare select|military treatment facility)\\b', weight: 3 },
      { pattern: '\\b(veterans affairs|va\\.gov|va (?:claim|benefits|disability|appointment|medical center|clinic))\\b', weight: 3 },
      { pattern: '\\b(pcs orders|permanent change of station|pcs move|household goods shipment|tmo)\\b', weight: 3 },
      { pattern: '\\b(deployment|deployed|homecoming|redeployment|pre[- ]deployment)\\b', weight: 2 },
      { pattern: '\\b(bah|basic allowance for housing|bas|hazard pay|drill pay)\\b', weight: 3 },
      { pattern: '\\b(deers|id card office|rapids appointment|milconnect)\\b', weight: 3 },
      { pattern: '\\b(commissary|exchange|aafes|nex|mwr)\\b', weight: 2 },
      { pattern: '\\b(base housing|on[- ]post housing|privatized housing|housing office)\\b', weight: 3 },
      { pattern: '\\b(family readiness|frg|ombudsman|key spouse|unit family)\\b', weight: 3 },
      { pattern: '\\b(gi bill|tuition assistance|post[- ]9/11|yellow ribbon)\\b', weight: 3 },
      { pattern: '\\b(mypay|dfas|leave and earnings statement|thrift savings plan|tsp)\\b', weight: 3 },
      { pattern: '@[a-z0-9.-]*\\.mil\\b', weight: 3 },
      { pattern: '\\b(reenlistment|separation orders|ets date|terminal leave|dd[- ]?214)\\b', weight: 3 },
      { pattern: '\\b(vfw|american legion|wounded warrior|uso|military onesource)\\b', weight: 3 }
    ]
  },
  {
    id: 'traveler',
    name: 'Frequent traveler / expat / digital nomad',
    group: 'life',
    icon: '🧳',
    tagline: 'Visas, bookings, currency, remote work across time zones, and the next flight.',
    pulseName: 'Trip Pulse',
    workDescription:
      'The user travels or lives abroad much of the time, often working remotely. Treat bookings and itineraries, visas and ' +
      'passports, currency and banking abroad, accommodation, and remote-work logistics as the important stream. ' +
      'Track each trip or stay as its own entity named by destination and dates (for example "Lisbon — Oct 3 to 20"), ' +
      'with flights, lodging, and any visa or check-in deadline attached.',
    urgencyHints: [
      'flight changes, cancellations, or check-in windows opening',
      'visa, passport, or entry-permit expirations and application deadlines',
      'accommodation check-in or check-out in the next two days',
      'bank or card blocks while abroad',
      'a client or employer meeting across time zones needing confirmation'
    ],
    entityNoun: 'trip',
    defaultSkills: ['vip', 'bills', 'appointments', 'travel', 'shipping', 'l-immigration'],
    signals: [
      { pattern: '\\b(schengen|visa on arrival|e-?visa|tourist visa|visa run|entry permit)\\b', weight: 3 },
      { pattern: '\\b(airbnb|booking\\.com|hostelworld|agoda|vrbo|expedia|kayak)\\b', weight: 2 },
      { pattern: '\\b(digital nomad|nomad visa|coworking|coliving|remote year)\\b', weight: 3 },
      { pattern: '\\b(currency exchange|exchange rate|wise transfer|revolut|foreign transaction fee)\\b', weight: 3 },
      { pattern: '\\b(esim|airalo|local sim|roaming plan|pocket wifi)\\b', weight: 3 },
      { pattern: '\\b(tsa precheck|global entry|priority pass|lounge access|fast track)\\b', weight: 3 },
      { pattern: '\\b(frequent flyer|award booking|elite status|upgrade cleared|miles expir)\\b', weight: 3 },
      { pattern: '\\b(travel insurance|safetywing|world nomads|trip protection)\\b', weight: 3 },
      { pattern: '\\b(layover|red-?eye|nonstop|overnight train|ferry booking)\\b', weight: 2 },
      { pattern: '\\b(passport renewal|passport expir|passport photos|second passport)\\b', weight: 3 },
      { pattern: '\\b(expat|expatriate|residence permit|long[- ]stay visa|foreign resident)\\b', weight: 2 },
      { pattern: '\\b(time zone|timezone|utc[+-]|your local time)\\b' },
      { pattern: '\\b(boarding pass|itinerary|gate change|flight status)\\b' },
      { pattern: '\\b(luggage storage|packing list|carry-on only|checked bag fee)\\b', weight: 2 }
    ]
  },
  {
    id: 'newcomer',
    name: 'New to the country',
    group: 'life',
    icon: '🌍',
    tagline: 'USCIS, an immigration lawyer, English classes, and setting up SSN, DMV, and bank.',
    pulseName: 'Settling-in Pulse',
    workDescription:
      'The user recently moved to the country and is getting established. Treat immigration case mail (USCIS notices, lawyer ' +
      'messages, biometrics and interview dates), setup tasks (Social Security card, driver license, bank, housing, phone), ' +
      'English classes, translations and document requests, and school or job onboarding as the important stream. ' +
      'Track each open matter as a case named by its purpose (for example "work permit — I-765" or "driver license test"). ' +
      'Explain jargon and acronyms in plain words.',
    urgencyHints: [
      'USCIS notices with a response or appointment date (biometrics, interview, request for evidence)',
      'status, permit, or visa expiration dates',
      'lawyer requests for documents or signatures',
      'appointments at government offices (SSA, DMV, consulate) in the next few days',
      'lease, bank, or school deadlines that need documents',
      'anything that looks like a scam pretending to be the government'
    ],
    entityNoun: 'case',
    defaultSkills: ['vip', 'bills', 'appointments', 'health', 'family', 'l-immigration', 'l-benefits', 'l-home'],
    signals: [
      { pattern: '\\b(uscis|u\\.s\\. citizenship and immigration|@uscis\\.dhs\\.gov)\\b', weight: 3 },
      { pattern: '\\b(green card|permanent resident card|i-485|i-130|i-765|i-140|employment authorization document)\\b', weight: 3 },
      { pattern: '\\b(biometrics appointment|asc appointment|fingerprint appointment)\\b', weight: 3 },
      { pattern: '\\b(naturalization|n-400|citizenship interview|oath ceremony|civics test)\\b', weight: 3 },
      { pattern: '\\b(immigration (?:lawyer|attorney|law firm|paralegal)|request for evidence|rfe response)\\b', weight: 3 },
      { pattern: '\\b(esl class|english class|english as a second language|language school|toefl|ielts)\\b', weight: 3 },
      { pattern: '\\b(social security card|ssn application|ssa office appointment)\\b', weight: 3 },
      { pattern: '\\b(dmv appointment|driver license test|learner permit|knowledge test|real id)\\b', weight: 2 },
      { pattern: '\\b(certified translation|translated copy|notarized translation|apostille)\\b', weight: 3 },
      { pattern: '\\b(receipt number|case status|priority date|visa bulletin|processing time)\\b', weight: 2 },
      { pattern: '\\b(i-94|arrival record|port of entry|customs and border)\\b', weight: 3 },
      { pattern: '\\b(credential evaluation|foreign degree|foreign transcript|equivalency)\\b', weight: 3 },
      { pattern: '\\b(welcome center|newcomer|refugee|asylum|resettlement agency)\\b', weight: 2 },
      { pattern: '\\b(consulate appointment|embassy appointment|visa stamping|consular)\\b', weight: 2 }
    ]
  }
]
