import type { WorkProfile } from '../profiles'

/**
 * Creative, tech & independent: people whose work arrives as pull requests,
 * tickets, shoots, gigs, orders, bookings and reviews rather than memos.
 */
export const CREATIVE_PROFILES: WorkProfile[] = [
  {
    id: 'developer',
    name: 'Software developer / engineer',
    group: 'creative',
    icon: '💻',
    tagline: 'Pull requests, build failures, on-call pages, tickets, and deploys.',
    pulseName: 'Build Pulse',
    workDescription:
      'The user writes software. Work mail includes code review and pull-request notices, CI build and deploy results, ' +
      'issue trackers, on-call alerts and incidents, cloud and hosting bills, package and security advisories, and messages ' +
      'from teammates, product managers, and clients. Track each active project or repository as its own entity, named by ' +
      'repo or project name. Newsletters and tool marketing are noise unless they announce a breaking change.',
    urgencyHints: [
      'production incidents, failed deploys, or on-call pages',
      'pull requests waiting on the user to review or fix',
      'security advisories for packages the user depends on',
      'sprint deadlines and release dates',
      'cloud or hosting bills and quota warnings'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-incidents', 'k-renewals'],
    signals: [
      { pattern: '\\b(pull request|merge request|code review|requested changes|approved your pr)\\b', weight: 3 },
      { pattern: '\\b(github|gitlab|bitbucket)\\b', weight: 2 },
      { pattern: 'noreply@github\\.com|notifications@github\\.com|gitlab@|@bitbucket\\.org', weight: 2 },
      { pattern: '\\b(jira|linear\\.app|jira ticket|sprint planning|standup|retro)\\b', weight: 2 },
      { pattern: '\\b(pagerduty|opsgenie|on-call rotation|incident\\.io|statuspage)\\b', weight: 3 },
      { pattern: '\\b(vercel|netlify|heroku|render\\.com|fly\\.io|aws billing|cloudflare|digitalocean)\\b', weight: 2 },
      { pattern: '\\b(npm|yarn|pnpm|dependabot|pypi|cargo|package\\.json)\\b', weight: 3 },
      { pattern: '\\b(build failed|pipeline failed|ci failed|tests? failing|github actions|circleci|jenkins)\\b', weight: 3 },
      { pattern: '\\b(deploy preview|deployment failed|deployed to production|rollback|hotfix)\\b', weight: 2 },
      { pattern: '\\b(stack trace|null pointer|segfault|uncaught exception|sentry|datadog|grafana)\\b', weight: 2 },
      { pattern: '\\b(api key|webhook|sdk|endpoint|rate limit|oauth token)\\b', weight: 2 },
      { pattern: '\\b(open source|repo|readme|changelog|semver|release notes)\\b' },
      { pattern: '\\b(hacker news|stack overflow|dev\\.to|lobste\\.rs)\\b' },
      { pattern: '\\b(docker|kubernetes|k8s|terraform|postgres|redis)\\b', weight: 2 }
    ]
  },
  {
    id: 'itadmin',
    name: 'IT admin / helpdesk / managed services',
    group: 'creative',
    icon: '🖥️',
    tagline: 'Tickets, backups, user accounts, patches, and the printer again.',
    pulseName: 'Systems Pulse',
    workDescription:
      'The user keeps computers, accounts, and networks running for an organisation or for managed-services clients. ' +
      'Work mail includes helpdesk tickets, monitoring and backup reports, Microsoft 365 or Google Workspace admin notices, ' +
      'security alerts, license and hardware renewals, vendor support cases, and user requests. Track each open ticket or ' +
      'client site as its own entity, named by ticket number or site name.',
    urgencyHints: [
      'servers, email, or internet down for users',
      'security alerts, phishing reports, or account compromises',
      'failed backups',
      'tickets breaching their response time',
      'license or certificate expirations',
      'new-starter accounts needed by a start date'
    ],
    entityNoun: 'ticket',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-incidents', 'k-renewals'],
    signals: [
      { pattern: '\\b(ticket queue|helpdesk|help desk|service desk|new ticket|ticket #?\\d{3,})\\b', weight: 3 },
      { pattern: '\\b(zendesk|freshdesk|freshservice|connectwise|autotask|servicenow|halo psa)\\b', weight: 3 },
      { pattern: '\\b(rmm|ninjaone|datto|kaseya|n-able|atera|syncro)\\b', weight: 3 },
      { pattern: '\\b(microsoft 365 admin|m365 admin|entra id|azure ad|intune|active directory|group policy|exchange online)\\b', weight: 3 },
      { pattern: '\\b(backup (?:failed|completed|report|job)|veeam|acronis|backblaze|restore point)\\b', weight: 2 },
      { pattern: '\\b(phishing report|mfa reset|endpoint protection|sentinelone|crowdstrike|huntress|bitdefender)\\b', weight: 2 },
      { pattern: '\\b(password reset|account lockout|locked out of|new user setup|offboarding request)\\b', weight: 2 },
      { pattern: '\\b(vpn (?:down|access|not connecting)|wifi (?:down|not working)|printer (?:offline|not printing)|laptop (?:setup|replacement))\\b', weight: 2 },
      { pattern: '\\b(patch tuesday|windows update|firmware update|end of life|eol notice)\\b', weight: 2 },
      { pattern: '\\b(domain controller|hyper-v|vmware|vsphere|firewall|fortinet|sonicwall|meraki|ubiquiti|unifi)\\b', weight: 2 },
      { pattern: '\\b(license renewal|seat count|user licenses|cal licenses|volume licensing)\\b', weight: 2 },
      { pattern: '\\b(msp|managed services|sla breach|response time sla|monthly it report)\\b', weight: 2 },
      { pattern: '\\b(ups battery|server room|rack|nas|synology|raid)\\b' },
      { pattern: '\\b(google workspace admin|admin console|dns records|ssl certificate|spf|dkim|dmarc)\\b', weight: 2 }
    ]
  },
  {
    id: 'designer',
    name: 'Designer / creative freelancer',
    group: 'creative',
    icon: '🎨',
    tagline: 'Briefs, revisions, brand kits, proofs, and clients who want it by Friday.',
    pulseName: 'Design Pulse',
    workDescription:
      'The user is a graphic, brand, web, or product designer, often freelance. Work mail includes creative briefs, ' +
      'feedback and revision rounds, file and proof approvals, printers, stock and font licences, design tools, ' +
      'freelance platforms, and client invoices. Track each client project as its own entity, named by client and project ' +
      '(for example "Acme rebrand"), with a stage: brief, concepts, revisions, final files, or paid.',
    urgencyHints: [
      'revisions or approvals a client is waiting on',
      'print deadlines and press dates',
      'files due for a launch date',
      'unpaid invoices from clients',
      'new project inquiries that need a reply'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-collabs', 'k-gigs', 'k-renewals'],
    signals: [
      { pattern: '\\b(figma|sketch app|adobe xd|invision|zeplin|framer)\\b', weight: 3 },
      { pattern: '\\b(dribbble|behance|awwwards|creative market)\\b', weight: 3 },
      { pattern: '\\b(brand kit|brand guidelines|brand identity|logo (?:concepts|files|design)|rebrand)\\b', weight: 3 },
      { pattern: '\\b(creative cloud|illustrator|photoshop|indesign|after effects|canva pro|affinity)\\b', weight: 2 },
      { pattern: '\\b(revision round|round of revisions|round 2|v2 comps|design feedback|comments on the mockup)\\b', weight: 2 },
      { pattern: '\\b(print-ready|bleed|cmyk|pantone|300 dpi|vector files|die line|proof approval)\\b', weight: 3 },
      { pattern: '\\b(font licen(?:c|s)e|typeface|adobe fonts|typekit|google fonts)\\b', weight: 2 },
      { pattern: '\\b(wireframes?|prototype|ui kit|design system|style guide|moodboard|mood board)\\b', weight: 2 },
      { pattern: '\\b(upwork|fiverr|99designs|contra|toptal|dribbble jobs)\\b', weight: 2 },
      { pattern: '\\b(final files|source files|deliverables|export(?:ed)? the assets|packaging design)\\b', weight: 2 },
      { pattern: '\\b(creative brief|design brief|kickoff call|scope of work)\\b', weight: 2 },
      { pattern: '\\b(shutterstock|unsplash|getty|stock photo|icon set)\\b' },
      { pattern: '\\b(webflow|squarespace|wix|landing page design|hero image)\\b' }
    ]
  },
  {
    id: 'writer',
    name: 'Writer / journalist / content creator / influencer',
    group: 'creative',
    icon: '✍️',
    tagline: 'Pitches, editors, bylines, drafts due, sponsorships, and brand deals.',
    pulseName: 'Story Pulse',
    workDescription:
      'The user writes or creates content for a living: articles, books, newsletters, videos, or social posts. Work mail ' +
      'includes editors and pitches, assignments and deadlines, sources and interview requests, publishers and agents, ' +
      'newsletter and platform notices, sponsorships and brand deals, and payment for published work. Track each assignment, ' +
      'pitch, or deal as its own entity, named by outlet or brand and working title.',
    urgencyHints: [
      'drafts, edits, or revisions due to an editor',
      'sources or interviewees waiting on a reply',
      'sponsorship or brand-deal offers with response deadlines',
      'unpaid invoices for published work',
      'embargoes and publication dates'
    ],
    entityNoun: 'assignment',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-collabs'],
    signals: [
      { pattern: '\\b(your pitch|pitch (?:accepted|declined|for)|pitching|assignment letter|commission(?:ed)? (?:piece|article))\\b', weight: 3 },
      { pattern: '\\b(editor|managing editor|editor-in-chief|copy ?edit|copyedits|line edits)\\b', weight: 2 },
      { pattern: '\\b(byline|word count|first draft|draft due|filed the story|filing (?:by|on))\\b', weight: 3 },
      { pattern: '\\b(sponsorship|sponsored post|brand deal|brand partnership|paid partnership|affiliate link|media kit)\\b', weight: 3 },
      { pattern: '\\b(substack|beehiiv|medium\\.com|ghost newsletter|convertkit|paid subscribers)\\b', weight: 3 },
      { pattern: '\\b(press release|embargo|on the record|off the record|interview request|comment request)\\b', weight: 2 },
      { pattern: '\\b(manuscript|query letter|literary agent|book proposal|publisher|advance copy|arc)\\b', weight: 2 },
      { pattern: '\\b(creator fund|patreon|youtube partner|tiktok shop|instagram collab|reels)\\b', weight: 2 },
      { pattern: '\\b(op-ed|feature story|column|freelance rate|per word|kill fee)\\b', weight: 3 },
      { pattern: '\\b(fact-check|fact check|galley|page proofs|style guide changes|ap style)\\b', weight: 2 },
      { pattern: '\\b(kdp|book royalties|audiobook|isbn|book launch|pub date)\\b', weight: 2 },
      { pattern: '\\b(ghostwriting|content writer|blog post draft|seo article|copywriting)\\b', weight: 2 },
      { pattern: '\\b(muck rack|help a reporter|haro|qwoted|press pass)\\b', weight: 2 }
    ]
  },
  {
    id: 'photographer',
    name: 'Photographer / videographer / event pro',
    group: 'creative',
    icon: '📷',
    tagline: 'Shoots, galleries, second shooters, retainers, and edit deadlines.',
    pulseName: 'Shoot Pulse',
    workDescription:
      'The user photographs or films weddings, portraits, events, products, or commercial work. Work mail includes ' +
      'booking inquiries, contracts and retainers, shoot-day logistics and timelines, gallery and video delivery, ' +
      'second shooters and assistants, gear rentals, labs and print orders, and client payments. Track each shoot as its ' +
      'own entity, named by client and shoot date, with a stage: inquiry, booked, shot, editing, or delivered.',
    urgencyHints: [
      'shoot dates in the next few days and their timelines',
      'retainers or contracts a client has not returned',
      'gallery or video delivery deadlines',
      'second shooters or assistants who have not confirmed',
      'new inquiries for dates that could book out'
    ],
    entityNoun: 'shoot',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-bookings', 'k-gigs', 'k-collabs'],
    signals: [
      { pattern: '\\b(photo ?shoot|shoot date|shoot day|the shoot|video shoot|engagement session|mini sessions?)\\b', weight: 3 },
      { pattern: '\\b(gallery (?:delivery|is ready|link|expires)|online gallery|proof gallery|sneak peek)\\b', weight: 3 },
      { pattern: '\\b(pixieset|pic-time|shootproof|smugmug|cloudspot|passgallery)\\b', weight: 3 },
      { pattern: '\\b(second shooter|assistant for the wedding|shot list|wedding timeline|first look)\\b', weight: 3 },
      { pattern: '\\b(retainer|session fee|print release|usage rights|image licen(?:c|s)e)\\b', weight: 2 },
      { pattern: '\\b(headshots|senior portraits|family session|newborn session|boudoir|maternity session)\\b', weight: 3 },
      { pattern: '\\b(raw files|culling|edited images|final edits|retouching|lightroom|capture one)\\b', weight: 3 },
      { pattern: '\\b(drone footage|b-roll|highlight film|videography|wedding film|color grade)\\b', weight: 2 },
      { pattern: '\\b(honeybook|dubsado|studio ninja|tave|iris works)\\b', weight: 3 },
      { pattern: '\\b(gear rental|lensrentals|camera body|prime lens|sony a7|canon r5|memory cards)\\b', weight: 2 },
      { pattern: '\\b(event coverage|hourly coverage|coverage hours|call time|golden hour)\\b', weight: 2 },
      { pattern: '\\b(print lab|album design|wall art|canvas prints|photo book)\\b', weight: 2 },
      { pattern: '\\b(wedding wire|the knot|zola vendor|wedding inquiry|elopement)\\b', weight: 2 }
    ]
  },
  {
    id: 'musician',
    name: 'Musician / performer / artist with gigs',
    group: 'creative',
    icon: '🎸',
    tagline: 'Gigs, setlists, venues, booking fees, merch, and rehearsals.',
    pulseName: 'Gig Pulse',
    workDescription:
      'The user performs music, comedy, or another live act, and may teach, record, or sell merch on the side. Work mail ' +
      'includes gig offers and confirmations, venues and promoters, contracts and booking fees, setlists and load-in times, ' +
      'bandmates and subs, rehearsal and studio time, streaming and royalty notices, merch and ticket sales. Track each gig ' +
      'as its own entity, named by venue and date, with a stage: offered, confirmed, played, or paid.',
    urgencyHints: [
      'gig confirmations and contracts awaiting a signature',
      'load-in, soundcheck, and call times for the next few days',
      'booking fees or deposits not yet paid',
      'bandmates or subs who have not confirmed',
      'ticket sales, tech riders, or setlists a venue is waiting on'
    ],
    entityNoun: 'gig',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-gigs', 'k-collabs'],
    signals: [
      { pattern: '\\b(gig|gigs|gig offer|gig confirmed|gig tonight|sub gig)\\b', weight: 3 },
      { pattern: '\\b(setlist|set list|set times?|soundcheck|sound check|load-in|load in)\\b', weight: 3 },
      { pattern: '\\b(venue|the venue|talent buyer|promoter|booking agent)\\b', weight: 2 },
      { pattern: '\\b(booking fee|performance fee|guarantee plus|door split|door deal|backline)\\b', weight: 3 },
      { pattern: '\\b(merch|merch table|bandcamp|vinyl pressing|t-shirt order)\\b', weight: 3 },
      { pattern: '\\b(tour dates|routing|green room|hospitality rider|tech rider|stage plot)\\b', weight: 3 },
      { pattern: '\\b(spotify for artists|distrokid|cd baby|tunecore|ascap|bmi|sesac|soundexchange)\\b', weight: 3 },
      { pattern: '\\b(rehearsal|band practice|dep gig|need a sub|bandmates?)\\b', weight: 2 },
      { pattern: '\\b(open mic|residency|house band|cover band|wedding band|corporate gig)\\b', weight: 2 },
      { pattern: '\\b(studio session|mixing|mastering|tracking session|session musician)\\b', weight: 2 },
      { pattern: '\\b(lead sheet|charts for|sheet music|horn charts|key of)\\b', weight: 2 },
      { pattern: '\\b(gigsalad|the bash|bandsintown|songkick|sonicbids)\\b', weight: 3 },
      { pattern: '\\b(album release|single release|ep release|press kit|epk|release show)\\b', weight: 2 },
      { pattern: '\\b(ticket sales|tickets sold|presale|door time|doors at)\\b', weight: 2 }
    ]
  },
  {
    id: 'ecommerce',
    name: 'Online seller / retail shop owner',
    group: 'creative',
    icon: '🛍️',
    tagline: 'Orders, returns, chargebacks, stock levels, and marketplace notices.',
    pulseName: 'Shop Pulse',
    workDescription:
      'The user sells products online or in a small shop. Work mail includes orders and shipping, returns and refunds, ' +
      'chargebacks and disputes, marketplace notices (Shopify, Etsy, Amazon, eBay), inventory and suppliers, customer ' +
      'questions and reviews, payment processors, and sales tax. Track each order issue, supplier, or marketplace case as ' +
      'its own entity, named by order number or supplier.',
    urgencyHints: [
      'chargebacks or disputes with a response deadline',
      'marketplace warnings about account health or suspension',
      'items out of stock or late from a supplier',
      'customer complaints and unanswered order questions',
      'payout holds or payment processor problems'
    ],
    entityNoun: 'order',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-orders', 'k-reviews', 'shipping'],
    signals: [
      { pattern: '\\b(shopify|etsy|woocommerce|bigcommerce|squarespace commerce|ebay seller)\\b', weight: 3 },
      { pattern: '\\b(amazon seller central|seller central|fba|fbm|buy box|a-to-z claim|account health)\\b', weight: 3 },
      { pattern: 'noreply@.*shopify|@etsy\\.com|seller-notification@amazon|@ebay\\.com', weight: 3 },
      { pattern: '\\b(sku|skus|low stock|out of stock|restock|inventory count|reorder point)\\b', weight: 3 },
      { pattern: '\\b(chargeback|payment dispute|disputed charge|return request|refund request|rma)\\b', weight: 3 },
      { pattern: '\\b(new order #?\\d+|order #\\d{3,}|order confirmation for|unfulfilled orders?)\\b', weight: 2 },
      { pattern: '\\b(shipstation|pirate ship|easyship|3pl|fulfillment center|shipping labels?)\\b', weight: 2 },
      { pattern: '\\b(listing (?:suspended|removed|deactivated)|policy violation|ip complaint|counterfeit claim)\\b', weight: 3 },
      { pattern: '\\b(product review|seller feedback|star rating|customer left)\\b', weight: 2 },
      { pattern: '\\b(abandoned cart|klaviyo|discount code|promo code|flash sale)\\b', weight: 2 },
      { pattern: '\\b(alibaba|wholesale order|moq|dropship|faire|printful|printify)\\b', weight: 2 },
      { pattern: '\\b(sales tax nexus|avalara|taxjar|marketplace facilitator)\\b', weight: 2 },
      { pattern: '\\b(payout (?:hold|delayed|scheduled)|stripe payout|paypal dispute|square invoice)\\b', weight: 2 },
      { pattern: '\\b(product photos|listing photos|packaging supplies|poly mailers|barcode|upc)\\b' }
    ]
  },
  {
    id: 'restaurant',
    name: 'Restaurant / café / food-truck / catering owner',
    group: 'creative',
    icon: '🍽️',
    tagline: 'Reservations, food orders, health inspections, delivery apps, and staff shifts.',
    pulseName: 'Kitchen Pulse',
    workDescription:
      'The user runs a restaurant, café, bar, food truck, or catering business. Work mail includes food and beverage ' +
      'suppliers, delivery-app and POS notices, reservations and catering inquiries, health and liquor permits, staff ' +
      'scheduling, equipment repairs, reviews, and rent or utilities for the premises. Track each catering event, ' +
      'supplier issue, or inspection as its own entity, named by event date or supplier.',
    urgencyHints: [
      'health inspections, permits, and licence renewals',
      'supplier deliveries that are late, short, or wrong',
      'catering orders and large reservations for the next few days',
      'delivery-app or POS outages and payout problems',
      'staff calling out or shifts uncovered',
      'bad reviews needing a reply'
    ],
    entityNoun: 'event',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-bookings', 'k-reviews', 'customers'],
    signals: [
      { pattern: '\\b(health inspection|health department|health inspector|food safety|servsafe|food handler)\\b', weight: 3 },
      { pattern: '\\b(food cost|prime cost|menu pricing|plate cost|86\'?d|86 list)\\b', weight: 3 },
      { pattern: '\\b(doordash|ubereats|uber eats|grubhub|postmates|delivery app|merchant portal)\\b', weight: 3 },
      { pattern: '\\b(reservations?|opentable|resy|tock|covers tonight|party of \\d+|large party)\\b', weight: 2 },
      { pattern: '\\b(toast pos|square for restaurants|clover|pos system|kds|kitchen display)\\b', weight: 3 },
      { pattern: '\\b(sysco|us foods|restaurant depot|produce order|produce delivery|bakery order|meat order)\\b', weight: 3 },
      { pattern: '\\b(catering (?:order|inquiry|quote|request)|food truck|commissary|catering menu)\\b', weight: 3 },
      { pattern: '\\b(liquor license|abc license|health permit|grease trap|hood cleaning|fire suppression)\\b', weight: 3 },
      { pattern: '\\b(line cook|prep cook|dishwasher|sous chef|barista|bartender|shift lead)\\b', weight: 2 },
      { pattern: '\\b(7shifts|homebase|sling|when i work|schedulefly)\\b', weight: 2 },
      { pattern: '\\b(menu (?:update|change)|specials|brunch|happy hour|prix fixe|tasting menu)\\b', weight: 2 },
      { pattern: '\\b(walk-in cooler|reach-in|fryer|espresso machine|ice machine|hood vent)\\b', weight: 2 },
      { pattern: '\\b(yelp for business|google business profile|tripadvisor|new review on)\\b' },
      { pattern: '\\b(no call no show|called out sick|cover the shift|closing shift|opening shift)\\b', weight: 2 }
    ]
  },
  {
    id: 'studio',
    name: 'Salon / spa / gym / fitness or yoga studio owner',
    group: 'creative',
    icon: '🧘',
    tagline: 'Class schedules, memberships, bookings, no-shows, and stylists or instructors.',
    pulseName: 'Studio Pulse',
    workDescription:
      'The user runs a salon, spa, barbershop, gym, or fitness or yoga studio. Work mail includes booking and class ' +
      'schedule notices, memberships and cancellations, no-shows and late cancels, instructors and stylists, retail and ' +
      'product orders, software like Mindbody or Vagaro, reviews, and leases or equipment. Track each member issue, ' +
      'instructor, or class series as its own entity, named by person or class.',
    urgencyHints: [
      'instructors or stylists who cannot cover a class or shift',
      'membership cancellations and payment failures',
      'double bookings, no-shows, and waitlist changes',
      'licence, insurance, and inspection renewals',
      'bad reviews or complaints needing a reply'
    ],
    entityNoun: 'booking',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-bookings', 'k-reviews'],
    signals: [
      { pattern: '\\b(class schedule|class (?:is )?full|class cancel(?:led|ed)|sub needed|instructor sub|teaching schedule)\\b', weight: 3 },
      { pattern: '\\b(membership|member freeze|cancel my membership|auto-renew|monthly unlimited|intro offer)\\b', weight: 2 },
      { pattern: '\\b(mindbody|vagaro|glofox|zen planner|fresha|booksy|boulevard|squire|classpass)\\b', weight: 3 },
      { pattern: '\\b(no-show|no show fee|late cancel|cancellation fee|missed appointment)\\b', weight: 2 },
      { pattern: '\\b(stylist|colorist|barber|esthetician|massage therapist|nail tech|lash tech)\\b', weight: 3 },
      { pattern: '\\b(yoga|pilates|barre|hiit|crossfit|spin class|reformer|kickboxing)\\b', weight: 3 },
      { pattern: '\\b(group fitness|personal training package|small group training|bootcamp)\\b', weight: 2 },
      { pattern: '\\b(waitlist|drop-in rate|class pack|10-class|punch card)\\b', weight: 2 },
      { pattern: '\\b(booth rent|chair rental|commission split|suite rental)\\b', weight: 3 },
      { pattern: '\\b(salon supplies|product order|retail order|backbar|gift card sales)\\b', weight: 2 },
      { pattern: '\\b(front desk|check-in kiosk|key fob|locker room|studio hours)\\b', weight: 2 },
      { pattern: '\\b(facial|balayage|lash extensions|waxing|deep tissue|blowout|keratin)\\b', weight: 3 },
      { pattern: '\\b(treadmill|squat rack|dumbbells|equipment repair|shampoo bowl|salon chair)\\b', weight: 2 }
    ]
  },
  {
    id: 'coach',
    name: 'Coach / tutor / instructor / personal trainer',
    group: 'creative',
    icon: '🏋️',
    tagline: 'Sessions, client progress, packages, Zoom links, and reschedules.',
    pulseName: 'Client Pulse',
    workDescription:
      'The user coaches, tutors, or trains people one-on-one or in small groups: life or business coaching, tutoring, ' +
      'music or language lessons, personal training. Work mail includes session bookings and reschedules, client check-ins ' +
      'and progress, package purchases and renewals, scheduling and video-call links, intake forms, certification bodies, ' +
      'and platforms that send students. Track each client as its own entity, named by first name and goal.',
    urgencyHints: [
      'sessions today or tomorrow, and reschedule requests',
      'clients whose package is used up or payment failed',
      'clients who have gone quiet or missed sessions',
      'new client inquiries and discovery calls',
      'certification or insurance renewals'
    ],
    entityNoun: 'client',
    defaultSkills: ['vip', 'bills', 'appointments', 'k-bookings', 'k-reviews'],
    signals: [
      { pattern: '\\b(coaching session|our session|next session|1:1 session|session notes|session recap)\\b', weight: 3 },
      { pattern: '\\b(client progress|progress check-in|weekly check-in|check-in form|progress photos)\\b', weight: 3 },
      { pattern: '\\b(session package|5-pack|10-session|package renewal|sessions remaining|sessions left)\\b', weight: 3 },
      { pattern: '\\b(zoom link|calendly|acuity|book a session|discovery call)\\b', weight: 2 },
      { pattern: '\\b(tutoring|sat prep|act prep|exam prep|wyzant|varsity tutors|tutor\\.com)\\b', weight: 3 },
      { pattern: '\\b(personal trainer|training plan|workout plan|macros|form check|trainerize|truecoach)\\b', weight: 3 },
      { pattern: '\\b(life coach|executive coach|business coach|coaching call|accountability partner)\\b', weight: 3 },
      { pattern: '\\b(piano lessons|guitar lessons|voice lessons|swim lessons|language lessons|lesson slot)\\b', weight: 2 },
      { pattern: '\\b(reschedule our session|missed session|late cancel policy|make-up session)\\b', weight: 2 },
      { pattern: '\\b(intake form|goals worksheet|coaching agreement|client onboarding form)\\b', weight: 2 },
      { pattern: '\\b(icf|certified coach|nasm|ace certified|cpt|cscs|precision nutrition)\\b', weight: 2 },
      { pattern: '\\b(sliding scale|per session|session rate|pay per session)\\b', weight: 2 },
      { pattern: '\\b(practice log|homework for next week|drills|practice plan)\\b' },
      { pattern: '\\b(testimonial request|client wins|before and after|transformation)\\b' }
    ]
  }
]
