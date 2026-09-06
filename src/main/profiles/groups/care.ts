import type { WorkProfile } from '../profiles'

/**
 * Health, education & public service: people whose work mail is about patients,
 * clients, students, congregations, and the public — and whose schedules,
 * licences, and deadlines are set by someone else.
 */
export const CARE_PROFILES: WorkProfile[] = [
  {
    id: 'nurse',
    name: 'Nurse / healthcare worker on shifts',
    group: 'care',
    icon: '🩺',
    tagline: 'Shifts, the unit, the charge nurse, licence and CE renewals, staffing notices.',
    pulseName: 'Unit Pulse',
    workDescription:
      'The user is a nurse or other shift-based healthcare worker (hospital, clinic, or long-term care). Work mail includes ' +
      'shift schedules and shift bids, staffing and float notices, messages from the charge nurse or unit manager, ' +
      'timekeeping systems like Kronos, chart and EHR notices (Epic, Cerner), licence and CE-credit renewals, ' +
      'certifications (BLS, ACLS), and hospital policy or compliance mail. Personal mail is family, household, and their own health. ' +
      'Track each work item by unit or shift date; never record patient details.',
    urgencyHints: [
      'schedule changes, mandated overtime, or shift swaps needing an answer',
      'licence, CE, or certification renewals coming due',
      'time-off or shift-bid windows that close',
      'compliance training or policy acknowledgments with a deadline',
      'messages from the charge nurse or manager waiting on a reply'
    ],
    entityNoun: 'shift',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-shifts', 'c-credentials', 'c-portal'],
    signals: [
      { pattern: '\\b(charge nurse|nurse manager|unit manager|nursing supervisor|house supervisor)\\b', weight: 3 },
      { pattern: '\\b(shift bid|self-?schedul(?:e|ing)|float pool|shift differential|open shifts?)\\b', weight: 3 },
      { pattern: '\\b(kronos|ukg dimensions|api healthcare|shiftwizard|nursegrid|qgenda)\\b', weight: 3 },
      { pattern: '\\b(epic (?:access|training|login|downtime|upgrade|tip sheet)|cerner|meditech|pyxis|omnicell)\\b', weight: 2 },
      { pattern: '\\b(ce credits?|contact hours|nursing ce|ce broker)\\b', weight: 2 },
      { pattern: '\\b(rn license|nursing license|nclex|ancc|bsn|msn|dnp|board of nursing)\\b', weight: 3 },
      { pattern: '\\b(acls|bls renewal|pals|nrp|tncc|bls card)\\b', weight: 2 },
      { pattern: '\\b(med-?surg|telemetry unit|icu|nicu|picu|labor and delivery|step-?down unit|the floor)\\b', weight: 2 },
      { pattern: '\\b(night shift|day shift|12-hour shifts?|three 12s|weekend option|weekend program)\\b', weight: 2 },
      { pattern: '\\b(staffing office|low census|mandated overtime|call-?off|short-?staffed)\\b', weight: 2 },
      { pattern: '\\b(preceptor|precepting|nurse residency|new grad residency|clinical ladder)\\b', weight: 3 },
      { pattern: '\\b(patient assignment|bedside report|hand-?off report|nurse[- ]to[- ]patient ratio)\\b', weight: 2 },
      { pattern: '\\b(magnet (?:status|designation|recognition)|joint commission|jcaho|survey readiness)\\b', weight: 2 },
      { pattern: '\\b(pto request|time-?off request|holiday rotation|holiday schedule request)\\b', weight: 1 },
      { pattern: '\\b(nurses? week|travel nurse|agency nurse|per diem)\\b', weight: 2 }
    ]
  },
  {
    id: 'physician',
    name: 'Physician / clinic, dental, or veterinary practice owner',
    group: 'care',
    icon: '⚕️',
    tagline: 'Prior auths, referrals, billing codes, credentialing, and keeping the practice running.',
    pulseName: 'Practice Pulse',
    workDescription:
      'The user is a physician, dentist, veterinarian, or other provider who runs or works in a practice. Work mail includes ' +
      'prior authorizations, referrals, billing and coding (CPT, ICD-10, claim denials), payer and Medicare notices, ' +
      'practice-management and EHR systems, the practice manager and staff, credentialing, licence, DEA and CME renewals, ' +
      'call schedules, malpractice, and vendor mail. Personal mail is family, household, and their own finances. ' +
      'Track items by patient reference number or payer, never by patient name or diagnosis.',
    urgencyHints: [
      'prior authorizations or referrals about to expire or denied',
      'claim denials and payer deadlines',
      'licence, DEA, credentialing, or CME deadlines',
      'unsigned orders, notes, or results waiting on the provider',
      'call-coverage gaps or staff absences',
      'malpractice or compliance notices'
    ],
    entityNoun: 'patient',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-portal', 'c-credentials', 'c-shifts'],
    signals: [
      { pattern: '\\b(prior auth(?:orization)?s?|pre-?authorization|auth request)\\b', weight: 3 },
      { pattern: '\\b(cpt codes?|icd-?10|claim denials?|denied claims?|clean claims?|coding query)\\b', weight: 3 },
      { pattern: '\\b(referral(?:s)? (?:for|from|to|received|pending)|referring (?:provider|physician)|specialist referral)\\b', weight: 2 },
      { pattern: '\\b(practice manager|medical assistant|medical receptionist|billing specialist|billing department)\\b', weight: 2 },
      { pattern: '\\b(athena(?:health|one)?|eclinicalworks|nextgen|allscripts|practice fusion|dentrix|eaglesoft|open dental|avimark|ezyvet)\\b', weight: 3 },
      { pattern: '\\b(cme credits?|cme (?:requirements?|deadline|activity)|board (?:recertification|certification|exam)|moc points?)\\b', weight: 2 },
      { pattern: '\\b(dea (?:registration|renewal|license)|npi (?:number|registry)|medical license|state medical board|dental license|veterinary license)\\b', weight: 3 },
      { pattern: '\\b(credentialing|re-?credentialing|payer enrollment|caqh|hospital privileges|privileging)\\b', weight: 3 },
      { pattern: '\\b(malpractice|tail coverage|risk management|adverse event|incident review)\\b', weight: 2 },
      { pattern: '\\b(medicare|medicaid|cms|payers?|reimbursement|fee schedule|rvus?)\\b', weight: 2 },
      { pattern: '\\b(call schedule|on-?call coverage|locum tenens|locums|covering provider)\\b', weight: 2 },
      { pattern: '\\b(patient (?:portal messages?|volume|panel|no-?shows?)|no-?show rate|schedule template)\\b', weight: 2 },
      { pattern: '\\b(dds|dmd|dvm|hygienist|vet tech|veterinary technician|attending physician|hospitalist)\\b', weight: 2 },
      { pattern: '\\b(lab orders?|imaging orders?|orders? pending signature|unsigned (?:notes|encounters|orders))\\b', weight: 2 },
      { pattern: '\\b(mips|macra|quality measures|hedis|meaningful use|value-?based care)\\b', weight: 3 }
    ]
  },
  {
    id: 'therapist',
    name: 'Therapist / counselor / social worker',
    group: 'care',
    icon: '💬',
    tagline: 'Sessions, intakes, superbills, telehealth, supervision hours, and licence renewals.',
    pulseName: 'Caseload Pulse',
    workDescription:
      'The user is a therapist, counselor, or social worker in private practice or an agency. Work mail includes ' +
      'session bookings and cancellations, new-client intakes, telehealth links, superbills and insurance panels, ' +
      'supervision hours and licensure, CEUs, practice-management tools like SimplePractice or TherapyNotes, and agency or ' +
      'case-management notices. Personal mail is family, friends, and household. Track each client only by initials or a case number, ' +
      'and never repeat clinical details.',
    urgencyHints: [
      'crisis or safety-plan situations',
      'same-day cancellations or no-shows',
      'intake paperwork or releases needed before a first session',
      'licence, supervision-hour, or CEU deadlines',
      'insurance-panel or superbill problems delaying payment',
      'mandated-reporter or agency deadlines'
    ],
    entityNoun: 'client',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-sessions', 'c-credentials', 'c-portal'],
    signals: [
      { pattern: '\\b(intake (?:form|paperwork|session|appointment|packet|call)|new client intake)\\b', weight: 3 },
      { pattern: '\\b(superbills?|sliding scale|out-?of-?network|self-?pay rate|session fee)\\b', weight: 3 },
      { pattern: '\\b(telehealth|teletherapy|video session|zoom for healthcare|doxy)\\b', weight: 2 },
      { pattern: '\\b(supervision hours|clinical supervision|supervisor sign-?off|hours toward licensure|associate license)\\b', weight: 3 },
      { pattern: '\\b(lcsw|lmft|lpc|lpcc|lmhc|lcpc|psyd|licensed clinical social worker|marriage and family therapist)\\b', weight: 3 },
      { pattern: '\\b(simplepractice|therapynotes|theranest|jane app|psychology today|headway|grow therapy)\\b', weight: 3 },
      { pattern: '\\b(treatment plan|progress notes?|soap notes?|case notes?|case conceptualization)\\b', weight: 2 },
      { pattern: '\\b(ceus?|continuing education (?:units|credits|hours)|ethics ceu|ce requirement)\\b', weight: 1 },
      { pattern: '\\b(session (?:reminder|confirmed|cancell?ation|notes|rate)|sessions? this week|missed session|late cancel)\\b', weight: 2 },
      { pattern: '\\b(caseload|case management|mandated reporter|safety plan|crisis (?:line|plan|assessment))\\b', weight: 2 },
      { pattern: '\\b(insurance panel|paneling|paneled with|credentialing with (?:insurance|payers)|eap referral)\\b', weight: 2 },
      { pattern: '\\b(couples therapy|family therapy|group therapy|play therapy|emdr|cbt|dbt|trauma-?informed)\\b', weight: 2 },
      { pattern: '\\b(hipaa|baa|release of information|roi form|informed consent|confidentiality agreement)\\b', weight: 1 },
      { pattern: '\\b(dcf|dcfs|child protective services|adult protective services|foster care placement|home visit)\\b', weight: 2 },
      { pattern: '\\b(clients? this week|client (?:no-?show|cancell?ed|session)|no-?show (?:fee|policy))\\b', weight: 1 }
    ]
  },
  {
    id: 'teacher',
    name: 'K-12 teacher',
    group: 'care',
    icon: '🍎',
    tagline: 'Lesson plans, IEPs, grades due, parent conferences, testing windows, sub requests.',
    pulseName: 'Class Pulse',
    workDescription:
      'The user is a K-12 classroom teacher. Work mail includes lesson plans and curriculum, grades and report-card deadlines, ' +
      'IEP and 504 meetings, parent messages and conferences, testing windows, substitute and absence systems, ' +
      'the principal and district office, professional-development days, and classroom tools like PowerSchool or Google Classroom. ' +
      'Personal mail is their own family, household, and finances. Track work by class, grade level, or student initials; ' +
      'never record student names with grades or behavior details.',
    urgencyHints: [
      'grades or report cards due',
      'IEP or 504 meetings and paperwork deadlines',
      'parent messages waiting on a reply',
      'testing windows and proctoring assignments',
      'sub plans needed or absence requests',
      'principal or district requests with a deadline'
    ],
    entityNoun: 'class',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-grades', 'c-credentials', 'family'],
    signals: [
      { pattern: '\\b(lesson plans?|unit plans?|sub plans?|pacing guide|scope and sequence)\\b', weight: 3 },
      { pattern: '\\b(ieps?|iep meeting|504 plans?|504 meeting|accommodations? (?:plan|list))\\b', weight: 3 },
      { pattern: '\\b(grades? (?:are )?due|gradebook|grading period|progress reports?|report cards? (?:due|go home))\\b', weight: 3 },
      { pattern: '\\b(parent[- ]teacher conferences?|parent conferences?|conference (?:night|sign-?ups?)|back[- ]to[- ]school night)\\b', weight: 3 },
      { pattern: '\\b(powerschool|schoology|google classroom|classdojo|class dojo|seesaw|nearpod|kahoot|remind app)\\b', weight: 3 },
      { pattern: '\\b(state testing|standardized test(?:s|ing)|testing window|benchmark assessment|map testing|nwea|i-?ready|star assessment)\\b', weight: 3 },
      { pattern: '\\b(substitute (?:teacher|request|needed)|sub (?:request|needed|coverage)|frontline absence|aesop)\\b', weight: 2 },
      { pattern: '\\b(classroom (?:supplies|management|library|setup)|donorschoose|teacher wish ?list|bulletin board)\\b', weight: 2 },
      { pattern: '\\b(homeroom|grade level team|plc meeting|team planning time|common planning)\\b', weight: 2 },
      { pattern: '\\b(pd day|professional development day|inservice|in-service day|teacher workday|early release day)\\b', weight: 2 },
      { pattern: '\\b(curriculum (?:night|map|adoption)|standards alignment|common core|next generation science standards|ngss)\\b', weight: 2 },
      { pattern: '\\b(behavior referral|discipline referral|office referral|detention|tardy sweep)\\b', weight: 1 },
      { pattern: '\\b(teaching (?:license|certificate|credential)|clear credential|teacher certification renewal|praxis)\\b', weight: 2 },
      { pattern: '\\b(field trip (?:permission|forms?|chaperones?)|chaperones? needed|permission slips? (?:due|returned))\\b', weight: 1 },
      { pattern: '\\b(my students|our students|student work samples?|exit tickets?|rubrics?)\\b', weight: 1 }
    ]
  },
  {
    id: 'professor',
    name: 'Professor / researcher / grad student',
    group: 'care',
    icon: '🎓',
    tagline: 'Manuscripts, reviewers, grants, IRB, committees, teaching, and the tenure clock.',
    pulseName: 'Research Pulse',
    workDescription:
      'The user is a professor, researcher, postdoc, or graduate student at a university or lab. Work mail includes ' +
      'manuscripts and peer review, journal and conference deadlines, grant proposals and reports (NSF, NIH, foundations), ' +
      'IRB and compliance, dissertation and committee work, teaching (course sites, evaluations, TAs), department and ' +
      'faculty business, and lab or student supervision. Personal mail is family, household, and finances. ' +
      'Track work by paper, grant, course, or advisee.',
    urgencyHints: [
      'submission, revision, or camera-ready deadlines',
      'grant proposal and progress-report due dates',
      'IRB approvals or renewals lapsing',
      'reviewer or editor requests with a date',
      'committee, defense, or tenure-dossier dates',
      'students or advisees blocked waiting on the user'
    ],
    entityNoun: 'project',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-grants', 'c-grades', 'travel'],
    signals: [
      { pattern: '\\b(manuscript|revise and resubmit|reviewer (?:comments|reports?|2)|peer[- ]review(?:ed|er)?)\\b', weight: 3 },
      { pattern: '\\b(irb (?:approval|protocol|submission|renewal)|institutional review board|human subjects)\\b', weight: 3 },
      { pattern: '\\b(nsf|nih|r01|grant proposal|funding opportunity|nofo|program officer)\\b', weight: 2 },
      { pattern: '\\b(tenure|tenure-?track|promotion and tenure|dossier|sabbatical|adjunct|emeritus)\\b', weight: 3 },
      { pattern: '\\b(dissertation|thesis (?:defense|committee|proposal)|qualifying exams?|prelims|defense date)\\b', weight: 3 },
      { pattern: '\\b(call for papers|cfp|abstract (?:submission|accepted|deadline)|camera-?ready|conference proceedings|poster session)\\b', weight: 3 },
      { pattern: '\\b(course evaluations?|teaching evaluations?|ta (?:assignments?|training|hours)|teaching assistants?|graders? needed)\\b', weight: 2 },
      { pattern: '\\b(overleaf|latex|arxiv|orcid|google scholar|researchgate|scopus|web of science|pubmed|zotero|mendeley)\\b', weight: 3 },
      { pattern: '\\b(department chair|dean\'?s office|faculty senate|faculty meeting|provost|academic affairs)\\b', weight: 2 },
      { pattern: '\\b(postdoc|post-?doctoral|research assistant|lab meeting|lab members|principal investigator)\\b', weight: 2 },
      { pattern: '\\b(journal (?:submission|article|editor|special issue)|impact factor|editorial board|editor-?in-?chief|handling editor)\\b', weight: 3 },
      { pattern: '\\b(phd (?:students?|candidate|program|advisor)|graduate students?|grad students?|advisees?|dissertation advisor)\\b', weight: 2 },
      { pattern: '\\b(no-?cost extension|effort reporting|indirect costs?|f&a rate|sponsored programs|office of research)\\b', weight: 2 },
      { pattern: '\\b(canvas (?:course|gradebook|announcement)|turnitin|gradescope|top hat|piazza)\\b', weight: 1 },
      { pattern: '\\b(academic (?:integrity|misconduct|calendar)|plagiarism report|incomplete grade|grade appeal)\\b', weight: 1 }
    ]
  },
  {
    id: 'schooladmin',
    name: 'School administrator / principal / district staff',
    group: 'care',
    icon: '🏫',
    tagline: 'The district, the board, enrollment, staffing, safety drills, and testing logistics.',
    pulseName: 'School Pulse',
    workDescription:
      'The user is a principal, assistant principal, or district-office administrator. Work mail includes the superintendent and ' +
      'school board, enrollment and attendance reports, master schedules and staffing, special-education compliance, ' +
      'federal programs like Title I, safety drills and incidents, discipline, transportation, testing logistics, teacher ' +
      'observations, and parent or community groups. Personal mail is family, household, and finances. ' +
      'Track work by school, department, or initiative; never record student names with discipline or special-education details.',
    urgencyHints: [
      'board or superintendent requests with a deadline',
      'safety incidents, drills, or lockdown follow-ups',
      'compliance and federal-program reports due',
      'staffing gaps, vacancies, or sub shortages',
      'parent complaints that could escalate',
      'testing-window and enrollment-count deadlines'
    ],
    entityNoun: 'school',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-grades', 'c-grants', 'c-shifts'],
    signals: [
      { pattern: '\\b(superintendent|school board (?:meeting|agenda|policy)|board of education|boe meeting)\\b', weight: 3 },
      { pattern: '\\b(principal\'?s? (?:office|meeting|message|report)|assistant principal|vice principal|head of school|dean of students)\\b', weight: 3 },
      { pattern: '\\b(district office|central office|district-?wide|school district|districts? (?:policy|calendar|memo))\\b', weight: 2 },
      { pattern: '\\b(enrollment (?:numbers|projections|report|count)|student count|october count|average daily attendance)\\b', weight: 3 },
      { pattern: '\\b(master schedule|bell schedule|staffing plan|teacher vacanc(?:y|ies)|hiring committee)\\b', weight: 2 },
      { pattern: '\\b(title i|title ix|title iii|esser|idea funds?|federal programs|consolidated application)\\b', weight: 3 },
      { pattern: '\\b(special education director|sped (?:director|department|referral)|child find|due process hearing|compliance review)\\b', weight: 3 },
      { pattern: '\\b(fire drill|lockdown drill|safety drill|school resource officer|crisis team|emergency operations plan)\\b', weight: 2 },
      { pattern: '\\b(suspension|expulsion hearing|discipline data|attendance (?:report|letter|officer)|truancy|chronic absenteeism)\\b', weight: 2 },
      { pattern: '\\b(infinite campus|skyward|frontline (?:education|absence management|recruiting)|aeries|synergy sis|transfinder)\\b', weight: 3 },
      { pattern: '\\b(bus routes?|transportation department|bus driver shortage|route changes?)\\b', weight: 2 },
      { pattern: '\\b(school improvement plan|accreditation|accountability (?:report|rating)|school report card|state report card)\\b', weight: 2 },
      { pattern: '\\b(walkthroughs?|teacher observations?|evaluation cycle|danielson|marzano|instructional rounds)\\b', weight: 2 },
      { pattern: '\\b(pta meeting|ptsa|booster club|site council|school site council|parent night)\\b', weight: 1 },
      { pattern: '\\b(testing coordinator|test security|test administration|state assessment window|accountability testing)\\b', weight: 2 },
      { pattern: '\\b(student registration|registration packets?|new student enrollment|kindergarten registration|proof of residency)\\b', weight: 2 }
    ]
  },
  {
    id: 'student',
    name: 'College or high-school student',
    group: 'care',
    icon: '📚',
    tagline: 'Classes, the syllabus, financial aid, the registrar, housing, and exam week.',
    pulseName: 'Semester Pulse',
    workDescription:
      'The user is a college or high-school student. "Work" mail is anything about school: courses and the syllabus, assignments ' +
      'and exams, professors and TAs, the registrar, bursar, and financial aid, tuition and scholarships, housing and the dorm, ' +
      'campus services, clubs, and internships or campus jobs. Personal mail is family, friends, shopping, and entertainment. ' +
      'Track work by course, and keep every deadline: registration, drop dates, aid, housing, and exams.',
    urgencyHints: [
      'assignment or exam dates in the next few days',
      'registration, add/drop, or withdrawal deadlines',
      'financial-aid, tuition, or scholarship deadlines',
      'holds on the student account or registration',
      'housing and meal-plan deadlines',
      'professor or advisor messages waiting on a reply'
    ],
    entityNoun: 'course',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-tuition', 'c-grades', 'shipping', 'jobsearch'],
    signals: [
      { pattern: '\\b(syllabus|syllabi|course syllabus)\\b', weight: 3 },
      { pattern: '\\b(financial aid|fafsa|pell grant|student loans?|loan disbursement|work-?study)\\b', weight: 3 },
      { pattern: '\\b(registrar|bursar|registrar\'?s office|bursar\'?s office|student accounts?)\\b', weight: 3 },
      { pattern: '\\b(dorm|residence hall|res hall|housing (?:assignment|contract|application|selection)|roommate|move-?in day|meal plan)\\b', weight: 3 },
      { pattern: '\\b(tuition (?:due|bill|payment|statement)|tuition and fees|scholarship (?:award|application|renewal|deadline))\\b', weight: 2 },
      { pattern: '\\b(course registration|register for classes|add/drop|add-drop|drop deadline|waitlisted for)\\b', weight: 3 },
      { pattern: '\\b(midterms?|final exams?|finals week|exam schedule|study guide|study group)\\b', weight: 2 },
      { pattern: '\\b(canvas (?:assignment|quiz|discussion|due)|blackboard|brightspace|d2l|moodle|chegg|quizlet)\\b', weight: 2 },
      { pattern: '\\b(academic advisor|advising appointment|degree audit|degreeworks|transcript request|gpa|dean\'?s list|academic probation)\\b', weight: 2 },
      { pattern: '\\b(student id|campus (?:card|bookstore|dining|rec center|parking permit)|campus safety alert|campus alert)\\b', weight: 2 },
      { pattern: '\\b(internship (?:application|offer|posting|fair)|career (?:center|fair|services)|handshake|on-?campus job|student employment)\\b', weight: 2 },
      { pattern: '\\b(ap exams?|ap scores?|psat|common app|college applications?|admissions? (?:decision|portal)|sat prep|act prep)\\b', weight: 2 },
      { pattern: '\\b(student (?:organization|orgs?|government|club|activities)|greek life|rush week|intramurals?|homecoming)\\b', weight: 2 },
      { pattern: '\\b(grad(?:uation)? (?:application|audit|ceremony)|commencement|cap and gown|diploma)\\b', weight: 1 },
      { pattern: '@[a-z0-9.-]+\\.edu\\b', weight: 1 },
      { pattern: '\\b(lecture (?:notes|hall|slides)|recitation|lab section|discussion section|my professor)\\b', weight: 1 }
    ]
  },
  {
    id: 'nonprofit',
    name: 'Nonprofit director / fundraiser',
    group: 'care',
    icon: '🤝',
    tagline: 'Donors, grants, the board, the gala, program reports, and the year-end appeal.',
    pulseName: 'Mission Pulse',
    workDescription:
      'The user runs or raises money for a nonprofit. Work mail includes donors and pledges, grant applications and reports, ' +
      'foundations and funders, the board of directors, fundraising events, donor-database tools, program outcomes, ' +
      'volunteers, sponsors, and compliance filings like the Form 990. Personal mail is family, household, and finances. ' +
      'Track work by grant, campaign, event, or donor.',
    urgencyHints: [
      'grant application or report deadlines',
      'donor or funder messages waiting on a reply',
      'pledges or matching gifts about to lapse',
      'board meeting materials due',
      'event logistics in the next two weeks',
      'compliance filings and audit requests'
    ],
    entityNoun: 'grant',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-grants', 'customers', 'travel'],
    signals: [
      { pattern: '\\b(donors?|donor (?:database|list|retention|stewardship|thank-?you))\\b', weight: 2 },
      { pattern: '\\b(grant (?:report|cycle|application|award|renewal|writer|writing)|letter of inquiry|loi due|foundation grant|grant funder)\\b', weight: 3 },
      { pattern: '\\b(501c3|non-?profit|nonprofit|charitable organization|tax-?exempt status)\\b', weight: 2 },
      { pattern: '\\b(fundrais(?:er|ing)|annual appeal|year-?end appeal|giving tuesday|capital campaign|matching gift|major gifts?|planned giving)\\b', weight: 3 },
      { pattern: '\\b(gala|silent auction|benefit dinner|fund-?a-?need|paddle raise|walkathon|5k fundraiser)\\b', weight: 2 },
      { pattern: '\\b(bloomerang|donorperfect|neon crm|little green light|salesforce npsp|network for good|givebutter|raiser\'?s edge|kindful|givesmart|onecause)\\b', weight: 3 },
      { pattern: '\\b(board of directors|board chair|board retreat|board packet|executive director|development director|director of development)\\b', weight: 2 },
      { pattern: '\\b(program director|program outcomes|outcomes report|logic model|impact report|theory of change)\\b', weight: 2 },
      { pattern: '\\b(form 990|990-?ez|restricted funds?|in-?kind (?:donations?|gifts?)|fund accounting)\\b', weight: 2 },
      { pattern: '\\b(guidestar|candid profile|foundation directory|instrumentl|grantstation|charity navigator)\\b', weight: 3 },
      { pattern: '\\b(volunteer (?:coordinator|orientation|appreciation)|volunteermatch|signupgenius)\\b', weight: 1 },
      { pattern: '\\b(mission statement|our mission|strategic plan|advocacy day|coalition|community partners?)\\b', weight: 1 },
      { pattern: '\\b(donation receipt|tax-?deductible|acknowledgment letters?|thank-?you letters? to donors|gift acknowledgment)\\b', weight: 2 },
      { pattern: '\\b(peer-?to-?peer (?:campaign|fundraising)|crowdfunding campaign|gofundme|donation page|giving page)\\b', weight: 2 },
      { pattern: '\\b(sponsorship (?:packet|levels|request)|corporate sponsors?|event sponsors?|underwriting)\\b', weight: 2 }
    ]
  },
  {
    id: 'government',
    name: 'Government / public-sector employee',
    group: 'care',
    icon: '🏛️',
    tagline: 'The agency, the council, public records, procurement, budgets, and civil-service rules.',
    pulseName: 'Agency Pulse',
    workDescription:
      'The user works for a city, county, state, or federal agency. Work mail includes the council or board, agency leadership, ' +
      'public-records and FOIA requests, ordinances, hearings and agenda items, procurement and RFPs, budgets and fiscal-year ' +
      'deadlines, civil-service and benefits notices, ethics and mandatory training, constituents, and other departments. ' +
      'Personal mail is family, household, and finances. Track work by case, request, project, or agenda item.',
    urgencyHints: [
      'public-records or FOIA response deadlines',
      'council, board, or hearing dates and agenda-packet deadlines',
      'procurement and bid deadlines',
      'budget submissions and fiscal-year close',
      'ethics, training, or disclosure filings due',
      'constituent or leadership requests with a date'
    ],
    entityNoun: 'case',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-grants', 'c-credentials', 'travel'],
    signals: [
      { pattern: '@[a-z0-9.-]+\\.gov\\b', weight: 3 },
      { pattern: '\\b(city council|county commission(?:ers)?|board of supervisors|town council|council meeting|council agenda)\\b', weight: 3 },
      { pattern: '\\b(foia|public records? requests?|open records|sunshine (?:law|request)|records retention|records request)\\b', weight: 3 },
      { pattern: '\\b(ordinance|resolution no|agenda item|staff report|public hearing|public comment period)\\b', weight: 3 },
      { pattern: '\\b(civil service|merit system|classified (?:position|employee)|job classification|step increase|cola adjustment)\\b', weight: 2 },
      { pattern: '\\b(gs-\\d{1,2}|federal employee|opm|usajobs|fers|thrift savings plan|calpers|pension contribution)\\b', weight: 2 },
      { pattern: '\\b(procurement|rfp|request for proposals?|bid opening|sole source|purchase requisition|contract award)\\b', weight: 2 },
      { pattern: '\\b(state agency|department of (?:transportation|health|education|revenue|corrections|labor|social services|motor vehicles)|dmv)\\b', weight: 2 },
      { pattern: '\\b(legislative session|legislature|fiscal note|appropriations?|house bill|senate bill)\\b', weight: 3 },
      { pattern: '\\b(constituents?|constituent services|casework|town hall meeting|mayor\'?s office|the mayor)\\b', weight: 2 },
      { pattern: '\\b(ethics training|annual ethics|financial disclosure (?:form|statement)|conflict of interest form|hatch act)\\b', weight: 2 },
      { pattern: '\\b(furlough|government shutdown|continuing resolution|fiscal year (?:end|close|budget)|budget hearing|budget workshop)\\b', weight: 2 },
      { pattern: '\\b(memorandum|interoffice memo|policy directive|administrative order|executive order)\\b', weight: 1 },
      { pattern: '\\b(planning commission|zoning (?:board|commission|hearing)|code enforcement|public works)\\b', weight: 2 },
      { pattern: '\\b(clerk\'?s office|county clerk|city clerk|city manager|county administrator)\\b', weight: 2 },
      { pattern: '\\b(grant agreement|federal grant|cdbg|arpa funds?|state funding)\\b', weight: 1 }
    ]
  },
  {
    id: 'clergy',
    name: 'Pastor / clergy / church or congregation staff',
    group: 'care',
    icon: '⛪',
    tagline: 'Worship, the congregation, pastoral care, giving, weddings and funerals, the diocese.',
    pulseName: 'Congregation Pulse',
    workDescription:
      'The user is a pastor, priest, rabbi, imam, or paid staff at a church, synagogue, mosque, or congregation. Work mail includes ' +
      'worship and sermon planning, pastoral care and prayer requests, weddings, funerals, and baptisms, giving and pledges, ' +
      'the church office and council, ministries and small groups, church-management tools, and the denomination or diocese. ' +
      'Personal mail is family, household, and finances. Track work by service date, event, ministry, or family (by surname only).',
    urgencyHints: [
      'pastoral emergencies: hospital visits, deaths, crises',
      'funerals, weddings, and services in the next week',
      'sermon and bulletin deadlines',
      'council, vestry, or diocesan requests with a date',
      'pledge or giving shortfalls and building-fund deadlines',
      'volunteer gaps for an upcoming service'
    ],
    entityNoun: 'ministry',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-grants', 'c-sessions', 'family'],
    signals: [
      { pattern: '\\b(sermon|homily|sermon series|preaching schedule|liturgy|lectionary)\\b', weight: 3 },
      { pattern: '\\b(congregation|congregants?|parish|parishioners?|synagogue|mosque|temple members?)\\b', weight: 3 },
      { pattern: '\\b(pastor|pastoral (?:care|visit|staff)|reverend|rabbi|imam|priest|deacons?|elders? meeting|vestry)\\b', weight: 3 },
      { pattern: '\\b(worship (?:service|team|schedule|committee)|sunday service|sunday school|choir (?:practice|rehearsal)|praise team|hymns?)\\b', weight: 3 },
      { pattern: '\\b(tithes?|tithing|offering (?:envelopes?|plate|totals?)|weekly offering|contribution statements?|giving statements?)\\b', weight: 3 },
      { pattern: '\\b(pledge cards?|pledge drive|stewardship (?:sunday|campaign|season|committee)|building fund)\\b', weight: 2 },
      { pattern: '\\b(baptism|christening|confirmation class|first communion|bar mitzvah|bat mitzvah|wedding (?:officiant|ceremony|rehearsal)|funeral service|memorial service|graveside)\\b', weight: 2 },
      { pattern: '\\b(bible study|small groups?|youth group|youth ministry|vacation bible school|vbs|sunday school teachers?)\\b', weight: 3 },
      { pattern: '\\b(planning center|breeze chms|tithely|pushpay|realm connect|churchtrac|church community builder|faithlife|subsplash)\\b', weight: 3 },
      { pattern: '\\b(diocese|diocesan|synod|presbytery|conference minister|bishop|archdiocese|denomination)\\b', weight: 3 },
      { pattern: '\\b(prayer requests?|prayer chain|prayer list|hospital visitation|shut-?ins?|homebound members?)\\b', weight: 3 },
      { pattern: '\\b(advent|lenten|holy week|easter (?:service|sunday|vigil)|christmas eve service|high holidays|rosh hashanah|yom kippur|ramadan|passover seder)\\b', weight: 2 },
      { pattern: '\\b(mission trip|missions? committee|outreach ministry|food pantry|soup kitchen|benevolence fund)\\b', weight: 2 },
      { pattern: '\\b(church (?:office|council|board|staff|calendar|bulletin|directory|membership)|weekly bulletin)\\b', weight: 2 },
      { pattern: '\\b(ordination|ordained|seminary|divinity school|mdiv|clergy (?:renewal|conference|retreat))\\b', weight: 3 },
      { pattern: '\\b(nursery volunteers?|ushers?|greeters?|acolytes?|altar guild|lay leaders?|lay readers?)\\b', weight: 2 }
    ]
  },
  {
    id: 'childcare',
    name: 'Childcare / eldercare provider, paid',
    group: 'care',
    icon: '🧸',
    tagline: 'Enrollments, ratios, licensing visits, daily sheets, shifts, and family messages.',
    pulseName: 'Care Pulse',
    workDescription:
      'The user is paid to care for children or older adults: a daycare or preschool teacher or owner, a nanny or sitter, or a ' +
      'home health or companion-care aide. Work mail includes enrollments and waitlists, family messages and pick-up changes, ' +
      'licensing and ratio rules, subsidy and food-program payments, CPR and background-check renewals, care apps like ' +
      'Brightwheel, agency shift assignments, care plans, and incident or illness notices. Personal mail is their own family and household. ' +
      'Track work by classroom, family (surname only), or client shift; never record medical or behavioral details.',
    urgencyHints: [
      'licensing visits, violations, or ratio problems',
      'CPR, first-aid, or background-check renewals due',
      'same-day pick-up changes or family emergencies',
      'shift assignments or cancellations from the agency',
      'subsidy or food-program paperwork deadlines',
      'incident, illness, or exclusion notices to send'
    ],
    entityNoun: 'family',
    defaultSkills: ['vip', 'appointments', 'bills', 'c-shifts', 'c-credentials', 'c-sessions', 'family'],
    signals: [
      { pattern: '\\b(family child care|home daycare|child ?care (?:center|provider|license)|in-?home daycare|daycare (?:license|licensing|staff|ratios?))\\b', weight: 3 },
      { pattern: '\\b(brightwheel|procare|himama|kindertales|lillio|playground app|tadpoles|kangarootime|smartcare)\\b', weight: 3 },
      { pattern: '\\b(licensing (?:visit|inspection|specialist|renewal|violation|rules)|childcare licensing|licensed capacity|licensing consultant)\\b', weight: 3 },
      { pattern: '\\b(staff-?to-?child ratio|child-?to-?staff ratio|classroom ratios?|out of ratio|ratio coverage)\\b', weight: 3 },
      { pattern: '\\b(cacfp|food program claim|child and adult care food program|subsidy (?:payment|voucher|authorization|reimbursement)|ccdf|childcare subsidy|child care assistance)\\b', weight: 3 },
      { pattern: '\\b(infant room|toddler room|pre-?k classroom|nap ?time schedule|diaper changes? log|daily sheets?|daily reports? for parents)\\b', weight: 2 },
      { pattern: '\\b(late pick-?up fee|authorized pick-?up|pick-?up authorization|drop-?off procedure)\\b', weight: 2 },
      { pattern: '\\b(enrollment (?:packet|forms?|agreement|contract)|new enrollment|waitlist for (?:infant|toddler|preschool)|openings? for (?:infants?|toddlers?))\\b', weight: 2 },
      { pattern: '\\b(cpr and first aid|cpr/first aid|first aid certification|first aid renewal|cpr renewal|safe sleep training|fingerprint(?:ing)? (?:appointment|clearance)|background check clearance)\\b', weight: 2 },
      { pattern: '\\b(home health aide|hha|cna shifts?|caregiver shifts?|companion care|private duty|live-?in caregiver)\\b', weight: 3 },
      { pattern: '\\b(sittercity|urbansitter|care\\.com|nanny (?:share|contract|agreement|pay|tax)|nanny family|au pair|babysitting (?:job|rate)|sitter request)\\b', weight: 3 },
      { pattern: '\\b(incident reports?|ouch reports?|boo-?boo reports?|illness policy|sick child policy|exclusion policy)\\b', weight: 2 },
      { pattern: '\\b(immunization records?|shot records?|physical form|health assessment form|emergency contact forms?|allergy action plan)\\b', weight: 2 },
      { pattern: '\\b(weekly rate|weekly tuition|childcare tuition|tuition for (?:infant|toddler|preschool)|holding fee|registration fee for care)\\b', weight: 2 },
      { pattern: '\\b(curriculum for (?:infants|toddlers|preschool)|creative curriculum|frog street|circle time|sensory bin|lesson themes?)\\b', weight: 2 },
      { pattern: '\\b(qris|quality rating|naeyc|nafcc|cda credential|child development associate|early childhood education|ece credits?)\\b', weight: 3 },
      { pattern: '\\b(client shifts?|aide shifts?|adult day (?:care|program)|hospice aide|overnight care shift|caregiving shifts?)\\b', weight: 2 }
    ]
  }
]
