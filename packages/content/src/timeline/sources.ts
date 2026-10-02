import type { SourceRef } from '@unneet/domain';

/** Reusable, link-checked sources for timeline rules. */
export const SRC = {
  ucasDates: {
    label: 'UCAS: dates and deadlines',
    url: 'https://www.ucas.com/applying/applying-to-university/dates-and-deadlines-for-uni-applications',
  },
  ucasJan: {
    label: 'UCAS: 2027 entry deadline',
    url: 'https://www.ucas.com/events/2027-entry-deadline-for-all-undergraduate-courses-except-those-with-a-15-october-deadline-475546',
  },
  ucasOct: {
    label: 'UCAS: 15 October 2026 deadline',
    url: 'https://www.ucas.com/events/2027-entry-deadline-for-the-universities-of-oxford-and-cambridge-and-most-courses-in-medicine-475536',
  },
  studentFinance: {
    label: 'GOV.UK: apply for student finance',
    url: 'https://www.gov.uk/apply-online-for-student-finance',
  },
  studentFinance2026: {
    label: 'GOV.UK: 2026 to 2027 applications opened 23 March, apply by 15 May',
    url: 'https://www.gov.uk/government/news/full-time-undergraduate-student-finance-applications-now-open-for-2026-to-2027',
  },
  teacherTraining: {
    label: 'GOV.UK: teacher training recruitment cycle dates',
    url: 'https://www.gov.uk/government/publications/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates',
  },
  leaveSchool: {
    label: 'GOV.UK: know when you can leave school',
    url: 'https://www.gov.uk/know-when-you-can-leave-school',
  },
  york: {
    label: 'University of York careers: recruitment time frames',
    url: 'https://www.york.ac.uk/students/work-volunteering-careers/apply-interview/looking-for-work/job-toolkit/time-frames/',
  },
  schoolLeaverApprenticeship: {
    label: 'GC Education & Skills: when to apply for a school-leaver apprenticeship',
    url: 'https://gceducationandskills.ac.uk/news/when-to-apply-for-a-school-leaver-apprenticeship',
  },
  degreeApprenticeships: {
    label: 'School careers update: degree apprenticeships are advertised from October',
    url: 'https://oxtedschool.org/wp-content/uploads/sites/4/2025/10/October-Update-on-Apprenticeship-applications.pdf',
  },
  sixthFormApplying: {
    label: 'Cognito: how to apply for sixth form',
    url: 'https://cognito.org/blog/how-to-apply-for-sixth-form',
  },
  summerInternships: {
    label: 'Intervyo: UK summer internship application timeline (secondary source)',
    url: 'https://www.intervyo.co.uk/guides/summer-internship-applications',
  },
  fastStream: {
    label: 'Civil Service Fast Stream: how to apply',
    url: 'https://www.civil-service-careers.gov.uk/fast-stream/fs-how-to-apply',
  },
  ncs: { label: 'National Careers Service', url: 'https://nationalcareers.service.gov.uk/' },
  jobcentreYouth: {
    label: 'GOV.UK: help to find work for Universal Credit claimants aged 16 to 24',
    url: 'https://www.gov.uk/guidance/help-to-find-work-for-universal-credit-claimants-aged-16-to-24',
  },
  freeCourses: {
    label: 'GOV.UK: free courses for jobs',
    url: 'https://www.gov.uk/guidance/free-courses-for-jobs',
  },
} as const satisfies Record<string, SourceRef>;
