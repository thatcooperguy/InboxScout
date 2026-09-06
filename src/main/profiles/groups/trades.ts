import type { WorkProfile } from '../profiles'

/**
 * Trades, field & property: people whose work happens on a job site, in a
 * truck, in a shop, on a farm, on a shift, or across rental units. The core
 * 'realestate' and 'utility' profiles live in core.ts; these are the rest.
 */
export const TRADES_PROFILES: WorkProfile[] = [
  {
    id: 'contractor',
    name: 'General contractor / remodeler',
    group: 'trades',
    icon: '🏗️',
    tagline: 'Bids, permits, subs, change orders, inspections, draws and punch lists.',
    pulseName: 'Job Pipeline',
    workDescription:
      'The user runs or manages construction and remodeling jobs as a general contractor or builder. Work mail includes ' +
      'homeowners and clients, subcontractors, suppliers and lumber yards, building departments and inspectors, architects, ' +
      'bids and estimates, change orders, draw requests, lien waivers, and material deliveries. Track each active job as its own ' +
      'entity, named by job address or client, with a stage: bidding, permitting, in progress, punch list, or closed out.',
    urgencyHints: [
      'bid due dates and change orders waiting on a signature',
      'failed inspections, correction notices, or stop-work orders',
      'permit expirations and inspection scheduling',
      'subcontractors or deliveries that will stall the job',
      'draw requests, pay applications, or unpaid invoices from subs',
      'homeowner selections that are holding up the schedule'
    ],
    entityNoun: 'job',
    defaultSkills: ['vip', 'bills', 'appointments', 't-jobs', 't-permits', 'customers', 'shipping'],
    signals: [
      { pattern: '\\b(general contractor|subcontractors?|sub-?contractors?|subs on site)\\b', weight: 3 },
      { pattern: '\\b(change orders?|punch ?list|scope of work|schedule of values)\\b', weight: 3 },
      { pattern: '\\b(building permit|permit (?:application|approved|issued|expir(?:es|ed|ation))|plan check|plan review|permit set)\\b', weight: 2 },
      { pattern: '\\b(framing|drywall|sheetrock|foundation pour|concrete pour|trusses|footings)\\b', weight: 2 },
      { pattern: '\\b(invitation to bid|bid (?:due|package|opening|tabulation)|rfi|submittals?)\\b', weight: 2 },
      { pattern: '\\b(procore|buildertrend|coconstruct|bluebeam|jobtread|planhub|buildingconnected|stack takeoff)\\b', weight: 3 },
      { pattern: '\\b(lien waivers?|mechanic\'?s lien|retainage|draw request|pay app(?:lication)?|aia g70\\d)\\b', weight: 3 },
      { pattern: '\\b((?:kitchen|bath(?:room)?|whole-?home) remodel|new construction|custom home|home addition|adu)\\b', weight: 2 },
      { pattern: '\\b(superintendent|site super|foreman|job ?site|jobsite)\\b', weight: 1 },
      { pattern: '\\b(lumber yard|home depot pro|lowe\'?s pro|84 lumber|builders firstsource|abc supply|beacon roofing)\\b', weight: 2 },
      { pattern: '\\b((?:framing|footing|foundation|final|rough|insulation) inspection|certificate of occupancy|c\\.?o\\.? issued)\\b', weight: 2 },
      { pattern: '\\b((?:material|quantity) takeoff|takeoffs|bid tabulation|hard bid|cost-?plus contract)\\b', weight: 2 },
      { pattern: '\\b(silica|fall protection|scaffold(?:ing)?|hard hats?|toolbox talk)\\b', weight: 2 },
      { pattern: '\\b(construction (?:loan|draw|schedule|manager)|contractor\'?s license|cslb|licensed and bonded|builder\'?s risk)\\b', weight: 2 },
      { pattern: '\\b(selections (?:due|deadline)|tile selection|cabinet(?:s|ry)? (?:order|delivery|install)|countertop template)\\b', weight: 2 }
    ]
  },
  {
    id: 'tradesperson',
    name: 'Electrician / plumber / HVAC / handyman',
    group: 'trades',
    icon: '🔧',
    tagline: 'Service calls, parts runs, permits, callbacks and customers with no heat.',
    pulseName: 'Service Board',
    workDescription:
      'The user is a skilled tradesperson: an electrician, plumber, HVAC technician, or handyman, working for themselves or a ' +
      'small shop. Work mail includes service calls and customer requests, dispatch notes, supply-house orders and invoices, ' +
      'trade permits and inspections, licensing and certification renewals, lead-generation sites, and warranty or callback ' +
      'issues. Track each active job as its own entity, named by customer name or job address.',
    urgencyHints: [
      'no heat, no hot water, no cooling, gas smell, or active leaks',
      'inspection appointments and failed inspections',
      'license or certification renewals coming due',
      'parts on backorder that are holding a job open',
      'customers waiting on a quote or a callback',
      'warranty callbacks and complaints'
    ],
    entityNoun: 'job',
    defaultSkills: ['vip', 'bills', 'appointments', 't-jobs', 't-permits', 'customers', 'shipping'],
    signals: [
      { pattern: '\\b(electricians?|plumbers?|hvac|journeyman|master (?:plumber|electrician)|apprentice (?:electrician|plumber))\\b', weight: 3 },
      { pattern: '\\b(service call|service ticket|tech (?:assigned|en route)|on my way text|next available tech)\\b', weight: 2 },
      { pattern: '\\b(water heater|tankless|sump pump|drain (?:clog|cleaning|snake)|sewer line|backflow|garbage disposal)\\b', weight: 2 },
      { pattern: '\\b(panel upgrade|breakers?|gfci|200[- ]amp|100[- ]amp|conduit|romex|rewire|wiring)\\b', weight: 2 },
      { pattern: '\\b(furnace|condenser|heat pump|refrigerant|r-?410a|thermostat|ductwork|mini[- ]split|blower motor)\\b', weight: 2 },
      { pattern: '\\b(servicetitan|fieldedge|workiz|fieldpulse|joist app|successware|housecall pro)\\b', weight: 3 },
      { pattern: '\\b(ferguson|supplyhouse|graybar|city electric supply|johnstone supply|winsupply|rexel|hajoca)\\b', weight: 2 },
      { pattern: '\\b((?:electrical|plumbing|mechanical) (?:permit|inspection)|rough[- ]in inspection|final electrical|inspector signed off)\\b', weight: 2 },
      { pattern: '\\b(nfpa 70|national electrical code|uniform plumbing code|code (?:compliant|violation)|up to code)\\b', weight: 2 },
      { pattern: '\\b(flat[- ]rate book|trip charge|service agreement|maintenance plan|seasonal tune-?up)\\b', weight: 2 },
      { pattern: '\\b(no heat|no hot water|no a/?c|ac (?:not|isn\'?t) (?:cooling|working)|leak(?:ing)? under the sink|clogged (?:drain|toilet))\\b', weight: 2 },
      { pattern: '\\b(journeyman (?:card|license)|master (?:electrician|plumber) license|epa 608|nate certif(?:ied|ication))\\b', weight: 2 },
      { pattern: '\\b(angi|angie\'?s list|homeadvisor|angi leads?)\\b', weight: 2 },
      { pattern: '\\b(gas line|gas leak|carbon monoxide|co detector|main shut-?off|water shut-?off)\\b', weight: 2 },
      { pattern: '\\b(pipe (?:burst|froze|leak)|frozen pipes|slab leak|repipe|pex|copper (?:pipe|line))\\b', weight: 2 },
      { pattern: '\\b(handyman|odd jobs|small repairs|honey-?do list|fence repair)\\b', weight: 1 }
    ]
  },
  {
    id: 'homeservices',
    name: 'Cleaning / landscaping / pest control business',
    group: 'trades',
    icon: '🧹',
    tagline: 'Recurring customers, routes, crews, leads and reschedules for a home-services business.',
    pulseName: 'Route Board',
    workDescription:
      'The user runs or works in a home-services business: house cleaning, lawn care and landscaping, pest control, pool, ' +
      'window, or similar recurring services. Work mail includes customer bookings and reschedules, new leads, crew and route ' +
      'notes, supply orders, seasonal service reminders, reviews, and payments. Track each customer as its own entity, named ' +
      'by customer name or service address, with their service frequency.',
    urgencyHints: [
      'customers cancelling, rescheduling, or complaining about a missed visit',
      'new leads and quote requests waiting on a reply',
      'crew call-outs that leave a route uncovered',
      'weather that will push the schedule (rain, frost, snow)',
      'access problems: gate codes, locked doors, dogs in the yard',
      'unpaid recurring invoices'
    ],
    entityNoun: 'customer',
    defaultSkills: ['vip', 'bills', 'appointments', 't-jobs', 'customers', 't-shifts'],
    signals: [
      { pattern: '\\b(house ?cleaning|deep clean(?:ing)?|move-?out clean(?:ing)?|maid service|cleaning crew|recurring clean(?:ing)?)\\b', weight: 3 },
      { pattern: '\\b(lawn (?:care|service|mowing|treatment)|mowing|landscap(?:ing|ers?)|hardscape|mulch(?:ing)?|irrigation (?:repair|system)|sprinkler (?:head|repair|blowout))\\b', weight: 3 },
      { pattern: '\\b(pest control|exterminat(?:or|ion)|termite (?:inspection|treatment|bond)|rodent|bed ?bugs?|quarterly (?:treatment|service)|wasp nest|ant treatment)\\b', weight: 3 },
      { pattern: '\\b(pool (?:service|cleaning|chemicals)|window (?:cleaning|washing)|gutter cleaning|pressure wash(?:ing)?|power wash(?:ing)?|carpet cleaning|junk removal|chimney sweep)\\b', weight: 2 },
      { pattern: '\\b(jobber|zenmaid|launch27|maidily|pestpac|fieldroutes|yardbook|lawnpro|realgreen|servicem8|service autopilot)\\b', weight: 3 },
      { pattern: '\\b(thumbtack|nextdoor (?:lead|recommend|post)|yelp (?:lead|quote request)|google local services (?:ad|lead))\\b', weight: 2 },
      { pattern: '\\b(bi-?weekly (?:service|clean|visit)|weekly (?:service|mow|visit)|monthly service visit|recurring service)\\b', weight: 2 },
      { pattern: '\\b(cleaning crew|lawn crew|crew leader|crew is running late|two-?person crew)\\b', weight: 1 },
      { pattern: '\\b(gate code|garage code|let yourselves in|key under the mat|dog (?:in|is in) the (?:yard|backyard))\\b', weight: 2 },
      { pattern: '\\b(fall clean-?up|spring clean-?up|leaf removal|aerat(?:ion|ing)|overseed(?:ing)?|weed control|pre-?emergent|tree trimming|hedge trimming|stump grinding)\\b', weight: 2 },
      { pattern: '\\b(snow (?:removal|plow(?:ing)?)|de-?icing|salt(?:ing)? the (?:lot|driveway)|plow route)\\b', weight: 2 },
      { pattern: '\\b(cleaning (?:supplies|checklist|products)|microfiber|eco-?friendly products|green cleaning)\\b', weight: 1 },
      { pattern: '\\b(per[- ]visit (?:price|rate)|price per visit|per[- ]cut price|per[- ]clean)\\b', weight: 1 },
      { pattern: '\\b(mosquito (?:treatment|control|misting)|tick (?:treatment|control)|flea treatment|bait stations?)\\b', weight: 2 },
      { pattern: '\\b(satisfaction guarantee|re-?clean|missed a spot|reschedule (?:my|our) (?:cleaning|mow|service|treatment))\\b', weight: 1 },
      { pattern: '(?:noreply|no-reply|notifications)@(?:getjobber|housecallpro|zenmaid|pestpac|fieldroutes|yardbook)\\.?com', weight: 3 }
    ]
  },
  {
    id: 'driver',
    name: 'Truck driver / delivery / logistics',
    group: 'trades',
    icon: '🚚',
    tagline: 'Loads, dispatch, hours of service, DOT paperwork, fuel and pay per mile.',
    pulseName: 'Load Board',
    workDescription:
      'The user drives for a living: a truck driver, owner-operator, delivery or courier driver, or works in dispatch and ' +
      'logistics. Work mail includes load offers and rate confirmations, dispatch notes, pickup and delivery appointments, ' +
      'bills of lading and proof of delivery, hours-of-service and ELD notices, DOT and CDL paperwork, fuel and settlement ' +
      'statements, and carrier or broker matters. Track each load or route as its own entity, named by load number or ' +
      'origin-to-destination.',
    urgencyHints: [
      'pickup or delivery appointments today or tomorrow',
      'load cancellations, reschedules, or detention at a dock',
      'hours-of-service or logbook violations',
      'medical card, CDL, or DOT inspection deadlines',
      'breakdowns and roadside inspections',
      'settlement or pay disputes'
    ],
    entityNoun: 'load',
    defaultSkills: ['vip', 'bills', 'appointments', 't-loads', 't-parts', 't-shifts'],
    signals: [
      { pattern: '\\b(cdl|class a cdl|class b cdl|cdl-?a|hazmat endorsement|tanker endorsement|doubles?/?triples)\\b', weight: 3 },
      { pattern: '\\b(eld|electronic logging|hours of service|hos violation|drive time remaining|14-?hour (?:clock|rule)|70-?hour|34-?hour restart|log ?book)\\b', weight: 3 },
      { pattern: '\\b(dot (?:inspection|physical|number|medical card|audit)|fmcsa|csa score|roadside inspection|level [123] inspection|pre-?trip|post-?trip)\\b', weight: 3 },
      { pattern: '\\b(load (?:board|number|tender|confirmation|offer|assigned)|rate con(?:firmation)?|dat (?:load board|one)|truckstop\\.com|123loadboard)\\b', weight: 3 },
      { pattern: '\\b(dispatcher (?:note|update|says)|dispatched (?:to|for)|next load|deadhead|backhaul|drop and hook|live (?:load|unload))\\b', weight: 3 },
      { pattern: '\\b(bill of lading|bol|proof of delivery|pod|lumper (?:fee|receipt)|detention (?:pay|time)|layover pay|tonu)\\b', weight: 3 },
      { pattern: '\\b(shipper|consignee|receiver (?:hours|appointment)|dock appointment|pickup (?:number|appointment|window)|delivery appointment)\\b', weight: 2 },
      { pattern: '\\b(per[- ]mile|cents per mile|cpm|miles this week|paid miles|empty miles|fuel surcharge|fuel card|comdata|efs card|wex fleet)\\b', weight: 3 },
      { pattern: '\\b(samsara|gomotive|motive eld|keeptruckin|omnitracs|peoplenet|trucker path|drivewyze|prepass|trucker tools)\\b', weight: 3 },
      { pattern: '\\b(pilot flying j|love\'?s travel stop|ta petro|truck stop|weigh station|cat scale)\\b', weight: 2 },
      { pattern: '\\b(reefer|dry van|flatbed|step ?deck|lowboy|box truck|sprinter van|tractor-?trailer|53-?foot|day cab|sleeper cab)\\b', weight: 2 },
      { pattern: '\\b(delivery route|route (?:sheet|manifest)|stops on (?:your|my) route|final[- ]mile|last[- ]mile|packages? scanned|route (?:completed|assigned))\\b', weight: 2 },
      { pattern: '\\b(amazon flex|doordash|dashers?|uber eats|instacart|grubhub|amazon dsp|fedex ground contractor|spark driver)\\b', weight: 3 },
      { pattern: '\\b(trailer (?:number|swap|drop|inspection)|tractor (?:number|unit)|unit \\d{3,5}|trailer \\d{3,6})\\b', weight: 2 },
      { pattern: '\\b(ifta|irp|form 2290|heavy (?:vehicle|highway) use tax|apportioned plates|owner-?operator|lease purchase|carrier (?:packet|setup)|mc number|usdot)\\b', weight: 3 },
      { pattern: '\\b(fmcsa clearinghouse|drug and alcohol clearinghouse|random (?:drug|dot) test|split sleeper|sleeper berth)\\b', weight: 2 }
    ]
  },
  {
    id: 'mechanic',
    name: 'Auto repair shop / mechanic',
    group: 'trades',
    icon: '🔩',
    tagline: 'Repair orders, parts, diagnostics, approvals and cars waiting in the bays.',
    pulseName: 'Shop Board',
    workDescription:
      'The user is a mechanic, technician, service writer, or owner at an auto or truck repair shop. Work mail includes ' +
      'repair orders and estimate approvals, parts orders and cores from suppliers, diagnostic and labor-guide tools, tire ' +
      'orders, warranty and insurance claims, fleet accounts, certifications, and customers asking when their vehicle will be ' +
      'ready. Track each vehicle in the shop as its own entity, named by customer and vehicle (year make model) or RO number.',
    urgencyHints: [
      'estimates waiting on customer approval',
      'parts on backorder or the wrong part delivered',
      'customers waiting in the lobby or vehicles promised today',
      'fleet vehicles down and out of service',
      'warranty or insurance supplements awaiting approval',
      'recalls and safety-related repairs'
    ],
    entityNoun: 'vehicle',
    defaultSkills: ['vip', 'bills', 'appointments', 't-parts', 't-jobs', 'customers'],
    signals: [
      { pattern: '\\b(auto repair|repair shop|body shop|collision (?:center|repair)|service (?:bay|writer|advisor)|shop foreman|lube tech)\\b', weight: 3 },
      { pattern: '\\b(repair orders?|ro ?#\\s?\\d{3,}|ro number|work authorization|shop ticket|estimate approval|approve the repair)\\b', weight: 3 },
      { pattern: '\\b(mitchell ?1|alldata|identifix|shop-?ware|tekmetric|shopmonkey|autoleap|ccc one|carfax for shops|napa tracs|ro ?writer)\\b', weight: 3 },
      { pattern: '\\b(napa (?:auto|parts|delivery|invoice)|autozone (?:pro|commercial)|o\'?reilly (?:pro|commercial|auto parts)|advance auto|worldpac|carquest|lkq|rockauto|partstech|oem parts)\\b', weight: 3 },
      { pattern: '\\b(brake (?:pads|job|rotors|caliper)|rotors|timing (?:belt|chain)|serpentine belt|alternator|starter motor|catalytic converter|head gasket|water pump|control arm|tie rod|ball joint|wheel bearing|cv axle)\\b', weight: 3 },
      { pattern: '\\b(check engine (?:light|code)|obd-?ii?|dtc|p0\\d{3}|trouble code|misfire|diagnostic (?:fee|time|scan))\\b', weight: 3 },
      { pattern: '\\b(oil change|synthetic oil|tire rotation|wheel alignment|state inspection|emissions test|smog (?:check|test)|inspection sticker|tune-?up)\\b', weight: 2 },
      { pattern: '\\b(vin|odometer|mileage in|vehicle (?:drop-?off|pick-?up|is ready)|your (?:car|vehicle|truck) is ready|keys? in the drop ?box)\\b', weight: 2 },
      { pattern: '\\b(shop supplies|labor guide|book time|flat[- ]rate hours|hours billed|labor hours|core charge|core return)\\b', weight: 3 },
      { pattern: '\\b(customer pay|cp ticket|warranty labor|extended warranty claim|supplement (?:approved|request)|adjuster (?:approved|photos))\\b', weight: 2 },
      { pattern: '\\b(tow(?:ed|ing)? in|tow truck|jump start|flat tire|won\'?t start|no start|overheating|grinding noise|squeal(?:ing)?)\\b', weight: 2 },
      { pattern: '\\b(ase certif(?:ied|ication)|ase (?:test|master)|i-car|epa 609|snap-?on|matco|mac tools|cornwell|tool truck)\\b', weight: 3 },
      { pattern: '\\b(lift (?:inspection|is down)|alignment rack|tire machine|tire balancer|scan tool|shop (?:compressor|air))\\b', weight: 2 },
      { pattern: '\\b(tire (?:quote|order|sizes?)|tire rack|tirerack|goodyear|michelin|bridgestone|firestone|discount tire|wheel (?:and|&) tire)\\b', weight: 2 },
      { pattern: '\\b(bay \\d{1,2}|bays (?:full|open)|loaner (?:car|vehicle)|courtesy (?:car|shuttle)|waiter (?:appointment|customer))\\b', weight: 1 },
      { pattern: '\\b(fleet (?:account|maintenance|service|vehicles)|pm service|preventive maintenance on (?:unit|truck|van))\\b', weight: 1 }
    ]
  },
  {
    id: 'farmer',
    name: 'Farmer / rancher',
    group: 'trades',
    icon: '🌾',
    tagline: 'Weather, markets, co-op and USDA notices, inputs, livestock and equipment.',
    pulseName: 'Farm Pulse',
    workDescription:
      'The user farms or ranches. Work mail includes co-op and elevator notices, grain and livestock market reports, USDA, ' +
      'FSA, and crop-insurance deadlines, seed, fertilizer, and chemical orders, equipment dealers and parts, veterinary and ' +
      'herd matters, custom operators, landlords and cash-rent leases, weather alerts, and ag lenders. Track each field, ' +
      'herd, or enterprise as its own entity, named by field or farm name.',
    urgencyHints: [
      'USDA, FSA, or crop-insurance sign-up and reporting deadlines',
      'frost, freeze, hail, or severe-weather warnings during planting or harvest',
      'grain contracts, cash bids, and delivery windows',
      'sick animals, vet visits, and disease or quarantine notices',
      'equipment down during planting or harvest and parts on order',
      'cash-rent, land-lease, or loan payments due'
    ],
    entityNoun: 'field',
    defaultSkills: ['vip', 'bills', 'appointments', 't-crops', 't-parts', 'shipping'],
    signals: [
      { pattern: '\\b(rancher|ranch hand|family farm|farm bureau|farm credit|farm service agency|fsa office|homestead|pasture|grazing)\\b', weight: 2 },
      { pattern: '\\b(usda|nrcs|fsa (?:office|loan|payment)|crop insurance|arc-?co|plc payment|eqip|csp contract|conservation reserve|crp (?:payment|contract))\\b', weight: 3 },
      { pattern: '\\b(harvest (?:season|is|started|report|done)|harvesting|bushels?|bu/?ac|acres? planted|planter|sprayer|grain (?:cart|bin|dryer|elevator|ticket))\\b', weight: 3 },
      { pattern: '\\b(soybeans?|alfalfa|sorghum|canola|silage|forage|winter wheat|cover crops?|corn (?:planting|harvest|prices?|futures|yield))\\b', weight: 2 },
      { pattern: '\\b(cattle|heifers?|steers?|calving|calves|bull sale|sale barn|feedlot|cow-?calf|herd (?:health|count)|livestock|hogs?|sows?|broilers?|poultry (?:house|flock)|goats?|lambing|ewes?)\\b', weight: 3 },
      { pattern: '\\b(fertilizer|anhydrous|urea|nitrogen (?:application|rate)|potash|lime application|herbicide|fungicide|insecticide|glyphosate|dicamba|pesticide applicator|applicator license)\\b', weight: 3 },
      { pattern: '\\b(john deere|kubota|case ih|new holland|agco|massey ferguson|deere (?:dealer|parts|financial)|implement dealer|baler|bush ?hog|skid ?steer|grain auger)\\b', weight: 3 },
      { pattern: '\\b(cbot|board of trade|cash bids?|dec corn|nov beans|forward contract|hedge-?to-?arrive|hta contract|grain (?:contract|marketing|prices?))\\b', weight: 3 },
      { pattern: '\\b(co-?op (?:notice|statement|patronage|meeting|agronomy)|patronage dividend|elevator (?:receipt|ticket|hours)|feed (?:mill|store|delivery|bill)|seed (?:order|dealer|rep|corn|tender)|pioneer seed|dekalb|channel seed|beck\'?s hybrids|nutrien|cenex|winfield)\\b', weight: 2 },
      { pattern: '\\b(rainfall|rain gauge|drought (?:monitor|conditions)|frost (?:warning|date)|growing degree|gdd|soil (?:temp|moisture|test|sample)|field (?:conditions|is too wet)|tile (?:drain|line))\\b', weight: 2 },
      { pattern: '\\b(irrigation (?:pivot|well|district|water)|center pivot|pivot (?:is down|stuck)|water (?:rights|allocation)|acre-?feet|ditch rider)\\b', weight: 2 },
      { pattern: '\\b(large animal vet|vaccinating the (?:herd|calves|cows)|dewormer|ear tags?|brand inspection|premises id|scrapie tag|bangs vaccin(?:e|ation))\\b', weight: 2 },
      { pattern: '\\b(farmers\'? market|csa (?:share|box|members?)|u-?pick|farm stand|agritourism|pumpkin patch|orchard|high tunnel|hoop house)\\b', weight: 2 },
      { pattern: '\\b(organic certif(?:ied|ication)|omri|no-?till|crop rotation|gap audit|food safety plan)\\b', weight: 2 },
      { pattern: '\\b(agronomist|crop (?:consultant|scout|advisor|report|tour|adjuster)|extension (?:office|agent|service)|4-h|ffa|county fair (?:entry|premium)|ag (?:lender|loan|day))\\b', weight: 2 },
      { pattern: '@(?:[a-z0-9-]+\\.)?(?:usda|farmbureau|fbfs|farmcredit|nutrien|cenex|deere|dtn|agweb)\\.?(?:gov|com|org)\\b', weight: 3 }
    ]
  },
  {
    id: 'landlord',
    name: 'Landlord / property manager',
    group: 'trades',
    icon: '🏘️',
    tagline: 'Tenants, rent, leases, maintenance requests, turnovers and inspections.',
    pulseName: 'Property Pulse',
    workDescription:
      'The user owns rental property or manages properties for owners. Work mail includes tenants and applicants, rent ' +
      'payments and late notices, lease renewals and notices to vacate, maintenance and repair requests, vendors and ' +
      'handymen, property-management software, housing-authority inspections, listings for vacant units, insurance, and ' +
      'owner statements. Track each property or unit as its own entity, named by address and unit number.',
    urgencyHints: [
      'emergency maintenance: no heat, no water, leaks, floods, gas smell, lockouts',
      'rent past due and late notices',
      'lease expirations, notices to vacate, and renewal deadlines',
      'housing-authority or city inspections',
      'eviction or legal notices with response dates',
      'vacant units losing rent'
    ],
    entityNoun: 'property',
    defaultSkills: ['vip', 'bills', 'appointments', 't-tenants', 't-permits', 'customers'],
    signals: [
      { pattern: '\\b(tenants?|renters?|lessee|rent (?:is )?(?:due|late|past due|received|payment|roll|increase)|late fee|security deposit|move-?in|move-?out)\\b', weight: 3 },
      { pattern: '\\b(lease (?:renewal|agreement|expir(?:es|ation|ing)|signing|term|violation)|month-?to-?month|notice to vacate|30-?day notice|60-?day notice|non-?renewal)\\b', weight: 3 },
      { pattern: '\\b(maintenance request|repair request|tenant (?:reported|says|complaint|request)|something\'?s broken|not working in (?:the )?unit)\\b', weight: 3 },
      { pattern: '\\b(unit \\d{1,4}|apt\\.? ?\\d{1,4}|apartment \\d{1,4}|duplex|fourplex|four-?plex|triplex|multi-?family)\\b', weight: 2 },
      { pattern: '\\b(appfolio|buildium|rentredi|avail\\.co|turbotenant|rent ?manager|yardi|propertyware|doorloop|zillow rental manager|rentec|tenantcloud|innago)\\b', weight: 3 },
      { pattern: '\\b(eviction|unlawful detainer|pay or quit|cure or quit|notice to quit|writ of possession)\\b', weight: 3 },
      { pattern: '\\b(section 8|housing (?:authority|voucher|choice voucher)|hud inspection|hqs inspection|fair housing|landlord-?tenant)\\b', weight: 3 },
      { pattern: '\\b(rental (?:application|property|income|listing|unit|inspection)|applicant screening|tenant screening|background (?:and|&) credit check|transunion smartmove|rentprep)\\b', weight: 3 },
      { pattern: '\\b(vacancy|vacant unit|make-?ready|unit turn|rent-?ready|showing the unit)\\b', weight: 2 },
      { pattern: '\\b(landlord insurance|dp-?3 policy|schedule e|rental income|per door|cap rate)\\b', weight: 2 },
      { pattern: '\\b(rekey|re-?key|change the locks|lock ?out (?:fee|request)|smoke detector (?:check|inspection|batteries)|key (?:hand-?off|return|pickup))\\b', weight: 2 },
      { pattern: '\\b(property manager|property management|pm company|owner (?:statement|draw|distribution|portal)|management fee|leasing agent)\\b', weight: 3 },
      { pattern: '\\b(zillow rentals?|apartments\\.com|rent\\.com|hotpads|trulia rentals|craigslist (?:ad|listing|posting)|facebook marketplace (?:rental|listing)|zumper|padmapper)\\b', weight: 3 },
      { pattern: '\\b(inspection (?:of|at) (?:the )?(?:unit|property)|move-?in (?:inspection|checklist|walkthrough)|move-?out (?:inspection|checklist)|deposit (?:deduction|return|itemization)|itemized deductions)\\b', weight: 2 },
      { pattern: '\\b(rent (?:paid|payment) (?:via|through|on) (?:zelle|venmo|cash ?app|paypal)|autopay for rent|rent portal|online rent payment|partial rent)\\b', weight: 2 },
      { pattern: '\\b(airbnb (?:host|payout|reservation)|vrbo (?:host|payout)|short-?term rental|str (?:permit|license)|superhost)\\b', weight: 2 }
    ]
  },
  {
    id: 'warehouse',
    name: 'Manufacturing / warehouse supervisor',
    group: 'trades',
    icon: '🏭',
    tagline: 'Shifts, headcount, safety, production numbers, inventory counts and equipment down.',
    pulseName: 'Floor Pulse',
    workDescription:
      'The user supervises or leads a team on a plant, warehouse, or distribution-center floor. Work mail includes shift ' +
      'coverage and attendance, staffing agencies, safety incidents and audits, production and throughput numbers, quality ' +
      'holds, inventory and cycle counts, WMS or ERP notices, equipment breakdowns and maintenance tickets, receiving and ' +
      'shipping schedules, and industrial suppliers. Track each line, area, or open issue as its own entity, named by line, ' +
      'department, or ticket number.',
    urgencyHints: [
      'a line, machine, or conveyor down',
      'safety incidents, near misses, and OSHA or EPA matters',
      'uncovered shifts, no-call no-shows, and mandatory overtime',
      'quality holds, non-conformances, and customer complaints on shipped product',
      'inventory variances before a physical count',
      'inbound or outbound trailers that will miss their window'
    ],
    entityNoun: 'line',
    defaultSkills: ['vip', 'bills', 'appointments', 't-shifts', 't-parts', 'shipping'],
    signals: [
      { pattern: '\\b(warehouse (?:team|shift|manager|supervisor|floor|associates?)|distribution center|fulfillment center|plant floor|shop floor|production (?:line|floor)|assembly line)\\b', weight: 3 },
      { pattern: '\\b(forklift|reach truck|order picker|pallet jack|cherry picker|pallets?|racking|pallet rack|dock plate|loading dock|dock doors?)\\b', weight: 3 },
      { pattern: '\\b(shift (?:supervisor|lead|report|handoff|hand-?off|coverage)|(?:first|second|third|1st|2nd|3rd) shift|swing shift)\\b', weight: 2 },
      { pattern: '\\b(headcount|temp (?:agency|staffing|workers?)|staffing agency|no-?call no-?show|ncns|attendance points|point system|mandatory overtime|ot sign-?up)\\b', weight: 3 },
      { pattern: '\\b(units per hour|uph|cases per hour|picks per hour|lines per hour|takt time|oee|scrap rate|first pass yield|fill rate|dock-?to-?stock)\\b', weight: 3 },
      { pattern: '\\b(5s audit|kaizen|six sigma|gemba (?:walk|board)|root cause (?:analysis|corrective action)|capa|8d report|andon|poka-?yoke|smed|value stream map)\\b', weight: 3 },
      { pattern: '\\b(safety (?:incident|observation|walk|audit|committee|huddle)|near[- ]miss|lost[- ]time|recordable|osha (?:300|log|recordable)|loto|hi-?vis|steel-?toe)\\b', weight: 2 },
      { pattern: '\\b(wms|warehouse management system|manhattan wms|highjump|blue yonder|sap ewm|oracle wms|netsuite wms|fishbowl inventory|katana mrp|epicor|infor (?:ln|m3|cloudsuite))\\b', weight: 3 },
      { pattern: '\\b(cycle count(?:s|ing)?|physical inventory|inventory (?:accuracy|adjustment|variance|shrink)|bin location|slotting|putaway|put-?away|pick (?:ticket|list|path|wave)|wave release|replenishment)\\b', weight: 3 },
      { pattern: '\\b(receiving (?:dock|schedule|team|report)|advanced? ship(?:ping)? notice|asn|carrier pickup|trailer (?:loaded|unloaded|seal)|seal number|cross-?dock|ltl (?:shipment|carrier|quote))\\b', weight: 2 },
      { pattern: '\\b(bill of materials|bom|work ?center|job traveler|production (?:schedule|order|run)|changeover|cnc|press brake|injection mold(?:ing)?|extrusion|weld(?:ing)? (?:shop|dept|cell))\\b', weight: 3 },
      { pattern: '\\b(quality hold|ncr|non-?conformance|iso 9001|iatf|first article|certificate of conformance|calibration due|gauge r&r)\\b', weight: 3 },
      { pattern: '\\b(grainger|uline|fastenal|mcmaster(?:-carr)?|msc industrial|motion industries|global industrial)\\b', weight: 3 },
      { pattern: '\\b(temp badge|missed punch|timecard (?:approval|correction)|clock-?in|badge in|kronos|ukg)\\b', weight: 2 },
      { pattern: '\\b(hazmat|sds|safety data sheet|spill kit|chemical (?:storage|inventory)|epa (?:permit|inspection)|osha inspection|air permit|wastewater)\\b', weight: 2 },
      { pattern: '\\b(line (?:is )?down|machine (?:is )?down|equipment down|conveyor (?:jam|down|belt)|sorter (?:jam|down)|maintenance ticket|work request)\\b', weight: 2 }
    ]
  },
  {
    id: 'firstresponder',
    name: 'Police / fire / EMS / security officer',
    group: 'trades',
    icon: '🚨',
    tagline: 'Shift bids, overtime, training and recerts, reports, court dates and department notices.',
    pulseName: 'Duty Roster',
    workDescription:
      'The user is a first responder or security professional: police officer or deputy, firefighter, paramedic or EMT, ' +
      'dispatcher, or security officer. Work mail includes shift bids and trades, overtime and hold-overs, training and ' +
      'certification renewals, report approvals, court and subpoena notices, department directives, union or association ' +
      'notices, equipment and apparatus checks, and wellness or peer-support programs. Track each open item as its own ' +
      'entity, named by incident number, training course, or shift date.',
    urgencyHints: [
      'mandatory overtime, hold-overs, and shift bids with a deadline',
      'certification or recertification expirations',
      'court dates and subpoenas to testify',
      'reports returned for correction with a due date',
      'directives requiring acknowledgment',
      'critical-incident debriefs and peer-support follow-ups'
    ],
    entityNoun: 'shift',
    defaultSkills: ['vip', 'bills', 'appointments', 't-shifts', 'health', 'family'],
    signals: [
      { pattern: '\\b(police (?:department|dept|officer|chief)|sheriff\'?s? (?:office|deputy)|deputy sheriff|patrol (?:shift|division|officer|car|unit)|precinct|watch commander|chief of police|law enforcement|peace officer)\\b', weight: 3 },
      { pattern: '\\b(fire (?:department|dept|station|chief|marshal|academy|apparatus|ground)|firefighters?|paramedics?|emt|ambulance|medic unit|engine \\d{1,3}|ladder \\d{1,3}|truck company|battalion (?:chief|\\d))\\b', weight: 3 },
      { pattern: '\\b(dispatched to|cad (?:call|notes|incident)|911 (?:call|center|dispatch)|comm ?center|call volume|run (?:report|volume|sheet)|tone-?out|toned out|page-?out|paged out|mutual aid|all-?call)\\b', weight: 3 },
      { pattern: '\\b(shift bid|shift trade|24/?48|48/?96|kelly day|platoon|held over|hold-?over|forced (?:overtime|ot)|mandatory ot|hire-?back|callback list)\\b', weight: 3 },
      { pattern: '\\b(use of force|body ?cam|bodycam|bwc|dash ?cam|supplemental report|report (?:approval|returned|rejected)|incident (?:number|command|commander)|ics ?\\d{3}|nims)\\b', weight: 3 },
      { pattern: '\\b(nremt|emt-?b|emt-?p|paramedic (?:recert|license|refresher)|epcr|patient care report|imagetrend|eso (?:suite|reports?)|ambulance (?:run|crew|billing))\\b', weight: 3 },
      { pattern: '\\b(post certif(?:ied|ication|icate)|academy (?:class|graduation)|firearms (?:qual|qualification|range)|range day|qualify at the range|taser (?:recert|cert)|defensive tactics|fto|field training|ride-?along|in-?service training)\\b', weight: 3 },
      { pattern: '\\b(nfpa 1001|nfpa 1582|firefighter (?:i|ii|1|2)|ff1|ff2|hazmat (?:ops|tech|awareness)|technical rescue|swiftwater|rope rescue|wildland|red card|s-?130|s-?190|pre-?plan|preplan|hydrant (?:flow|testing|inspection)|scba (?:fit test|maintenance)|turnout gear|bunker gear)\\b', weight: 3 },
      { pattern: '\\b(security (?:officer|guard|post|detail|patrol|supervisor)|guard card|post orders|post assignment|daily activity report|allied universal|securitas|gardaworld|g4s|unarmed guard|armed guard)\\b', weight: 3 },
      { pattern: '\\b(fop lodge|iaff|pba|police (?:union|association|benevolent)|firefighters\'? (?:union|association)|deputies\'? association|police officers\'? association)\\b', weight: 2 },
      { pattern: '\\b(psprs|leoff|drop program|deferred retirement option|line of duty (?:death|injury)|lodd|presumptive (?:cancer|disability|heart)|heart and lung (?:act|bill))\\b', weight: 2 },
      { pattern: '\\b(critical incident (?:stress|debrief)|cisd|cism|peer support team|hot wash|mass casualty (?:incident|drill)|mci (?:drill|plan)|multi-?casualty)\\b', weight: 2 },
      { pattern: '\\b(uniform allowance|clothing allowance|boot allowance|physical agility test|cpat|fitness for duty|psychological evaluation for (?:hire|duty))\\b', weight: 2 },
      { pattern: '\\b(dispatch (?:center|console)|telecommunicator|911 dispatcher|calls for service|priority [123] call|code ?3|lights and sirens|10-?4|10-?8|10-?7|10-?codes?|unit \\d{1,4} (?:responding|on scene|clear|available)|on scene|en route to (?:the )?(?:scene|call))\\b', weight: 3 },
      { pattern: '\\b(apparatus (?:check|inspection|maintenance|out of service)|rig check|hose test(?:ing)?|ladder test(?:ing)?|pump test(?:ing)?|annual pump test)\\b', weight: 2 },
      { pattern: '@(?:[a-z0-9-]+\\.)?(?:[a-z]+pd|[a-z]+fd|[a-z]+fire|[a-z]+police|sheriff)\\.?(?:gov|org|us)\\b', weight: 2 }
    ]
  },
  {
    id: 'mortgage',
    name: 'Mortgage loan officer / title & escrow',
    group: 'trades',
    icon: '🏦',
    tagline: 'Loan files, rate locks, conditions, disclosures, title and closing packages.',
    pulseName: 'Loan Pipeline',
    workDescription:
      'The user originates or processes home loans, or works in title and settlement. Work mail includes borrowers and ' +
      'their documents, loan applications and disclosures, rate locks, underwriting conditions and approvals, appraisals, ' +
      'title commitments and payoffs, closing packages and funding, realtor and referral partners, and lender or investor ' +
      'notices. Track each loan file as its own entity, named by borrower last name or property address, with a stage: ' +
      'application, processing, underwriting, conditional approval, clear to close, funded.',
    urgencyHints: [
      'rate-lock expirations and lock extensions',
      'underwriting conditions and documents the borrower still owes',
      'closing dates, disclosure waiting periods, and funding deadlines',
      'appraisals that came in low or are running late',
      'title defects, payoff demands, or missing signatures before closing',
      'borrowers or agents waiting on a pre-approval letter'
    ],
    entityNoun: 'loan',
    defaultSkills: ['vip', 'bills', 'appointments', 'customers', 't-permits'],
    signals: [
      { pattern: '\\b(loan (?:officer|originator|estimate|conditions?)|nmls|mlo license|form 1003|urla|uniform residential loan application)\\b', weight: 3 },
      { pattern: '\\b(underwrit(?:er|ing)|uw (?:conditions|approval|decision)|conditional approval|clear to close|ctc|desktop underwriter|du findings|lpa findings|approve/?eligible)\\b', weight: 3 },
      { pattern: '\\b(rate lock|lock (?:expiration|expires|extension|confirmation)|float(?:ing)? the rate|par rate|rate sheet|pricing engine|lock desk|discount points|apr disclosure|2-?1 buydown)\\b', weight: 3 },
      { pattern: '\\b(dti|debt-?to-?income|ltv|loan-?to-?value|cltv|fico (?:score|pull)|tri-?merge|borrowers?|co-?borrower)\\b', weight: 3 },
      { pattern: '\\b(fha|va loan|usda (?:loan|rural)|conventional (?:loan|financing)|jumbo loan|non-?qm|heloc|cash-?out refi|refinance|refi|arm (?:loan|reset)|30-?year fixed|15-?year fixed|fannie mae|freddie mac|ginnie mae|mortgagee clause)\\b', weight: 3 },
      { pattern: '\\b(closing (?:package|docs|documents|table|funds)|closing disclosure|cd (?:issued|sent|acknowledged|signed)|initial cd|final cd|trid|3-?day (?:waiting|review) period|wet (?:sign|signing)|e-?closing|hybrid closing|funding (?:conditions|number|wire|date)|disburse(?:d|ment))\\b', weight: 3 },
      { pattern: '\\b(title (?:commitment|insurance|search|curative|order|officer|agent|company)|preliminary title|prelim|chain of title|title (?:defect|cloud|exception)|lien search|legal description|vesting|deed of trust|warranty deed|quitclaim|recording (?:fee|number)|county recorder|reconveyance|payoff (?:demand|statement|letter)|beneficiary demand)\\b', weight: 3 },
      { pattern: '\\b(appraised value|appraisal (?:ordered|received|came in|review|waiver|management)|amc|reconsideration of value|rov|appraiser assigned)\\b', weight: 2 },
      { pattern: '\\b(encompass (?:loan|file|by ellie mae|by ice)|calyx point|byte software|meridianlink|floify|arive|lendingpad|simplenexus|optimal blue|loansifter|qualia|softpro|resware|ramquest|snapclose|closingcorp|first american title|fidelity national title|old republic title|stewart title|chicago title)\\b', weight: 3 },
      { pattern: '\\b(pre-?qual(?:ification|ified|ify)?|pre-?approval letter|pre-?approved (?:for|up to)|purchase contract received|contract to close|purchase agreement (?:received|executed))\\b', weight: 2 },
      { pattern: '\\b(verification of (?:employment|income|deposit|rent|mortgage)|voe|vod|vor|vom|pay ?stubs? (?:for|from) the borrower|w-?2s? (?:for|from) the borrower|bank statements? (?:for|from) the borrower|asset (?:statement|verification)|gift letter|letter of explanation|loe|sourced (?:funds|deposit)|large deposit)\\b', weight: 3 },
      { pattern: '\\b(settlement (?:agent|statement)|alta (?:settlement|policy|survey)|escrow officer|escrow (?:instructions|number|file|holdback|analysis|shortage)|prorations?|per diem interest|prepaids?|impound account)\\b', weight: 3 },
      { pattern: '\\b(mortgage (?:insurance|payment|rate|application|servicer|servicing|statement|broker|banker|lender|company)|pmi (?:removal|premium)|mip|servicing transfer|loan servicing|pitia?|hazard insurance (?:binder|dec page)|flood (?:cert|certification|zone determination)|homeowners\'? insurance binder|hoi binder|insurance binder)\\b', weight: 2 },
      { pattern: '\\b(initial disclosures|disclosures? (?:sent|signed|acknowledged|package)|e-?consent|esign(?:ed)? the disclosures|intent to proceed|itp|revised le|change of circumstance|tolerance (?:cure|violation))\\b', weight: 3 },
      { pattern: '\\b(purchase (?:loan|transaction)|refi pipeline|loans? in (?:process|pipeline)|closed loans?|funded loans?|realtor partners?|referral partners? (?:lunch|event)|lunch and learn for (?:agents|realtors))\\b', weight: 2 },
      { pattern: '\\b(home loans?|rocket (?:mortgage|pro)|uwm|united wholesale|pennymac|loandepot|caliber home|guild mortgage|fairway independent|crosscountry mortgage|movement mortgage|newrez|mr\\.? cooper|freedom mortgage)\\b', weight: 3 }
    ]
  }
]
