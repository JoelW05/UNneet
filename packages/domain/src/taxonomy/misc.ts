import { z } from 'zod';

export const WORK_MODES = ['onsite', 'hybrid', 'remote', 'nationwide'] as const;
export const WorkModeSchema = z.enum(WORK_MODES);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const WORK_MODE_LABEL: Readonly<Record<WorkMode, string>> = {
  onsite: 'In person',
  hybrid: 'Part at home',
  remote: 'Online / from home',
  nationwide: 'Anywhere in the UK',
};

export const PAY_UNITS = ['hour', 'day', 'week', 'month', 'year'] as const;
export const PayUnitSchema = z.enum(PAY_UNITS);
export type PayUnit = z.infer<typeof PayUnitSchema>;

export const COST_KINDS = ['free', 'funded', 'paid', 'unknown'] as const;
export const CostKindSchema = z.enum(COST_KINDS);
export type CostKind = z.infer<typeof CostKindSchema>;

export const COST_KIND_LABEL: Readonly<Record<CostKind, string>> = {
  free: 'Free',
  funded: 'Free if you qualify',
  paid: 'Paid by you',
  unknown: 'Cost not stated',
};

export const COUNTRIES = ['england', 'scotland', 'wales', 'northern-ireland', 'uk'] as const;
export const CountrySchema = z.enum(COUNTRIES);
export type Country = z.infer<typeof CountrySchema>;

/** ONS ITL1 regions of England plus the other UK nations. */
export const REGIONS = [
  'north-east',
  'north-west',
  'yorkshire-and-the-humber',
  'east-midlands',
  'west-midlands',
  'east-of-england',
  'london',
  'south-east',
  'south-west',
  'wales',
  'scotland',
  'northern-ireland',
] as const;
export const RegionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof RegionSchema>;

export const REGION_LABEL: Readonly<Record<Region, string>> = {
  'north-east': 'North East',
  'north-west': 'North West',
  'yorkshire-and-the-humber': 'Yorkshire and the Humber',
  'east-midlands': 'East Midlands',
  'west-midlands': 'West Midlands',
  'east-of-england': 'East of England',
  london: 'London',
  'south-east': 'South East',
  'south-west': 'South West',
  wales: 'Wales',
  scotland: 'Scotland',
  'northern-ireland': 'Northern Ireland',
};

/** Map a postcodes.io `region` / `country` string onto our Region enum. */
export function regionFromPostcodesIo(
  region: string | null | undefined,
  country: string | null | undefined,
): Region | null {
  const r = (region ?? '').trim().toLowerCase();
  const c = (country ?? '').trim().toLowerCase();
  if (c === 'wales') return 'wales';
  if (c === 'scotland') return 'scotland';
  if (c === 'northern ireland') return 'northern-ireland';
  const map: Record<string, Region> = {
    'north east': 'north-east',
    'north west': 'north-west',
    'yorkshire and the humber': 'yorkshire-and-the-humber',
    'east midlands': 'east-midlands',
    'west midlands': 'west-midlands',
    'east of england': 'east-of-england',
    eastern: 'east-of-england',
    london: 'london',
    'south east': 'south-east',
    'south west': 'south-west',
  };
  return map[r] ?? null;
}

/** What someone is mainly looking for right now. Drives how matching weights things. */
export const GOALS = [
  'earn-now',
  'earn-and-learn',
  'learn-first',
  'experience',
  'explore',
] as const;
export const GoalSchema = z.enum(GOALS);
export type Goal = z.infer<typeof GoalSchema>;

export const GOAL_INFO: Readonly<Record<Goal, { label: string; help: string }>> = {
  'earn-now': { label: 'Earn money soon', help: 'I need a paid job as soon as possible.' },
  'earn-and-learn': {
    label: 'Earn while I learn',
    help: 'I want a wage and training together, like an apprenticeship.',
  },
  'learn-first': {
    label: 'Study or train first',
    help: 'I want a course or qualification before I work.',
  },
  experience: {
    label: 'Get some experience',
    help: 'I want to try work out: volunteering, placements, short roles.',
  },
  explore: {
    label: 'I’m not sure yet',
    help: 'Show me what’s out there and help me work out what I like.',
  },
};

export const AGE_BANDS = ['16-17', '18-21', '22-24', '25+'] as const;
export const AgeBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof AgeBandSchema>;

/** Representative age for eligibility checks when only a band is known. */
export const AGE_BAND_REPRESENTATIVE: Readonly<Record<AgeBand, number>> = {
  '16-17': 16,
  '18-21': 19,
  '22-24': 23,
  '25+': 25,
};
