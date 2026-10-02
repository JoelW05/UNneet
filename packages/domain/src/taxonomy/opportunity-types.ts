import { z } from 'zod';

/**
 * Everything on the platform is an "opportunity". The `pillar` mirrors the E-E-T of NEET so
 * the product can say, in one glance, whether something is about work, study or training.
 */
export const OPPORTUNITY_TYPES = [
  'job',
  'apprenticeship',
  'traineeship',
  'internship',
  'course',
  'bootcamp',
  't-level',
  'degree',
  'volunteering',
  'programme',
  'support',
] as const;

export const OpportunityTypeSchema = z.enum(OPPORTUNITY_TYPES);
export type OpportunityType = z.infer<typeof OpportunityTypeSchema>;

export const PILLARS = ['employment', 'education', 'training', 'support'] as const;
export const PillarSchema = z.enum(PILLARS);
export type Pillar = z.infer<typeof PillarSchema>;

export interface OpportunityTypeInfo {
  type: OpportunityType;
  pillar: Pillar;
  /** Singular label, e.g. "Apprenticeship". */
  label: string;
  /** Plural label for filters and headings. */
  plural: string;
  /** One plain-English line for tooltips/help text. */
  help: string;
  /** Does the person normally earn money doing this? */
  paid: boolean;
}

export const OPPORTUNITY_TYPE_INFO: Readonly<Record<OpportunityType, OpportunityTypeInfo>> = {
  job: {
    type: 'job',
    pillar: 'employment',
    label: 'Job',
    plural: 'Jobs',
    help: 'A paid role with an employer.',
    paid: true,
  },
  apprenticeship: {
    type: 'apprenticeship',
    pillar: 'training',
    label: 'Apprenticeship',
    plural: 'Apprenticeships',
    help: 'A real job where you earn a wage and train at the same time. Training is free to you.',
    paid: true,
  },
  traineeship: {
    type: 'traineeship',
    pillar: 'training',
    label: 'Traineeship',
    plural: 'Traineeships',
    help: 'A short, free course with a work placement that gets you ready for a job or apprenticeship.',
    paid: false,
  },
  internship: {
    type: 'internship',
    pillar: 'employment',
    label: 'Internship',
    plural: 'Internships',
    help: 'A short work placement to gain experience.',
    paid: true,
  },
  course: {
    type: 'course',
    pillar: 'education',
    label: 'Course',
    plural: 'Courses',
    help: 'A taught qualification or short course at a college, provider or online.',
    paid: false,
  },
  bootcamp: {
    type: 'bootcamp',
    pillar: 'training',
    label: 'Bootcamp',
    plural: 'Bootcamps',
    help: 'Fast, job-focused training (up to 16 weeks), often free if you qualify.',
    paid: false,
  },
  't-level': {
    type: 't-level',
    pillar: 'education',
    label: 'T Level',
    plural: 'T Levels',
    help: 'A 2-year technical course, equal to 3 A levels, with a long industry placement.',
    paid: false,
  },
  degree: {
    type: 'degree',
    pillar: 'education',
    label: 'Degree',
    plural: 'Degrees',
    help: 'A university or college degree or foundation degree.',
    paid: false,
  },
  volunteering: {
    type: 'volunteering',
    pillar: 'employment',
    label: 'Volunteering',
    plural: 'Volunteering',
    help: 'Unpaid work for a good cause. Great for experience, references and confidence.',
    paid: false,
  },
  programme: {
    type: 'programme',
    pillar: 'support',
    label: 'Support programme',
    plural: 'Support programmes',
    help: 'Free schemes that help you get ready for work or study: mentoring, coaching, courses.',
    paid: false,
  },
  support: {
    type: 'support',
    pillar: 'support',
    label: 'Advice & support',
    plural: 'Advice & support',
    help: 'Free, confidential advice and wellbeing support.',
    paid: false,
  },
};

export function pillarOf(type: OpportunityType): Pillar {
  return OPPORTUNITY_TYPE_INFO[type].pillar;
}

export const PILLAR_INFO: Readonly<Record<Pillar, { label: string; help: string }>> = {
  employment: { label: 'Work', help: 'Jobs, internships and volunteering' },
  education: { label: 'Study', help: 'Courses, T Levels and degrees' },
  training: { label: 'Train', help: 'Apprenticeships, traineeships and bootcamps' },
  support: { label: 'Get support', help: 'Free schemes, advice and wellbeing help' },
};

export function typesInPillar(pillar: Pillar): OpportunityType[] {
  return OPPORTUNITY_TYPES.filter((t) => OPPORTUNITY_TYPE_INFO[t].pillar === pillar);
}
