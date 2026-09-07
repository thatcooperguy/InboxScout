# Profiles — who InboxScout works for

InboxScout tunes itself to the person: what counts as work mail, what is urgent, what the brief's rolling "pulse"
tracks, and which skills (watchers) are on. There are **56 built-in profiles** in five groups.

**Choose for me** is on by default: after each scan InboxScout looks at what the mail is about and switches to the
best-fitting profile when the evidence is clear (it only moves off a chosen profile on a high-confidence read, and
never after you dismiss a suggestion). Pick one yourself in **Setup → Preferences** to lock it; choose
*Let InboxScout figure it out* to hand it back. Other agents can do the same through the bridge
(`list_profiles`, `detect_profile`, `set_profile`).

Every profile still gets the universal skills (important people, bills, appointments…) and you can switch any
skill on or off under **Setup → What to watch for**. Companies can add their own profiles and skills as JSON — see `docs/SKILLS.md`.

## 💼 Business & office (12)

| Profile | What it watches | Pulse | Default skills |
|---|---|---|---|
| 🏢 **Business owner / executive** | You run a company: vendors, customers, staff, money, contracts. | Company Pulse | Important people, Bills & invoices, Appointments & meetings, Customer requests, Orders & deliveries, Travel |
| 🧭 **Manager / team lead** | You lead a team: approvals, 1:1s, reviews, hiring, and keeping people unblocked. | Team Pulse | Important people, Appointments & meetings, Bills & invoices, Approvals & sign-offs, Candidates & interviews, Travel |
| 📈 **Sales rep / account manager** | Prospects, demos, quotes, and deals moving through your pipeline. | Deal Pipeline | Important people, Appointments & meetings, Bills & invoices, Quotes, proposals & deals, Customer requests, Travel |
| 📣 **Marketing / social-media manager** | Campaigns, ads, content, analytics reports, and launches. | Campaign Pulse | Important people, Appointments & meetings, Bills & invoices, Campaigns & reports, Approvals & sign-offs |
| 🤝 **HR / recruiter** | Candidates, interviews, offers, onboarding, benefits, and employee matters. | Hiring Pulse | Important people, Appointments & meetings, Bills & invoices, Candidates & interviews, Approvals & sign-offs |
| 🧾 **Accountant / bookkeeper / tax preparer** | Client books, reconciliations, tax returns, filings, and missing documents. | Books & Filings | Important people, Appointments & meetings, Bills & invoices, Money owed to you, Customer requests |
| 🗂 **Project manager** | Milestones, status reports, blockers, scope changes, and sign-offs. | Project Pulse | Important people, Appointments & meetings, Bills & invoices, Approvals & sign-offs, Travel |
| 🎧 **Customer service / support rep** | Tickets, escalations, SLAs, and customers waiting on an answer. | Ticket Pulse | Important people, Appointments & meetings, Support tickets & SLAs, Customer requests, Orders & deliveries |
| 🗓 **Office admin / executive assistant / receptionist** | Calendars, visitors, travel, supplies, signatures, and keeping the office running. | Office Pulse | Important people, Appointments & meetings, Bills & invoices, Approvals & sign-offs, Travel, Orders & deliveries |
| 💡 **Consultant / agency owner / freelancer** | Clients, proposals, retainers, deliverables, and getting paid on time. | Client Pulse | Important people, Appointments & meetings, Bills & invoices, Quotes, proposals & deals, Money owed to you, Customer requests, Travel |
| 🏦 **Financial advisor / insurance agent / banker** | Clients, policies, portfolios, compliance, and renewal dates. | Client Book | Important people, Appointments & meetings, Bills & invoices, Quotes, proposals & deals, Approvals & sign-offs, Customer requests |
| ⚖️ **Lawyer / paralegal / legal office** | Court dates, filings, discovery, opposing counsel, and client matters. | Matter Pulse | Important people, Appointments & meetings, Bills & invoices, Court & filing deadlines, Money owed to you |

## 🛠 Trades, field & property (12)

| Profile | What it watches | Pulse | Default skills |
|---|---|---|---|
| 🏠 **Real-estate agent** | Buyers, sellers, listings, showings, offers, escrow, closings. | Deal Pipeline | Important people, Bills & invoices, Appointments & meetings, Real-estate deals |
| ⚡ **Utility / field professional** | Shifts, outages, work orders, safety bulletins, training deadlines. | Operations Pulse | Important people, Bills & invoices, Appointments & meetings, Work orders & compliance |
| 🏗️ **General contractor / remodeler** | Bids, permits, subs, change orders, inspections, draws and punch lists. | Job Pipeline | Important people, Bills & invoices, Appointments & meetings, Jobs, estimates & change orders, Permits & inspections, Customer requests, Orders & deliveries |
| 🔧 **Electrician / plumber / HVAC / handyman** | Service calls, parts runs, permits, callbacks and customers with no heat. | Service Board | Important people, Bills & invoices, Appointments & meetings, Jobs, estimates & change orders, Permits & inspections, Customer requests, Orders & deliveries |
| 🧹 **Cleaning / landscaping / pest control business** | Recurring customers, routes, crews, leads and reschedules for a home-services business. | Route Board | Important people, Bills & invoices, Appointments & meetings, Jobs, estimates & change orders, Customer requests, Shifts, overtime & call-outs |
| 🚚 **Truck driver / delivery / logistics** | Loads, dispatch, hours of service, DOT paperwork, fuel and pay per mile. | Load Board | Important people, Bills & invoices, Appointments & meetings, Loads & dispatch, Parts & vehicle service, Shifts, overtime & call-outs |
| 🔩 **Auto repair shop / mechanic** | Repair orders, parts, diagnostics, approvals and cars waiting in the bays. | Shop Board | Important people, Bills & invoices, Appointments & meetings, Parts & vehicle service, Jobs, estimates & change orders, Customer requests |
| 🌾 **Farmer / rancher** | Weather, markets, co-op and USDA notices, inputs, livestock and equipment. | Farm Pulse | Important people, Bills & invoices, Appointments & meetings, Farm, weather & market notices, Parts & vehicle service, Orders & deliveries |
| 🏘️ **Landlord / property manager** | Tenants, rent, leases, maintenance requests, turnovers and inspections. | Property Pulse | Important people, Bills & invoices, Appointments & meetings, Tenants & rentals, Permits & inspections, Customer requests |
| 🏭 **Manufacturing / warehouse supervisor** | Shifts, headcount, safety, production numbers, inventory counts and equipment down. | Floor Pulse | Important people, Bills & invoices, Appointments & meetings, Shifts, overtime & call-outs, Parts & vehicle service, Orders & deliveries |
| 🚨 **Police / fire / EMS / security officer** | Shift bids, overtime, training and recerts, reports, court dates and department notices. | Duty Roster | Important people, Bills & invoices, Appointments & meetings, Shifts, overtime & call-outs, Health, School & family |
| 🏦 **Mortgage loan officer / title & escrow** | Loan files, rate locks, conditions, disclosures, title and closing packages. | Loan Pipeline | Important people, Bills & invoices, Appointments & meetings, Customer requests, Permits & inspections |

## 🩺 Health, education & public service (11)

| Profile | What it watches | Pulse | Default skills |
|---|---|---|---|
| 🩺 **Nurse / healthcare worker on shifts** | Shifts, the unit, the charge nurse, licence and CE renewals, staffing notices. | Unit Pulse | Important people, Appointments & meetings, Bills & invoices, Shifts & schedules, Licences & renewals, Portal, referral & prior-auth notices |
| ⚕️ **Physician / clinic, dental, or veterinary practice owner** | Prior auths, referrals, billing codes, credentialing, and keeping the practice running. | Practice Pulse | Important people, Appointments & meetings, Bills & invoices, Portal, referral & prior-auth notices, Licences & renewals, Shifts & schedules |
| 💬 **Therapist / counselor / social worker** | Sessions, intakes, superbills, telehealth, supervision hours, and licence renewals. | Caseload Pulse | Important people, Appointments & meetings, Bills & invoices, Sessions, intakes & enrollments, Licences & renewals, Portal, referral & prior-auth notices |
| 🍎 **K-12 teacher** | Lesson plans, IEPs, grades due, parent conferences, testing windows, sub requests. | Class Pulse | Important people, Appointments & meetings, Bills & invoices, Grades, testing & IEPs, Licences & renewals, School & family |
| 🎓 **Professor / researcher / grad student** | Manuscripts, reviewers, grants, IRB, committees, teaching, and the tenure clock. | Research Pulse | Important people, Appointments & meetings, Bills & invoices, Grants, donors & pledges, Grades, testing & IEPs, Travel |
| 🏫 **School administrator / principal / district staff** | The district, the board, enrollment, staffing, safety drills, and testing logistics. | School Pulse | Important people, Appointments & meetings, Bills & invoices, Grades, testing & IEPs, Grants, donors & pledges, Shifts & schedules |
| 📚 **College or high-school student** | Classes, the syllabus, financial aid, the registrar, housing, and exam week. | Semester Pulse | Important people, Appointments & meetings, Bills & invoices, Tuition, aid & registration, Grades, testing & IEPs, Orders & deliveries, Job search |
| 🤝 **Nonprofit director / fundraiser** | Donors, grants, the board, the gala, program reports, and the year-end appeal. | Mission Pulse | Important people, Appointments & meetings, Bills & invoices, Grants, donors & pledges, Customer requests, Travel |
| 🏛️ **Government / public-sector employee** | The agency, the council, public records, procurement, budgets, and civil-service rules. | Agency Pulse | Important people, Appointments & meetings, Bills & invoices, Grants, donors & pledges, Licences & renewals, Travel |
| ⛪ **Pastor / clergy / church or congregation staff** | Worship, the congregation, pastoral care, giving, weddings and funerals, the diocese. | Congregation Pulse | Important people, Appointments & meetings, Bills & invoices, Grants, donors & pledges, Sessions, intakes & enrollments, School & family |
| 🧸 **Childcare / eldercare provider, paid** | Enrollments, ratios, licensing visits, daily sheets, shifts, and family messages. | Care Pulse | Important people, Appointments & meetings, Bills & invoices, Shifts & schedules, Licences & renewals, Sessions, intakes & enrollments, School & family |

## 🎨 Creative, tech & independent (10)

| Profile | What it watches | Pulse | Default skills |
|---|---|---|---|
| 💻 **Software developer / engineer** | Pull requests, build failures, on-call pages, tickets, and deploys. | Build Pulse | Important people, Bills & invoices, Appointments & meetings, Alerts, outages & tickets, Domains, licences & subscriptions |
| 🖥️ **IT admin / helpdesk / managed services** | Tickets, backups, user accounts, patches, and the printer again. | Systems Pulse | Important people, Bills & invoices, Appointments & meetings, Alerts, outages & tickets, Domains, licences & subscriptions |
| 🎨 **Designer / creative freelancer** | Briefs, revisions, brand kits, proofs, and clients who want it by Friday. | Design Pulse | Important people, Bills & invoices, Appointments & meetings, Pitches, sponsors & brand deals, Gigs, shoots & contracts, Domains, licences & subscriptions |
| ✍️ **Writer / journalist / content creator / influencer** | Pitches, editors, bylines, drafts due, sponsorships, and brand deals. | Story Pulse | Important people, Bills & invoices, Appointments & meetings, Pitches, sponsors & brand deals |
| 📷 **Photographer / videographer / event pro** | Shoots, galleries, second shooters, retainers, and edit deadlines. | Shoot Pulse | Important people, Bills & invoices, Appointments & meetings, Bookings & sessions, Gigs, shoots & contracts, Pitches, sponsors & brand deals |
| 🎸 **Musician / performer / artist with gigs** | Gigs, setlists, venues, booking fees, merch, and rehearsals. | Gig Pulse | Important people, Bills & invoices, Appointments & meetings, Gigs, shoots & contracts, Pitches, sponsors & brand deals |
| 🛍️ **Online seller / retail shop owner** | Orders, returns, chargebacks, stock levels, and marketplace notices. | Shop Pulse | Important people, Bills & invoices, Appointments & meetings, Orders, returns & chargebacks, Reviews & ratings, Orders & deliveries |
| 🍽️ **Restaurant / café / food-truck / catering owner** | Reservations, food orders, health inspections, delivery apps, and staff shifts. | Kitchen Pulse | Important people, Bills & invoices, Appointments & meetings, Bookings & sessions, Reviews & ratings, Customer requests |
| 🧘 **Salon / spa / gym / fitness or yoga studio owner** | Class schedules, memberships, bookings, no-shows, and stylists or instructors. | Studio Pulse | Important people, Bills & invoices, Appointments & meetings, Bookings & sessions, Reviews & ratings |
| 🏋️ **Coach / tutor / instructor / personal trainer** | Sessions, client progress, packages, Zoom links, and reschedules. | Client Pulse | Important people, Bills & invoices, Appointments & meetings, Bookings & sessions, Reviews & ratings |

## 🏡 Life & home (11)

| Profile | What it watches | Pulse | Default skills |
|---|---|---|---|
| 👤 **General professional** | A job, a household, and an inbox — the sensible default. | Work Pulse | Important people, Bills & invoices, Appointments & meetings, Orders & deliveries, Travel, School & family, Health |
| 🌅 **Retiree / senior** | Medicare, Social Security, pension, doctors, grandkids, and community life. | Life Pulse | Important people, Bills & invoices, Appointments & meetings, Health, School & family, Benefits & coverage notices, Prescriptions & pharmacy, Statements, tax forms & dividends |
| 🧸 **Parent / household manager** | School, activities, the pediatrician, camps, carpools, and everyone's calendar. | Family Pulse | Important people, Bills & invoices, Appointments & meetings, School & family, Health, Orders & deliveries, Activities & signups, Prescriptions & pharmacy |
| 🤝 **Caregiver for a family member** | Managing a loved one's appointments, medications, insurance, and home care. | Care Pulse | Important people, Bills & invoices, Appointments & meetings, Health, School & family, Prescriptions & pharmacy, Benefits & coverage notices |
| 🔑 **Homeowner or renter** | HOA, mortgage or rent, utilities, repairs, insurance, and warranties. | Home Pulse | Important people, Bills & invoices, Appointments & meetings, Orders & deliveries, School & family, Home & household notices |
| 🔍 **Job seeker / between jobs** | Applications, interviews, unemployment benefits, networking, and COBRA. | Job Pipeline | Important people, Bills & invoices, Appointments & meetings, Job search, Orders & deliveries, Benefits & coverage notices |
| 🙌 **Volunteer / community organizer** | Signups, rosters, fundraisers, meetings, and keeping a club or league running. | Community Pulse | Important people, Bills & invoices, Appointments & meetings, School & family, Orders & deliveries, Activities & signups |
| 📈 **Personal investor / side-hustler** | Brokerage, dividends, tax forms, a rental or two, maybe some crypto. | Money Pulse | Important people, Bills & invoices, Appointments & meetings, Orders & deliveries, Statements, tax forms & dividends, Home & household notices |
| 🎖️ **Military / veteran family** | VA, TRICARE, PCS orders, deployment news, base housing, and family readiness. | Family Readiness | Important people, Bills & invoices, Appointments & meetings, Health, School & family, Travel, Orders, PCS & deployment, Benefits & coverage notices |
| 🧳 **Frequent traveler / expat / digital nomad** | Visas, bookings, currency, remote work across time zones, and the next flight. | Trip Pulse | Important people, Bills & invoices, Appointments & meetings, Travel, Orders & deliveries, Immigration, visas & passports |
| 🌍 **New to the country** | USCIS, an immigration lawyer, English classes, and setting up SSN, DMV, and bank. | Settling-in Pulse | Important people, Bills & invoices, Appointments & meetings, Health, School & family, Immigration, visas & passports, Benefits & coverage notices, Home & household notices |

## Skills that ship with the profiles

| Skill | What it does |
|---|---|
| ⭐ **Important people** | Anything from people you name is always treated as important. |
| 💵 **Bills & invoices** | Spots bills, invoices, and payment due dates so nothing goes overdue. |
| 📅 **Appointments & meetings** | Collects appointments, meetings, and confirmations into one list of upcoming dates. |
| 🏠 **Real-estate deals** | Tracks offers, contingencies, inspections, escrow and closing dates for each property. |
| 🦺 **Work orders & compliance** | Watches work orders, shift changes, safety bulletins, and mandatory training deadlines. |
| 📦 **Orders & deliveries** | Pulls tracking numbers and delivery dates from order and shipping emails. |
| ✈️ **Travel** | Gathers flight, hotel, and rental confirmations with their dates and confirmation codes. |
| 🎒 **School & family** | Keeps school notices, permission slips, and family events from getting buried. |
| 🩺 **Health** | Notices doctor appointments, prescriptions, and lab results (flagged as private). |
| 💼 **Job search** | Follows applications, interview invitations, and offers. |
| 🙋 **Customer requests** | Surfaces customer questions, complaints, and quote requests that need a reply. |
| 🤝 **Quotes, proposals & deals** | Follows quotes, proposals, and contracts with prospects so no deal goes quiet or expires unnoticed. |
| 🧑‍💼 **Candidates & interviews** | Keeps candidates, interview times, offers, and start-date paperwork from slipping through the cracks. |
| 💰 **Money owed to you** | Watches the invoices you sent to clients: what was paid, what bounced, and what is overdue. |
| ⚖️ **Court & filing deadlines** | Pulls court dates, filing deadlines, discovery dates, and e-filing results into one list so nothing is missed. |
| 📊 **Campaigns & reports** | Gathers ad, email, and social performance reports, and flags accounts that are paused, rejected, or out of budget. |
| 🎫 **Support tickets & SLAs** | Tracks help-desk tickets, escalations, and SLA warnings so the customers waiting longest come first. |
| ✅ **Approvals & sign-offs** | Collects the approvals, signatures, and status reports that are waiting on you, with their deadlines. |
| 📋 **Permits & inspections** | Watches permit approvals, inspection appointments and results, and correction notices from the building department. |
| 🧾 **Jobs, estimates & change orders** | Follows estimates, bids, change orders, deposits, punch lists and final payments for each job. |
| 🔑 **Tenants & rentals** | Gathers tenant maintenance requests, rent payments, lease renewals and notices for each unit. |
| 🛣️ **Loads & dispatch** | Tracks load offers, pickup and delivery appointments, dispatch notes, DOT paperwork and hours-of-service notices. |
| 🔩 **Parts & vehicle service** | Spots parts orders and backorders, repair orders, service reminders, recalls and vehicles ready for pickup. |
| 🕐 **Shifts, overtime & call-outs** | Collects shift schedules, bids and trades, overtime and hold-overs, and call-outs that leave a shift uncovered. |
| 🌦️ **Farm, weather & market notices** | Watches weather warnings, market and cash-bid reports, co-op and USDA notices, and farm program deadlines. |
| 🕐 **Shifts & schedules** | Catches shift schedules, open shifts, overtime, call coverage, and time-off answers. |
| 📜 **Licences & renewals** | Watches licence, certification, CE/CME, background-check, and mandatory-training renewals. |
| 📝 **Grades, testing & IEPs** | Tracks grades due, report cards, testing windows, IEP and 504 meetings, and conferences. |
| 🎁 **Grants, donors & pledges** | Follows grant deadlines and reports, donor gifts, pledges, and fundraising campaigns. |
| 🗂️ **Portal, referral & prior-auth notices** | Spots patient-portal, referral, prior-authorization, and claim notices; keeps only dates and reference numbers. |
| 🎒 **Tuition, aid & registration** | Keeps financial-aid, tuition, registration, housing, and drop deadlines in one place. |
| 🗓️ **Sessions, intakes & enrollments** | Gathers client sessions, intakes, cancellations, supervision, and new-family enrollments. |
| 🗓️ **Bookings & sessions** | Gathers session bookings, class reservations, reschedules, and no-shows into one list with dates. |
| 🛒 **Orders, returns & chargebacks** | Watches marketplace orders, return and refund requests, chargebacks, and low-stock warnings. |
| 🚨 **Alerts, outages & tickets** | Catches on-call pages, failed builds and backups, security alerts, and tickets waiting on you. |
| 🎤 **Gigs, shoots & contracts** | Tracks gig and shoot confirmations, contracts, call times, and fees so every date is on the list. |
| 🤝 **Pitches, sponsors & brand deals** | Surfaces editor replies, sponsorship and brand-deal offers, and collaboration requests with their deadlines. |
| ⭐ **Reviews & ratings** | Spots new customer reviews and ratings so the bad ones get a reply and the good ones get a thank-you. |
| 🔑 **Domains, licences & subscriptions** | Watches domain, certificate, software licence, and subscription renewals so nothing quietly expires. |
| 🏛️ **Benefits & coverage notices** | Watches Medicare, Social Security, VA, unemployment, and insurance letters for dates you must act by. |
| 💊 **Prescriptions & pharmacy** | Catches refill reminders, ready-for-pickup notices, and prior-authorization holds before anyone runs out. |
| 🏠 **Home & household notices** | Tracks HOA and landlord notices, lease dates, utility alerts, warranty claims, and repair visits. |
| ⚽ **Activities & signups** | Gathers practices, games, camps, rehearsals, and signup deadlines into one schedule. |
| 🛂 **Immigration, visas & passports** | Follows USCIS case updates, biometrics and interview dates, visa applications, and passport expirations. |
| 🧾 **Statements, tax forms & dividends** | Notes brokerage and retirement statements, tax forms, dividends, and account alerts as they arrive. |
| 🎖️ **Orders, PCS & deployment** | Watches military orders, PCS moves, report dates, deployment and unit family notices, and housing dates. |

_Generated by `npm run docs:profiles` — edit the catalogues, not this file._
