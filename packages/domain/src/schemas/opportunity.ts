import { z } from 'zod';
import { LevelSchema } from '../taxonomy/levels';
import {
  CostKindSchema,
  CountrySchema,
  PayUnitSchema,
  RegionSchema,
  WorkModeSchema,
} from '../taxonomy/misc';
import { OpportunityTypeSchema, PillarSchema } from '../taxonomy/opportunity-types';
import { SectorSlugSchema } from '../taxonomy/sectors';
import { RequirementsSchema } from './requirements';

/** Outbound links must be https. We never fetch them server-side, only render them as <a>. */
export const HttpsUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .meta({ description: 'An https URL' });

export const PaySchema = z.object({
  min: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable(),
  unit: PayUnitSchema,
  isEstimate: z.boolean().default(false),
  note: z.string().max(300).nullable().optional(),
});

export const CostSchema = z.object({
  kind: CostKindSchema,
  amount: z.number().nonnegative().nullable(),
  note: z.string().max(300).nullable().optional(),
});

export const LocationSchema = z.object({
  /** Human label, e.g. "Manchester" or "Online". */
  label: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
  postcode: z.string().max(10).nullable().optional(),
  region: RegionSchema.nullable().optional(),
  country: CountrySchema.nullable().optional(),
  workMode: WorkModeSchema.default('onsite'),
});

export const OrganisationSchema = z.object({
  name: z.string().min(1).max(200),
  url: HttpsUrlSchema.nullable().optional(),
});

export const SourceSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  licence: z.string(),
  attribution: z.string(),
  attributionUrl: z.string().nullable(),
  isSample: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

/** Tags are a small controlled vocabulary the UI renders as badges. */
export const OPPORTUNITY_TAGS = [
  'no-experience',
  'no-qualifications',
  'disability-confident',
  'guaranteed-interview',
  'part-time',
  'flexible',
  'evening-weekend',
  'online',
  'accredited',
  'government-funded',
  'youth-guarantee',
] as const;
export const OpportunityTagSchema = z.enum(OPPORTUNITY_TAGS);
export type OpportunityTag = z.infer<typeof OpportunityTagSchema>;

export const TAG_LABEL: Readonly<Record<OpportunityTag, string>> = {
  'no-experience': 'No experience needed',
  'no-qualifications': 'No qualifications needed',
  'disability-confident': 'Disability Confident',
  'guaranteed-interview': 'Guaranteed interview',
  'part-time': 'Part-time',
  flexible: 'Flexible hours',
  'evening-weekend': 'Evenings / weekends',
  online: 'Online',
  accredited: 'Accredited qualification',
  'government-funded': 'Government funded',
  'youth-guarantee': 'Youth Guarantee',
};

/**
 * What an ingest adapter or partner submits. Deliberately small and strict: adapters do the
 * provider-specific mapping, the pipeline does classification, slugging and dedupe.
 */
export const OpportunityInputSchema = z
  .object({
    externalId: z.string().min(1).max(200),
    type: OpportunityTypeSchema,
    title: z.string().min(3).max(200),
    /** Plain text (HTML already stripped). */
    description: z.string().min(1).max(20_000),
    organisation: OrganisationSchema,
    applyUrl: HttpsUrlSchema,
    sector: SectorSlugSchema.nullable().optional(),
    /** Level of the course/apprenticeship, or typical entry level of a job. */
    level: LevelSchema.nullable().optional(),
    minEntryLevel: LevelSchema.nullable().optional(),
    location: LocationSchema,
    pay: PaySchema.nullable().optional(),
    cost: CostSchema.optional(),
    duration: z.string().max(120).nullable().optional(),
    postedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    closesAt: z.iso.datetime({ offset: true }).nullable().optional(),
    minAge: z.number().int().min(0).max(120).nullable().optional(),
    maxAge: z.number().int().min(0).max(120).nullable().optional(),
    skills: z.array(z.string().min(1).max(80)).max(40).optional(),
    tags: z.array(OpportunityTagSchema).max(12).optional(),
    experienceRequired: z.boolean().nullable().optional(),
  })
  .refine((v) => v.minAge == null || v.maxAge == null || v.minAge <= v.maxAge, {
    message: 'minAge must be <= maxAge',
    path: ['minAge'],
  });
export type OpportunityInput = z.infer<typeof OpportunityInputSchema>;

export const SkillRefSchema = z.object({ id: z.string(), label: z.string() });
export type SkillRef = z.infer<typeof SkillRefSchema>;

/** Fields shown on a result card. */
export const OpportunityCardSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  type: OpportunityTypeSchema,
  pillar: PillarSchema,
  title: z.string(),
  summary: z.string(),
  organisation: OrganisationSchema,
  sector: SectorSlugSchema.nullable(),
  level: LevelSchema.nullable(),
  minEntryLevel: LevelSchema.nullable(),
  location: LocationSchema,
  pay: PaySchema.nullable(),
  cost: CostSchema,
  duration: z.string().nullable(),
  postedAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  startsAt: z.string().nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  tags: z.array(OpportunityTagSchema),
  skills: z.array(SkillRefSchema),
  experienceRequired: z.boolean().nullable(),
  /** What the advert asks of an applicant, read from its text. Null = not read yet. */
  requirements: RequirementsSchema.nullable().optional(),
  /** Miles from the searched location, when a location search was used. */
  distanceMiles: z.number().nullable().optional(),
  /**
   * Set only for federated results we don't store (storage policy `cache`/`live`): there is no
   * detail page on our site, so the card links straight out to the provider.
   */
  externalUrl: HttpsUrlSchema.nullable().optional(),
  source: SourceSchema,
});
export type OpportunityCard = z.infer<typeof OpportunityCardSchema>;

export const OpportunityDetailSchema = OpportunityCardSchema.extend({
  description: z.string(),
  applyUrl: HttpsUrlSchema,
  updatedAt: z.string(),
  /** `expired` = our provider stopped listing it. The page still loads, with a warning. */
  status: z.enum(['live', 'expired']),
});
export type OpportunityDetail = z.infer<typeof OpportunityDetailSchema>;

export function isClosed(closesAt: string | null | undefined, now: Date = new Date()): boolean {
  return closesAt ? new Date(closesAt).getTime() < now.getTime() : false;
}

/** "Closing soon" = within 7 days. */
export function isClosingSoon(
  closesAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!closesAt) return false;
  const ms = new Date(closesAt).getTime() - now.getTime();
  return ms >= 0 && ms <= 7 * 24 * 60 * 60 * 1000;
}
