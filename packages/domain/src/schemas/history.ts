import { z } from 'zod';
import { type Level, LevelSchema } from '../taxonomy/levels';

/**
 * "What I have done": the structured record a person builds up on their profile (or that a CV
 * import fills in for them to check). It is deliberately small and forgiving: everything but the
 * title is optional, because a 16-year-old's history is a GCSE year and a Saturday job, and that
 * is a perfectly good start.
 */

// --- education ------------------------------------------------------------------------------

export const EDUCATION_KINDS = [
  'gcse',
  'a-level',
  'btec',
  't-level',
  'nvq',
  'apprenticeship',
  'access',
  'foundation',
  'degree',
  'masters',
  'doctorate',
  'other',
] as const;
export const EducationKindSchema = z.enum(EDUCATION_KINDS);
export type EducationKind = z.infer<typeof EducationKindSchema>;

export const EDUCATION_KIND_LABEL: Readonly<Record<EducationKind, string>> = {
  gcse: 'GCSEs (or National 5s, or similar)',
  'a-level': 'A levels or AS levels',
  btec: 'BTEC or similar vocational course',
  't-level': 'T Level',
  nvq: 'NVQ, diploma or certificate',
  apprenticeship: 'Apprenticeship',
  access: 'Access to Higher Education',
  foundation: 'Foundation degree, HND or HNC',
  degree: "Bachelor's degree",
  masters: "Master's degree",
  doctorate: 'Doctorate',
  other: 'Something else',
};

/** The RQF level a kind usually sits at. `null` = depends on the course: read it from the title. */
const KIND_DEFAULT_LEVEL: Readonly<Record<EducationKind, Level | null>> = {
  gcse: 2,
  'a-level': 3,
  btec: null,
  't-level': 3,
  nvq: null,
  apprenticeship: null,
  access: 3,
  foundation: 5,
  degree: 6,
  masters: 7,
  doctorate: 8,
  other: null,
};

export const EDUCATION_STATUSES = ['completed', 'studying', 'left-early'] as const;
export const EducationStatusSchema = z.enum(EDUCATION_STATUSES);
export type EducationStatus = z.infer<typeof EducationStatusSchema>;

export const EducationEntrySchema = z.object({
  id: z.string().min(1).max(40),
  kind: EducationKindSchema,
  /** "Maths and English", "Level 3 Diploma in Health and Social Care", "BSc Computer Science". */
  title: z.string().trim().min(1).max(120),
  provider: z.string().trim().max(120).optional(),
  status: EducationStatusSchema.default('completed'),
  /** Year finished, or expected to finish. */
  year: z.number().int().min(1950).max(2100).optional(),
  grade: z.string().trim().max(40).optional(),
  /** Set when the kind and title do not make the level obvious. */
  level: LevelSchema.optional(),
});
export type EducationEntry = z.infer<typeof EducationEntrySchema>;

const LEVEL_IN_TITLE = /\blevel\s*([0-8])\b/i;

/** Does a grade clearly mean "below a pass at GCSE" (grade 3 or D and under)? */
function belowGcsePass(grade: string | undefined): boolean {
  if (!grade) return false;
  const g = grade.trim().toLowerCase();
  const number = /^[1-9]$/.exec(g);
  if (number) return Number(g) < 4;
  return /^[d-g]$/.test(g) || g === 'u';
}

/**
 * The RQF level of one qualification: what the person said, else a "Level N" in the title, else
 * what that kind of qualification normally is. `null` when we genuinely cannot tell.
 */
export function educationLevel(entry: EducationEntry): Level | null {
  if (entry.level !== undefined) return entry.level;
  const inTitle = LEVEL_IN_TITLE.exec(entry.title);
  if (inTitle?.[1]) return Number(inTitle[1]) as Level;
  if (entry.kind === 'gcse') return belowGcsePass(entry.grade) ? 1 : 2;
  if (
    entry.kind === 'foundation' &&
    /\bhnc\b|higher national certificate|cert ?he/i.test(entry.title)
  ) {
    return 4;
  }
  return KIND_DEFAULT_LEVEL[entry.kind];
}

/** Highest level among COMPLETED qualifications (studying or left-early ones do not count yet). */
export function highestCompletedLevel(entries: readonly EducationEntry[]): Level | null {
  let best: Level | null = null;
  for (const e of entries) {
    if (e.status !== 'completed') continue;
    const level = educationLevel(e);
    if (level !== null && (best === null || level > best)) best = level;
  }
  return best;
}

// --- experience -----------------------------------------------------------------------------

export const EXPERIENCE_KINDS = [
  'job',
  'volunteering',
  'work-experience',
  'caring',
  'self-employed',
  'other',
] as const;
export const ExperienceKindSchema = z.enum(EXPERIENCE_KINDS);
export type ExperienceKind = z.infer<typeof ExperienceKindSchema>;

export const EXPERIENCE_KIND_LABEL: Readonly<Record<ExperienceKind, string>> = {
  job: 'A paid job',
  volunteering: 'Volunteering',
  'work-experience': 'Work experience or a placement',
  caring: 'Caring for someone',
  'self-employed': 'Self-employed or freelance',
  other: 'Something else',
};

const YearMonth = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const ExperienceEntrySchema = z.object({
  id: z.string().min(1).max(40),
  kind: ExperienceKindSchema.default('job'),
  title: z.string().trim().min(1).max(100),
  organisation: z.string().trim().max(120).optional(),
  from: YearMonth.optional(),
  /** Omit (or null) for "still doing this". */
  to: YearMonth.nullable().optional(),
  description: z.string().trim().max(600).optional(),
  skills: z
    .array(z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(120) }))
    .max(15)
    .default([]),
});
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;

/** Months since year 0, for "YYYY-MM" arithmetic. */
export const monthIndex = (ym: string): number => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};

const nowMonth = (now: Date): number => now.getUTCFullYear() * 12 + now.getUTCMonth();

export interface Span {
  start: number;
  end: number;
}

/** Dated experience as month spans (open-ended = until now). Entries without a start are ignored. */
export function experienceSpans(entries: readonly ExperienceEntry[], now: Date): Span[] {
  const today = nowMonth(now);
  const spans: Span[] = [];
  for (const e of entries) {
    if (!e.from) continue;
    const start = monthIndex(e.from);
    const end = e.to ? monthIndex(e.to) : today;
    if (end >= start && end - start <= 12 * 60) spans.push({ start, end: Math.min(end, today) });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Merge overlapping spans so two jobs at once are not counted twice. */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && s.start <= last.end + 1) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

/** Total time in dated experience, to the nearest half year. Null if nothing is dated. */
export function totalExperienceYears(
  entries: readonly ExperienceEntry[],
  now: Date,
): number | null {
  const merged = mergeSpans(experienceSpans(entries, now));
  if (merged.length === 0) return null;
  const months = merged.reduce((n, s) => n + (s.end - s.start + 1), 0);
  return Math.round((months / 12) * 2) / 2;
}

export interface HistoryGap {
  /** "YYYY-MM" of the month after the earlier span ended, and the month before the next began. */
  from: string;
  to: string;
  months: number;
}

const toYearMonth = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/**
 * Stretches of at least `minMonths` with nothing dated, between two dated entries or between the
 * last one and today. Gaps are normal (study, caring, health, looking for work): this exists so
 * the CV review can suggest a one-line explanation, never to judge.
 */
export function experienceGaps(
  entries: readonly ExperienceEntry[],
  now: Date,
  minMonths = 9,
): HistoryGap[] {
  const merged = mergeSpans(experienceSpans(entries, now));
  const gaps: HistoryGap[] = [];
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1] as Span;
    const next = merged[i] as Span;
    const months = next.start - prev.end - 1;
    if (months >= minMonths)
      gaps.push({ from: toYearMonth(prev.end + 1), to: toYearMonth(next.start - 1), months });
  }
  const last = merged.at(-1);
  if (last) {
    const months = nowMonth(now) - last.end;
    if (months >= minMonths)
      gaps.push({ from: toYearMonth(last.end + 1), to: toYearMonth(nowMonth(now)), months });
  }
  return gaps;
}
