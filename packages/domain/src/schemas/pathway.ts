import { z } from 'zod';
import { LevelSchema } from '../taxonomy/levels';
import { SectorSlugSchema } from '../taxonomy/sectors';
import { SourceRefSchema, TimelineSearchSchema } from './timeline';

export const PATHWAY_STEP_KINDS = ['start', 'learn', 'work', 'progress'] as const;
export const PathwayStepKindSchema = z.enum(PATHWAY_STEP_KINDS);
export type PathwayStepKind = z.infer<typeof PathwayStepKindSchema>;

export const PathwayStepSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: PathwayStepKindSchema,
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(320),
  /** Typical qualification level at this step (RQF), when meaningful. */
  level: LevelSchema.optional(),
  /** "6–12 months", "2 years". Only where well established. */
  typicalDuration: z.string().max(40).optional(),
  /** A step is a QUERY, not a hard-coded listing, so it always resolves to live opportunities. */
  search: TimelineSearchSchema,
});
export type PathwayStep = z.infer<typeof PathwayStepSchema>;

/**
 * A curated route into a career. Steps are ordered from "no experience needed" to "established".
 * Deliberately generic about pay and timescales: those vary by employer and change every year,
 * so the UI links to live opportunities instead.
 */
export const PathwaySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sector: SectorSlugSchema,
  title: z.string().min(3).max(80),
  /** One plain sentence for the card. */
  blurb: z.string().min(10).max(200),
  /** Who this is a good fit for. */
  forWho: z.string().min(10).max(240),
  /** What you can start with. */
  startingPoint: z.string().min(5).max(160),
  steps: z.array(PathwayStepSchema).min(3).max(7),
  sources: z.array(SourceRefSchema).min(1),
});
export type Pathway = z.infer<typeof PathwaySchema>;
