import { z } from 'zod';
import { type Level, LevelSchema } from '../taxonomy/levels';
import { AgeBandSchema, GoalSchema, WorkModeSchema } from '../taxonomy/misc';
import { SectorSlugSchema } from '../taxonomy/sectors';
import { StageSchema } from '../taxonomy/stages';
import { ValueKeySchema } from '../taxonomy/values';
import {
  EducationEntrySchema,
  ExperienceEntrySchema,
  highestCompletedLevel,
  totalExperienceYears,
} from './history';

/** RIASEC scores normalised to 0–1 (raw 0–20 / 20). */
export const RiasecVectorSchema = z.object({
  R: z.number().min(0).max(1),
  I: z.number().min(0).max(1),
  A: z.number().min(0).max(1),
  S: z.number().min(0).max(1),
  E: z.number().min(0).max(1),
  C: z.number().min(0).max(1),
});

export const SKILL_LEVELS = [1, 2, 3] as const;
export const SKILL_LEVEL_LABEL: Readonly<Record<(typeof SKILL_LEVELS)[number], string>> = {
  1: 'Just starting',
  2: 'Comfortable',
  3: 'Really good',
};

export const ProfileSkillSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});
export type ProfileSkill = z.infer<typeof ProfileSkillSchema>;

export const BUDGETS = ['free-only', 'low', 'any'] as const;
export const BudgetSchema = z.enum(BUDGETS);
export type Budget = z.infer<typeof BudgetSchema>;
/** "Low" budget means up to this much for a course or training. */
export const LOW_BUDGET_GBP = 500;

/**
 * Privacy: location is deliberately coarse. We keep the outcode label ("M1") and its centroid,
 * never a street address or precise GPS point.
 */
export const ProfileLocationSchema = z.object({
  label: z.string().min(1).max(80),
  outcode: z.string().max(5).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type ProfileLocation = z.infer<typeof ProfileLocationSchema>;

export const ProfileSchema = z.object({
  ageBand: AgeBandSchema.optional(),
  /** Highest qualification gained, RQF 0–8 (0 = none / entry level). */
  highestLevel: LevelSchema.default(0),
  skills: z.array(ProfileSkillSchema).max(60).default([]),
  jobTitles: z.array(z.string().min(1).max(100)).max(20).default([]),
  yearsExperience: z.number().min(0).max(60).optional(),
  riasec: RiasecVectorSchema.optional(),
  values: z.array(ValueKeySchema).max(3).default([]),
  goal: GoalSchema.optional(),
  sectorsInterested: z.array(SectorSlugSchema).max(15).default([]),
  location: ProfileLocationSchema.optional(),
  maxTravelMiles: z.number().min(1).max(200).optional(),
  budget: BudgetSchema.default('any'),
  workModes: z.array(WorkModeSchema).max(4).optional(),
  /** Wants employers who back disabled applicants (Disability Confident, guaranteed interview). */
  wantsAdjustments: z.boolean().optional(),

  // --- What I have done ----------------------------------------------------------------
  education: z.array(EducationEntrySchema).max(30).default([]),
  experience: z.array(ExperienceEntrySchema).max(30).default([]),
  /** Short things worth mentioning: "Duke of Edinburgh Bronze", "Captain of the school team". */
  achievements: z.array(z.string().trim().min(2).max(160)).max(20).default([]),
  drivingLicence: z.boolean().optional(),

  // --- Timeline -------------------------------------------------------------------------
  /** Where they are now. We ask again each September rather than assuming (see advanceStage). */
  stage: StageSchema.optional(),
  /** Academic year (start year, e.g. 2026) in which `stage` was last confirmed. */
  stageSetAcademicYear: z.number().int().min(2000).max(2100).optional(),
  /** ISO date they started using the site; anchors the "first 30 days" plan. */
  journeyStartedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Timeline items they've ticked off. */
  doneTimelineIds: z.array(z.string().max(80)).max(300).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const EMPTY_PROFILE: Profile = ProfileSchema.parse({});

/** How "complete" is a profile, 0–1. Used by the UI to nudge, never to gate anything. */
export function profileCompleteness(p: Profile): number {
  const checks = [
    p.ageBand !== undefined,
    p.goal !== undefined,
    p.location !== undefined,
    p.skills.length > 0,
    p.riasec !== undefined,
    p.values.length > 0,
    p.highestLevel > 0 || p.jobTitles.length > 0 || p.education.length > 0,
    p.education.length > 0,
    p.experience.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}

const MAX_SKILLS = 60;
const MAX_TITLES = 20;
const PAID_KINDS = new Set(['job', 'self-employed', 'work-experience']);

/**
 * The profile as the matching engine should read it: what the person typed, plus what their
 * education and experience history says. Never overwrites an explicit answer with a lower one.
 *
 *  - highestLevel: the higher of what they stated and their best completed qualification;
 *  - jobTitles:    stated titles plus the titles in their work history;
 *  - yearsExperience: stated, else the total of their dated experience;
 *  - skills:       stated skills plus any attached to their experience entries.
 */
export function effectiveProfile(profile: Profile, now: Date = new Date()): Profile {
  const fromEducation = highestCompletedLevel(profile.education);
  const highestLevel = Math.max(profile.highestLevel, fromEducation ?? 0) as Level;

  const titles = new Map<string, string>();
  for (const t of profile.jobTitles) titles.set(t.toLowerCase(), t);
  for (const e of profile.experience) {
    if (PAID_KINDS.has(e.kind)) titles.set(e.title.toLowerCase(), e.title);
  }

  const skills = new Map(profile.skills.map((s) => [s.id, s]));
  for (const e of profile.experience) {
    for (const s of e.skills)
      if (!skills.has(s.id)) skills.set(s.id, { id: s.id, label: s.label, level: 2 });
  }

  const years =
    profile.yearsExperience ?? totalExperienceYears(profile.experience, now) ?? undefined;

  return {
    ...profile,
    highestLevel,
    jobTitles: [...titles.values()].slice(0, MAX_TITLES),
    skills: [...skills.values()].slice(0, MAX_SKILLS),
    ...(years !== undefined ? { yearsExperience: years } : {}),
  };
}
