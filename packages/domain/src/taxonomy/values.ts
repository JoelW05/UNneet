import { z } from 'zod';
import type { OpportunityType } from './opportunity-types';
import type { SectorSlug } from './sectors';

/**
 * "What matters to you at work?" Inspired by the O*NET Work Importance Locator idea, but a
 * custom, much shorter instrument: pick your top three.
 */
export const VALUE_KEYS = [
  'good-pay',
  'job-security',
  'flexibility',
  'helping',
  'learning',
  'progression',
  'creativity',
  'teamwork',
  'independence',
  'active',
] as const;

export const ValueKeySchema = z.enum(VALUE_KEYS);
export type ValueKey = z.infer<typeof ValueKeySchema>;

export interface WorkValue {
  key: ValueKey;
  label: string;
  description: string;
}

export const WORK_VALUES: readonly WorkValue[] = [
  { key: 'good-pay', label: 'Good pay', description: 'Earning as much as I can' },
  { key: 'job-security', label: 'Security', description: 'A steady job I can rely on' },
  { key: 'flexibility', label: 'Flexibility', description: 'Flexible hours or working from home' },
  { key: 'helping', label: 'Helping people', description: 'Making a difference to others' },
  { key: 'learning', label: 'Learning', description: 'Picking up new skills all the time' },
  { key: 'progression', label: 'Moving up', description: 'A clear path to a better role' },
  { key: 'creativity', label: 'Being creative', description: 'Making and designing things' },
  { key: 'teamwork', label: 'Teamwork', description: 'Working closely with other people' },
  { key: 'independence', label: 'Independence', description: 'Making my own decisions' },
  { key: 'active', label: 'Active or outdoors', description: 'Not stuck at a desk all day' },
];

export interface ValueAffinity {
  sectors?: Partial<Record<SectorSlug, number>>;
  types?: Partial<Record<OpportunityType, number>>;
  /** Prefers opportunities that pay (annual FTE) at or above this. */
  highPay?: boolean;
  /** Prefers remote / hybrid / part-time friendly work. */
  flexibleWork?: boolean;
}

/** How each value maps onto opportunity attributes (0–1 affinity). Used by the matching engine. */
export const VALUE_AFFINITY: Readonly<Record<ValueKey, ValueAffinity>> = {
  'good-pay': {
    highPay: true,
    sectors: {
      'legal-finance-accounting': 0.8,
      digital: 0.8,
      'construction-built-environment': 0.7,
    },
  },
  'job-security': {
    sectors: {
      'health-science': 0.8,
      'care-services': 0.7,
      'education-early-years': 0.7,
      'protective-services': 0.8,
    },
    types: { apprenticeship: 0.7, job: 0.5 },
  },
  flexibility: { flexibleWork: true, sectors: { digital: 0.7, 'creative-design': 0.6 } },
  helping: {
    sectors: {
      'care-services': 1,
      'health-science': 0.9,
      'education-early-years': 0.9,
      'protective-services': 0.6,
    },
    types: { volunteering: 0.7 },
  },
  learning: {
    types: { apprenticeship: 0.8, course: 0.7, bootcamp: 0.7, traineeship: 0.7, 't-level': 0.7 },
  },
  progression: {
    types: { apprenticeship: 1, degree: 0.6, 't-level': 0.6 },
    sectors: { 'business-administration': 0.5, 'engineering-manufacturing': 0.6 },
  },
  creativity: { sectors: { 'creative-design': 1, digital: 0.5, 'hair-beauty': 0.6 } },
  teamwork: {
    sectors: { 'catering-hospitality': 0.7, 'protective-services': 0.7, 'care-services': 0.6 },
  },
  independence: {
    sectors: {
      'transport-logistics': 0.7,
      'agriculture-environment-animal-care': 0.6,
      'construction-built-environment': 0.6,
      'hair-beauty': 0.6,
    },
  },
  active: {
    sectors: {
      'agriculture-environment-animal-care': 1,
      'construction-built-environment': 0.9,
      'transport-logistics': 0.7,
      'protective-services': 0.7,
      'catering-hospitality': 0.5,
    },
  },
};
