import { z } from 'zod';
import { LevelSchema } from '../taxonomy/levels';
import { WorkModeSchema } from '../taxonomy/misc';
import { OpportunityTypeSchema, PillarSchema } from '../taxonomy/opportunity-types';
import { SectorSlugSchema } from '../taxonomy/sectors';
import { StageSchema } from '../taxonomy/stages';
import { HttpsUrlSchema } from './opportunity';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const SourceRefSchema = z.object({ label: z.string().min(1), url: HttpsUrlSchema });
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * A dated national event (deadline or opening date) for one cycle. These are the ONLY facts in
 * the timeline presented as exact, so each needs an official source and a verification date.
 */
export const CalendarEventSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** e.g. "ucas-2027-entry". Purely a label for editors and tests. */
  cycle: z.string().min(1),
  label: z.string().min(1),
  /** First day the thing can be done. Optional for pure deadlines. */
  opens: IsoDate.optional(),
  /** Deadline / last day. */
  closes: IsoDate,
  /** Local UK time of the deadline when it matters, e.g. "18:00". */
  closesAtTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  source: SourceRefSchema,
  /** When a human last checked the source. Unverified events are hidden from users. */
  verifiedOn: IsoDate.nullable(),
  note: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

const MonthDaySchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});
export type MonthDay = z.infer<typeof MonthDaySchema>;

export const TimingSchema = z.discriminatedUnion('kind', [
  /** A "typical" window that repeats every academic year (Sept–Aug). Wraps over New Year if `to` < `from`. */
  z.object({ kind: z.literal('academic'), from: MonthDaySchema, to: MonthDaySchema }),
  /**
   * An exact date from the calendar.
   * - default window: [closes - leadDays, closes]
   * - with `earlyWindowDays` and an `opens` date: [opens, opens + earlyWindowDays] ("apply early, places fill").
   */
  z.object({
    kind: z.literal('fixed'),
    eventId: z.string(),
    leadDays: z.number().int().min(0).max(365).default(45),
    earlyWindowDays: z.number().int().min(1).max(365).optional(),
  }),
  /** Days since the person started their journey on the site (for people without an academic calendar). */
  z.object({
    kind: z.literal('relative'),
    fromDay: z.number().int().min(0),
    toDay: z.number().int().min(1),
  }),
]);
export type Timing = z.infer<typeof TimingSchema>;

/** A pre-filtered search the nudge links to. Mirrors SearchQuery but only the safe, useful subset. */
export const TimelineSearchSchema = z.object({
  type: z.array(OpportunityTypeSchema).optional(),
  pillar: z.array(PillarSchema).optional(),
  sector: z.array(SectorSlugSchema).optional(),
  levelMin: LevelSchema.optional(),
  levelMax: LevelSchema.optional(),
  free: z.boolean().optional(),
  workMode: z.array(WorkModeSchema).optional(),
  q: z.string().max(100).optional(),
});
export type TimelineSearch = z.infer<typeof TimelineSearchSchema>;

export const TimelineActionSchema = z
  .object({
    label: z.string().min(1).max(60),
    /** Internal pre-filtered search... */
    search: TimelineSearchSchema.optional(),
    /** ...or another page on this site (e.g. "/quiz")... */
    path: z
      .string()
      .regex(/^\/[a-z0-9/_-]*$/)
      .optional(),
    /** ...or an official external page. Exactly one of the three is required. */
    href: HttpsUrlSchema.optional(),
  })
  .refine((a) => [a.search, a.path, a.href].filter(Boolean).length === 1, {
    message: 'Provide exactly one of search, path or href',
  });
export type TimelineAction = z.infer<typeof TimelineActionSchema>;

export const URGENCIES = ['high', 'normal', 'low'] as const;
export const UrgencySchema = z.enum(URGENCIES);
export type Urgency = z.infer<typeof UrgencySchema>;

export const TimelineRuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  stages: z.array(StageSchema).min(1),
  /** Short imperative title: "Apply for summer internships". */
  title: z.string().min(3).max(80),
  /** One plain sentence: what to do. */
  summary: z.string().min(10).max(240),
  /** Why now. Honest, specific, no hype. */
  why: z.string().min(10).max(400),
  /** Quick prep checklist (3–5 short items). */
  prepare: z.array(z.string().min(2).max(120)).max(6).default([]),
  timing: TimingSchema,
  urgency: UrgencySchema.default('normal'),
  action: TimelineActionSchema.optional(),
  /** If set, only shown to people interested in one of these sectors (or with none chosen). */
  sectors: z.array(SectorSlugSchema).optional(),
  /** Shown as a footnote: "Dates vary by employer, check each listing." */
  caveat: z.string().max(240).optional(),
  /** What to say if the window has recently passed. Defaults to a generic "late beats never". */
  missedNote: z.string().max(240).optional(),
  sources: z.array(SourceRefSchema).min(1),
});
export type TimelineRule = z.infer<typeof TimelineRuleSchema>;
/** What editors write (defaults like `urgency` and `prepare` optional). */
export type TimelineRuleInput = z.input<typeof TimelineRuleSchema>;

export const TIMELINE_STATUSES = ['now', 'soon', 'later', 'missed', 'done'] as const;
export const TimelineStatusSchema = z.enum(TIMELINE_STATUSES);
export type TimelineStatus = z.infer<typeof TimelineStatusSchema>;

export const TimelineEntrySchema = z.object({
  rule: TimelineRuleSchema,
  status: TimelineStatusSchema,
  /** ISO dates (YYYY-MM-DD). */
  opensOn: IsoDate,
  closesOn: IsoDate,
  daysToOpen: z.number().int(),
  daysToClose: z.number().int(),
  /** "Typically Sep–Dec", "Deadline 13 Jan 2027, 18:00", "In your first 2 weeks". */
  windowLabel: z.string(),
  exact: z.boolean(),
  /** True when the rule belongs to the next stage (shown in summer as a heads-up). */
  fromNextStage: z.boolean(),
  event: CalendarEventSchema.optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const TimelineSchema = z.object({
  stage: StageSchema,
  asOf: IsoDate,
  academicYear: z.number().int(),
  now: z.array(TimelineEntrySchema),
  soon: z.array(TimelineEntrySchema),
  later: z.array(TimelineEntrySchema),
  missed: z.array(TimelineEntrySchema),
  done: z.array(TimelineEntrySchema),
  /** The 3 most useful things to do next, across buckets. */
  nextUp: z.array(TimelineEntrySchema),
});
export type Timeline = z.infer<typeof TimelineSchema>;
