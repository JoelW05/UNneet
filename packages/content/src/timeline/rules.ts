import { type TimelineRule, type TimelineRuleInput, TimelineRuleSchema } from '@unneet/domain';
import { SRC } from './sources';

/**
 * "What should I be doing about my next steps right now?" Each rule is keyed to a stage and a
 * window. `academic` windows are TYPICAL (repeating each Sept–Aug year) and worded that way;
 * `fixed` windows come from calendar.ts and are exact; `relative` windows run from the day
 * someone starts using the site.
 *
 * Writing rules: plain English (reading age ~10), one clear action, honest about uncertainty, no
 * hype and no guilt. If a claim needs a number or month, it must be in `sources`.
 */

const academic = (fm: number, fd: number, tm: number, td: number) =>
  ({ kind: 'academic', from: { month: fm, day: fd }, to: { month: tm, day: td } }) as const;

const RAW: TimelineRuleInput[] = [
  // ───────────────────────────── Year 11 ─────────────────────────────
  {
    id: 'y11-explore',
    stages: ['year-11'],
    title: 'Work out what you might want to do next',
    summary: 'Do the interests quiz and talk to a careers adviser before you pick a route.',
    why: 'At 16 you choose between college, sixth form, an apprenticeship, or work with training. It’s easier when you know what you enjoy first.',
    prepare: [
      'Do the 4-minute interests quiz',
      'Write down 3 jobs that sound interesting',
      'Ask your school careers adviser for a chat',
    ],
    timing: academic(9, 1, 11, 15),
    action: { label: 'Take the interests quiz', path: '/quiz/interests' },
    sources: [SRC.ncs, SRC.leaveSchool],
  },
  {
    id: 'y11-open-evenings',
    stages: ['year-11'],
    title: 'Go to open evenings and taster days',
    summary: 'See colleges and sixth forms in person before you apply.',
    why: 'Open evenings and taster days at most sixth forms and colleges happen in the autumn, before applications open. Going helps you choose and shows you care.',
    prepare: [
      'List the places near you',
      'Check dates on each website',
      'Write 3 questions to ask',
    ],
    timing: academic(9, 15, 11, 30),
    caveat: 'Dates differ for every school and college, so check each website.',
    action: {
      label: 'See courses near you',
      search: { pillar: ['education'], levelMin: 2, levelMax: 3 },
    },
    sources: [SRC.sixthFormApplying],
  },
  {
    id: 'y11-apply-college',
    stages: ['year-11'],
    title: 'Apply for sixth form or college',
    summary: 'Send in your applications. Most close between November and January.',
    why: 'Applications for most sixth forms open in October to November and many close between November and January. Popular courses can fill up, so applying early helps.',
    prepare: [
      'Pick 2 or 3 places',
      'Check the entry grades',
      'Ask a teacher for a reference if needed',
    ],
    urgency: 'high',
    timing: academic(10, 1, 1, 31),
    caveat: 'Each place sets its own deadline. Check before you apply.',
    missedNote:
      'Many colleges still take applications after the deadline if they have space. Contact them today.',
    action: { label: 'Find courses', search: { pillar: ['education'], levelMin: 2, levelMax: 3 } },
    sources: [SRC.sixthFormApplying],
  },
  {
    id: 'y11-apprenticeships',
    stages: ['year-11'],
    title: 'Look for school-leaver apprenticeships',
    summary:
      'Browse apprenticeship vacancies and start applying. Most are advertised in spring and summer.',
    why: 'School-leaver apprenticeship vacancies appear all year, but the busiest time is roughly March to September. Some larger firms recruit from the autumn, and some providers ask you to re-apply in June or July.',
    prepare: ['Write a simple CV', 'Check the entry requirements', 'Have a back-up college place'],
    timing: academic(3, 1, 9, 30),
    action: { label: 'See apprenticeships', search: { type: ['apprenticeship'], levelMax: 3 } },
    sources: [SRC.schoolLeaverApprenticeship],
  },
  {
    id: 'y11-know-the-rules',
    stages: ['year-11'],
    title: 'Know your options at 16',
    summary:
      'You can leave school after Year 11, but in England you must stay in education or training until 18.',
    why: 'You can leave school on the last Friday in June if you’ll be 16 by the end of the summer. Until 18 you must do one of: full-time education, an apprenticeship, or 20+ hours of work or volunteering alongside part-time study or training.',
    prepare: ['Read the three options on GOV.UK', 'Pick one main plan and one back-up'],
    timing: academic(5, 1, 7, 31),
    action: {
      label: 'Read the rules on GOV.UK',
      href: 'https://www.gov.uk/know-when-you-can-leave-school',
    },
    sources: [SRC.leaveSchool],
  },

  // ───────────────────────────── Year 12 ─────────────────────────────
  {
    id: 'y12-compare-routes',
    stages: ['year-12'],
    title: 'Compare university, apprenticeships and work',
    summary: 'Look at all the routes after Year 13, not just university.',
    why: 'Degree apprenticeships, higher apprenticeships and direct work all lead to good careers. Looking early means you can choose the right Year 13 plan.',
    prepare: [
      'Do the interests and values quizzes',
      'Look at 3 different routes',
      'Talk to someone doing each one',
    ],
    timing: academic(9, 1, 12, 15),
    action: { label: 'Explore all routes', path: '/results' },
    sources: [SRC.ncs, SRC.ucasDates],
  },
  {
    id: 'y12-experience',
    stages: ['year-12'],
    title: 'Get some work experience or volunteering',
    summary: 'Spend a few days or weeks in a workplace you’re curious about.',
    why: 'Experience helps you decide what you like, and gives you something real to put on applications for university, apprenticeships and jobs.',
    prepare: [
      'Pick one area you’re curious about',
      'Ask family and teachers who they know',
      'Check if your school can arrange it',
    ],
    timing: academic(1, 1, 6, 30),
    action: {
      label: 'Find volunteering and placements',
      search: { type: ['volunteering', 'internship'] },
    },
    sources: [SRC.ncs],
  },
  {
    id: 'y12-summer-start',
    stages: ['year-12'],
    title: 'Use the summer to get ready for applications',
    summary: 'Visit universities and draft your personal statement, or shortlist apprenticeships.',
    why: 'Applications for university and many degree apprenticeships start early in Year 13. A head start over the summer takes the pressure off.',
    prepare: [
      'Go to open days',
      'Draft your personal statement',
      'Shortlist 5 courses or employers',
    ],
    timing: academic(6, 1, 8, 31),
    action: {
      label: 'See degree apprenticeships',
      search: { type: ['apprenticeship'], levelMin: 6 },
    },
    sources: [SRC.ucasDates, SRC.degreeApprenticeships],
  },

  // ───────────────────────────── Year 13 ─────────────────────────────
  {
    id: 'y13-ucas-oct',
    stages: ['year-13'],
    title: 'UCAS deadline for Oxford, Cambridge, medicine, dentistry and vet courses',
    summary: 'If you’re applying for these, your UCAS application must be in by the deadline.',
    why: 'Applications for Oxford, Cambridge and most medicine, dentistry and veterinary courses close earlier than everything else. Miss it and you can’t get equal consideration.',
    prepare: [
      'Finish your personal statement',
      'Ask your teacher for a reference',
      'Check admissions tests you may need to book',
    ],
    urgency: 'high',
    timing: { kind: 'fixed', eventId: 'ucas-2027-oct', leadDays: 45 },
    action: {
      label: 'Check dates on UCAS',
      href: 'https://www.ucas.com/applying/applying-to-university/dates-and-deadlines-for-uni-applications',
    },
    sources: [SRC.ucasOct],
    missedNote: 'You can still apply to other courses. The main UCAS deadline is in January.',
  },
  {
    id: 'y13-ucas-jan',
    stages: ['year-13'],
    title: 'UCAS main deadline for university applications',
    summary: 'Send your UCAS application in before the equal-consideration deadline.',
    why: 'Universities must treat every application received by the deadline equally. After it they can still accept you, but they don’t have to.',
    prepare: [
      'Pick up to 5 courses',
      'Get your reference in',
      'Check your personal statement one last time',
    ],
    urgency: 'high',
    timing: { kind: 'fixed', eventId: 'ucas-2027-jan', leadDays: 60 },
    action: {
      label: 'Check dates on UCAS',
      href: 'https://www.ucas.com/applying/applying-to-university/dates-and-deadlines-for-uni-applications',
    },
    sources: [SRC.ucasJan],
    missedNote:
      'Don’t panic: universities can still accept later applications if they have places, and Clearing opens in the summer.',
  },
  {
    id: 'y13-degree-apprenticeships',
    stages: ['year-13'],
    title: 'Apply for degree apprenticeships',
    summary:
      'Get a degree, earn a wage and pay no tuition fees. Big employers advertise from October.',
    why: 'Degree apprenticeships are advertised from around October and many employers fill places on a rolling basis, so early applications do better.',
    prepare: ['Check the entry requirements', 'Write a CV', 'Practise online tests'],
    urgency: 'high',
    timing: academic(10, 1, 1, 31),
    caveat: 'Vacancies run all year, but many large employers close in the winter.',
    action: {
      label: 'See degree apprenticeships',
      search: { type: ['apprenticeship'], levelMin: 6 },
    },
    sources: [SRC.degreeApprenticeships],
  },
  {
    id: 'y13-student-finance',
    stages: ['year-13'],
    title: 'Apply for student finance',
    summary:
      'Apply for your tuition fee loan and maintenance support once applications open in spring.',
    why: 'For 2026 to 2027, applications opened on 23 March with a recommended deadline of 15 May. You can apply for up to 9 months after your course starts, but applying early means your money is ready.',
    prepare: [
      'Get a Government Gateway or GOV.UK One Login',
      'Ask a parent about household income',
      'Pick your most likely course',
    ],
    timing: academic(3, 1, 5, 31),
    caveat: 'Exact dates change each year. Check GOV.UK.',
    action: {
      label: 'Apply on GOV.UK',
      href: 'https://www.gov.uk/apply-online-for-student-finance',
    },
    sources: [SRC.studentFinance, SRC.studentFinance2026],
  },
  {
    id: 'y13-apprenticeships',
    stages: ['year-13'],
    title: 'Look for apprenticeships as a back-up or main plan',
    summary: 'School-leaver apprenticeships are busiest from spring to September.',
    why: 'Vacancies for school leavers are advertised all year, with the busiest period roughly March to September. A back-up plan means results day is less stressful.',
    prepare: ['Update your CV', 'Check entry requirements', 'Sign up to apprenticeship alerts'],
    timing: academic(3, 1, 9, 30),
    action: { label: 'See apprenticeships', search: { type: ['apprenticeship'], levelMax: 4 } },
    sources: [SRC.schoolLeaverApprenticeship],
  },
  {
    id: 'y13-results-plan',
    stages: ['year-13'],
    title: 'Plan for results day, whatever the grades',
    summary: 'Know your options for Clearing, apprenticeships and re-sits before results day.',
    why: 'Results day is easier when you’ve already looked at the options. UCAS Clearing, apprenticeships and re-takes are all real routes.',
    prepare: [
      'Save UCAS and apprenticeship links',
      'Know who to call at school or college',
      'Have a family chat about plan B',
    ],
    timing: academic(7, 1, 8, 31),
    action: { label: 'See your options', path: '/results' },
    sources: [SRC.ucasDates, SRC.ncs],
  },

  // ───────────────────────────── College (vocational) ─────────────────────────────
  {
    id: 'college-next-step',
    stages: ['college'],
    title: 'Decide your next step before your course ends',
    summary: 'Look at apprenticeships, higher-level courses and jobs while you’re still studying.',
    why: 'Employers and providers recruit months ahead. Starting to look early gives you time to apply and a back-up.',
    prepare: ['Talk to your tutor', 'Shortlist 3 options', 'Update your CV'],
    timing: academic(10, 1, 2, 28),
    action: { label: 'See apprenticeships', search: { type: ['apprenticeship'] } },
    sources: [SRC.schoolLeaverApprenticeship, SRC.ncs],
  },
  {
    id: 'college-experience',
    stages: ['college'],
    title: 'Get work experience in your field',
    summary: 'Arrange a placement, volunteering or part-time work linked to your course.',
    why: 'Experience in your field makes applications stronger and helps you find out whether you really like the work.',
    prepare: [
      'Ask your tutor for contacts',
      'Look at local employers',
      'Write a short message introducing yourself',
    ],
    timing: academic(1, 1, 6, 30),
    action: {
      label: 'Find placements and volunteering',
      search: { type: ['volunteering', 'internship', 'traineeship'] },
    },
    sources: [SRC.ncs],
  },
  {
    id: 'college-apprenticeship-season',
    stages: ['college'],
    title: 'Apprenticeship vacancies are at their busiest',
    summary: 'Browse and apply for apprenticeships that start in the autumn.',
    why: 'The busiest period for apprenticeship vacancies is roughly March to September, with many starting in September.',
    prepare: ['Update your CV', 'Pick the sectors you like', 'Set up vacancy alerts'],
    timing: academic(3, 1, 9, 30),
    action: { label: 'See apprenticeships', search: { type: ['apprenticeship'] } },
    sources: [SRC.schoolLeaverApprenticeship],
  },

  // ───────────────────────────── Apprentice ─────────────────────────────
  {
    id: 'apprentice-progress',
    stages: ['apprentice'],
    title: 'Talk to your employer about what comes next',
    summary: 'Ask about the next level, a permanent role or a different team.',
    why: 'Planning ahead makes the end of your apprenticeship smoother. Many apprentices move on to the next level or a permanent role.',
    prepare: [
      'Write down what you’ve learned',
      'Ask your manager for a chat',
      'Look at higher-level options',
    ],
    timing: academic(1, 1, 3, 31),
    action: {
      label: 'See higher-level apprenticeships',
      search: { type: ['apprenticeship'], levelMin: 4 },
    },
    sources: [SRC.ncs],
  },

  // ───────────────────────────── University year 1 ─────────────────────────────
  {
    id: 'uni1-spring-weeks',
    stages: ['uni-year-1'],
    title: 'Look for spring weeks and insight programmes',
    summary: 'Short programmes for first-years at big employers. Many open in the autumn.',
    why: 'Spring and insight weeks are aimed at first-year students. Most employers assess applications as they arrive and fill places before the deadline, so applying early matters.',
    prepare: ['Update your CV', 'Pick 3 industries', 'Check your university careers service'],
    timing: academic(9, 15, 3, 31),
    caveat: 'Opening and closing dates differ for each employer.',
    action: { label: 'See internships and insight programmes', search: { type: ['internship'] } },
    sources: [SRC.summerInternships, SRC.york],
  },
  {
    id: 'uni1-summer-experience',
    stages: ['uni-year-1'],
    title: 'Line up summer work or volunteering',
    summary:
      'Find something useful to do over the summer: a job, volunteering or a short placement.',
    why: 'University internship boards start advertising summer positions from around April. Any experience helps your CV and your confidence.',
    prepare: [
      'Check your university internship board',
      'Ask societies about volunteering',
      'Update your CV',
    ],
    timing: academic(4, 1, 6, 30),
    action: {
      label: 'Find summer experience',
      search: { type: ['internship', 'volunteering', 'job'] },
    },
    sources: [SRC.york],
  },

  {
    id: 'uni1-careers-service',
    stages: ['uni-year-1'],
    title: 'Visit your university careers service',
    summary: 'Get your CV checked and find out what help and employer events your university runs.',
    why: 'Careers services run CV checks, employer fairs and internship boards, and many of the best events happen in the autumn. It’s free and it’s there for you.',
    prepare: [
      'Find your careers service online',
      'Book a CV check',
      'Sign up for employer event emails',
    ],
    timing: academic(9, 15, 12, 15),
    action: {
      label: 'See what experience is out there',
      search: { type: ['internship', 'volunteering'] },
    },
    sources: [SRC.york],
  },
  {
    id: 'uni1-ready-for-internship-season',
    stages: ['uni-year-1'],
    title: 'Get ready for internship season in September',
    summary: 'Next year is when most big internship applications open. Use the summer to prepare.',
    why: 'Large employers open summer-internship applications from July to September and fill places as they arrive, so being ready on day one helps. Over the summer you can update your CV and shortlist employers.',
    prepare: [
      'Update your CV',
      'List 5 employers you like',
      'Note when their applications usually open',
    ],
    timing: academic(4, 1, 8, 31),
    caveat: 'Opening dates differ for each employer.',
    action: { label: 'See what internships look like', search: { type: ['internship'] } },
    sources: [SRC.summerInternships, SRC.york],
  },

  // ───────────────────────────── University year 2 ─────────────────────────────
  {
    id: 'uni2-summer-internships',
    stages: ['uni-year-2'],
    title: 'Apply for summer internships',
    summary: 'The big employers recruit next summer’s interns from about now. Apply early.',
    why: 'Large employers open summer internship applications roughly 9 to 10 months ahead and fill places as they go. Big professional-services firms often close by December or January. Many interns are offered graduate jobs.',
    prepare: [
      'Update your CV',
      'Book a CV check with your careers service',
      'Practise online tests',
      'List the employers you want and their opening dates',
    ],
    urgency: 'high',
    timing: academic(9, 1, 12, 15),
    caveat: 'Opening and closing dates differ for each employer. Check each listing.',
    missedNote: 'Many smaller employers recruit later, from January to spring. Keep looking.',
    action: { label: 'See summer internships', search: { type: ['internship'] } },
    sources: [SRC.summerInternships, SRC.york],
  },
  {
    id: 'uni2-placement-year',
    stages: ['uni-year-2'],
    title: 'Apply for a placement year (if your course has one)',
    summary:
      'If your degree offers a year in industry, applications run alongside graduate-style recruitment.',
    why: 'Placement recruitment mirrors graduate-scheme timing: lots of applications in the autumn, with some employers closing around December or January.',
    prepare: [
      'Ask your department about placements',
      'Update your CV',
      'Check your careers service for deadlines',
    ],
    timing: academic(10, 1, 2, 28),
    action: { label: 'See placements', search: { type: ['internship'] } },
    sources: [SRC.york],
  },
  {
    id: 'uni2-plan-final-year',
    stages: ['uni-year-2'],
    title: 'Get ready for final-year applications',
    summary: 'Graduate schemes open in September of your final year. Prepare over the summer.',
    why: 'The peak time to apply for graduate schemes is September to December, and many employers recruit on a rolling basis, so being ready on day one helps.',
    prepare: ['Decide 2 or 3 career areas', 'Update your CV', 'Get experience if you can'],
    timing: academic(4, 1, 8, 31),
    action: { label: 'Explore career areas', path: '/results' },
    sources: [SRC.york],
  },

  // ───────────────────────────── University final year ─────────────────────────────
  {
    id: 'uni3-graduate-schemes',
    stages: ['uni-final-year'],
    title: 'Apply for graduate schemes',
    summary:
      'The peak time to apply is September to December. Many employers fill places as they go.',
    why: 'Most graduate schemes open in September and close in December or January, but employers often review applications on a rolling basis and close when they’re happy with the pool.',
    prepare: [
      'Update your CV',
      'Pick 5 to 8 employers',
      'Practise online tests',
      'Book your careers service',
    ],
    urgency: 'high',
    timing: academic(9, 1, 12, 31),
    caveat: 'Dates differ for each employer. Apply early rather than at the deadline.',
    missedNote:
      'Some schemes re-open in May and June if they have places left. Direct-entry graduate jobs are advertised all year.',
    action: { label: 'See graduate jobs', search: { type: ['job'], levelMin: 6 } },
    sources: [SRC.york],
  },
  {
    id: 'uni3-fast-stream',
    stages: ['uni-final-year', 'graduate'],
    title: 'Civil Service Fast Stream applications',
    summary:
      'The Fast Stream opens once a year. Last year’s window ran from 9 October to 6 November.',
    why: 'The Civil Service Fast Stream is one of the earliest graduate schemes to close. Applications opened on 9 October and closed on 6 November in 2025.',
    prepare: ['Read the scheme descriptions', 'Practise the online tests', 'Check eligibility'],
    timing: academic(10, 1, 11, 30),
    caveat:
      '2026 dates not confirmed when this was written. Check the Civil Service Fast Stream site.',
    action: {
      label: 'Check the Fast Stream',
      href: 'https://www.civil-service-careers.gov.uk/fast-stream/fs-how-to-apply',
    },
    sources: [SRC.fastStream, SRC.york],
  },
  {
    id: 'uni3-assessments',
    stages: ['uni-final-year'],
    title: 'Prepare for tests, interviews and assessment centres',
    summary:
      'After applications close, employers use tests and interviews. Practise before they arrive.',
    why: 'Typically online tests and first interviews run December to February, and assessment centres and offers from February to April.',
    prepare: [
      'Practise numerical and verbal tests',
      'Prepare 5 examples from your experience',
      'Practise a video interview',
    ],
    timing: academic(12, 1, 4, 30),
    action: { label: 'Explore your next steps', path: '/timeline' },
    sources: [SRC.york],
  },
  {
    id: 'uni3-schemes-reopen',
    stages: ['uni-final-year', 'graduate'],
    title: 'Schemes with spare places reopen',
    summary: 'Some employers reopen graduate schemes in May and June if they haven’t filled them.',
    why: 'Missing the autumn peak isn’t the end. Some schemes reopen in May and June, and graduate jobs are advertised all year with peaks in May to July and September to November.',
    prepare: ['Check employers you liked', 'Update your CV', 'Set up job alerts'],
    timing: academic(5, 1, 7, 31),
    action: { label: 'See graduate jobs', search: { type: ['job'], levelMin: 6 } },
    sources: [SRC.york],
  },
  {
    id: 'uni3-teacher-training',
    stages: ['uni-final-year', 'graduate', 'working', 'between-things'],
    sectors: ['education-early-years'],
    title: 'Apply for teacher training: applications are open',
    summary:
      'Applications for teacher training courses that start in 2027 open on 6 October 2026. Apply early.',
    why: 'You can start applying for the 2026 to 2027 recruitment cycle on 6 October 2026. Popular courses can fill up, so applying earlier gives you more choice.',
    prepare: [
      'Check the subjects and entry requirements',
      'Get school experience if you can',
      'Ask for references',
    ],
    urgency: 'high',
    timing: {
      kind: 'fixed',
      eventId: 'teacher-training-2026-27',
      leadDays: 45,
      earlyWindowDays: 90,
    },
    action: { label: 'Get into teaching', href: 'https://getintoteaching.education.gov.uk/' },
    sources: [SRC.teacherTraining],
  },

  // ───────────────────────────── Graduate ─────────────────────────────
  {
    id: 'grad-autumn-peak',
    stages: ['graduate'],
    title: 'Autumn is a busy time for graduate jobs',
    summary:
      'Direct-entry graduate jobs and schemes both advertise heavily from September to November.',
    why: 'Graduate jobs are advertised all year, with peaks from May to July and from September to November.',
    prepare: [
      'Update your CV',
      'Set up job alerts',
      'Ask your university careers service (many help for years after you graduate)',
    ],
    timing: academic(9, 1, 11, 30),
    action: { label: 'See graduate jobs', search: { type: ['job'], levelMin: 6 } },
    sources: [SRC.york],
  },

  // ───────────────────────────── Working ─────────────────────────────
  {
    id: 'working-free-training',
    stages: ['working'],
    title: 'Check what free training you could get',
    summary:
      'You may be able to get a free Level 3 qualification, or another course, while working.',
    why: 'Free courses for jobs and other funded training can open up better-paid roles. It’s worth checking before you pay for anything.',
    prepare: [
      'Check eligibility on GOV.UK',
      'Pick a subject that leads to a better job',
      'Ask your employer about study time',
    ],
    timing: academic(1, 1, 3, 31),
    action: { label: 'See free courses', search: { type: ['course'], free: true } },
    sources: [SRC.freeCourses],
  },

  // ───────────────────────────── Between things: first 30 days ─────────────────────────────
  {
    id: 'bt-start-here',
    stages: ['between-things'],
    title: 'Start here: do the quick quiz and set your location',
    summary: 'Take 4 minutes to tell us what you enjoy, so we can show you things that fit.',
    why: 'Starting with what you enjoy and where you can get to makes everything after this easier. There’s no pressure and no right answers.',
    prepare: ['Find 4 quiet minutes', 'Know your postcode', 'Don’t overthink the answers'],
    timing: { kind: 'relative', fromDay: 0, toDay: 7 },
    action: { label: 'Take the quiz', path: '/quiz/interests' },
    sources: [SRC.ncs],
  },
  {
    id: 'bt-talk-to-adviser',
    stages: ['between-things'],
    title: 'Book a free chat with a careers adviser',
    summary:
      'The National Careers Service gives free, confidential advice. You can talk or chat online.',
    why: 'A trained adviser can help you make a plan, fix your CV and tell you about help you didn’t know existed.',
    prepare: ['Write down your questions', 'Have your CV ready if you have one'],
    timing: { kind: 'relative', fromDay: 0, toDay: 14 },
    action: { label: 'National Careers Service', href: 'https://nationalcareers.service.gov.uk/' },
    sources: [SRC.ncs],
  },
  {
    id: 'bt-jobcentre-help',
    stages: ['between-things'],
    title: 'Find out what help is available at your Jobcentre',
    summary: 'If you’re 16 to 24 and claim Universal Credit, there’s extra help to find work.',
    why: 'GOV.UK lists the support available to Universal Credit claimants aged 16 to 24, including help finding work and training.',
    prepare: ['Read the GOV.UK page', 'Ask your work coach about it'],
    timing: { kind: 'relative', fromDay: 7, toDay: 21 },
    action: {
      label: 'Read about the help',
      href: 'https://www.gov.uk/guidance/help-to-find-work-for-universal-credit-claimants-aged-16-to-24',
    },
    sources: [SRC.jobcentreYouth],
  },
  {
    id: 'bt-look-after-yourself',
    stages: ['between-things'],
    title: 'Look after yourself',
    summary: 'Free, confidential support is available any time if things feel heavy.',
    why: 'Poor mental health is the biggest barrier to finding work for many young people. Getting support is a strong first step, not a weakness.',
    prepare: ['Save one support number or website', 'Tell one person how you’re feeling'],
    timing: { kind: 'relative', fromDay: 7, toDay: 30 },
    action: { label: 'See free support', path: '/support' },
    sources: [SRC.ncs],
  },
  {
    id: 'bt-try-free-learning',
    stages: ['between-things'],
    title: 'Try a free short course',
    summary:
      'A free course is a low-risk way to build skills and confidence, and gives you something to add to your CV.',
    why: 'Learning something small, for free, shows employers you’re keen and helps you find out what you like.',
    prepare: [
      'Pick one subject you’re curious about',
      'Choose something online that fits your day',
    ],
    timing: { kind: 'relative', fromDay: 14, toDay: 35 },
    action: { label: 'See free courses', search: { type: ['course'], free: true, levelMax: 2 } },
    sources: [SRC.freeCourses],
  },
  {
    id: 'bt-first-applications',
    stages: ['between-things'],
    title: 'Apply for your first three opportunities',
    summary: 'Pick three things that look doable and apply. They don’t have to be perfect.',
    why: 'Applying is a skill that gets easier with practice. Three applications is a small, achievable goal.',
    prepare: ['Write or update a simple CV', 'Pick 3 listings', 'Ask someone to check them'],
    timing: { kind: 'relative', fromDay: 14, toDay: 28 },
    action: { label: 'See what fits you', path: '/results' },
    sources: [SRC.ncs],
  },
  {
    id: 'bt-check-in',
    stages: ['between-things'],
    title: 'Check in on how it’s going',
    summary: 'Look at what you’ve done, what worked and what to try next.',
    why: 'Looking back helps you notice progress. Small steps count, and the plan can change.',
    prepare: ['List what you’ve done', 'Pick one thing to do next week'],
    timing: { kind: 'relative', fromDay: 28, toDay: 35 },
    action: { label: 'Review your profile', path: '/profile' },
    sources: [SRC.ncs],
  },
];

/** Validated at module load, so a malformed rule fails fast in dev, tests and CI. */
export const TIMELINE_RULES: readonly TimelineRule[] = RAW.map((r) => TimelineRuleSchema.parse(r));
