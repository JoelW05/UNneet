import { z } from 'zod';
import { LevelSchema } from '../taxonomy/levels';

/**
 * What an advert actually asks of an applicant, read out of its text. Shown on every listing as
 * "Minimum requirements" and used to work out how well a person fits (see fit/assess.ts).
 *
 * Everything here is a READING of the advert, never an invention: each item carries the advert's
 * own wording (trimmed), and a listing that says nothing is `stated: false`, not "no requirements".
 */
export const REQUIREMENT_KINDS = ['qualification', 'experience', 'skill', 'check', 'age'] as const;
export const RequirementKindSchema = z.enum(REQUIREMENT_KINDS);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const REQUIREMENT_KIND_LABEL: Readonly<Record<RequirementKind, string>> = {
  qualification: 'Qualifications',
  experience: 'Experience',
  skill: 'Skills and qualities',
  check: 'Checks and documents',
  age: 'Age',
};

export const RequirementItemSchema = z.object({
  kind: RequirementKindSchema,
  /** The advert's wording, or a short standard label for checks ("Enhanced DBS check"). */
  text: z.string().min(2).max(200),
  /** False = the advert says it is desirable / helpful rather than needed. */
  essential: z.boolean(),
  /** For qualifications: the RQF level this implies, when it is clear. */
  level: LevelSchema.nullable().optional(),
  /** For experience: the number of years asked for, when stated. */
  years: z.number().min(0).max(40).nullable().optional(),
});
export type RequirementItem = z.infer<typeof RequirementItemSchema>;

export const SENIORITIES = ['entry', 'senior', 'unknown'] as const;
export type Seniority = (typeof SENIORITIES)[number];

/** Why we say experience is, or is not, needed. */
export const EXPERIENCE_BASES = ['title', 'text', 'type'] as const;
export type ExperienceBasis = (typeof EXPERIENCE_BASES)[number];

export const RequirementsSchema = z.object({
  /** False when the advert gives nothing we could read as a requirement. */
  stated: z.boolean(),
  seniority: z.enum(SENIORITIES),
  experience: z.object({
    /** true = needed, false = explicitly not needed (or an entry route), null = not stated. */
    required: z.boolean().nullable(),
    years: z.number().min(0).max(40).nullable(),
    /** title: from a role like "Head of Year"; text: the advert says so; type: an entry route. */
    basis: z.enum(EXPERIENCE_BASES).nullable(),
    evidence: z.string().max(240).nullable(),
  }),
  /** The highest qualification level the advert marks as essential. Null = none stated. */
  minLevel: LevelSchema.nullable(),
  /** True when the advert says "or equivalent" next to the qualification it asks for. */
  equivalentAccepted: z.boolean(),
  minAge: z.number().int().min(14).max(30).nullable(),
  items: z.array(RequirementItemSchema).max(16),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

export const NO_REQUIREMENTS: Requirements = {
  stated: false,
  seniority: 'unknown',
  experience: { required: null, years: null, basis: null, evidence: null },
  minLevel: null,
  equivalentAccepted: false,
  minAge: null,
  items: [],
};
