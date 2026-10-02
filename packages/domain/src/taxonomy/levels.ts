import { z } from 'zod';

/**
 * UK Regulated Qualifications Framework (England, Wales, Northern Ireland).
 * Stored as an integer 0–8 where 0 = Entry level / no formal qualifications, so range
 * filters and "do I meet it?" checks are plain numeric comparisons.
 * Source: https://www.gov.uk/what-different-qualification-levels-mean/list-of-qualification-levels
 */
export const LEVEL_MIN = 0;
export const LEVEL_MAX = 8;

export const LevelSchema = z.number().int().min(LEVEL_MIN).max(LEVEL_MAX);
export type Level = z.infer<typeof LevelSchema>;

export interface QualificationLevel {
  value: Level;
  /** Official label. */
  label: string;
  /** Plain-English label for "what I already have". */
  haveLabel: string;
  examples: readonly string[];
}

export const QUALIFICATION_LEVELS: readonly QualificationLevel[] = [
  {
    value: 0,
    label: 'Entry level',
    haveLabel: 'No formal qualifications yet',
    examples: ['Entry level awards and certificates', 'Functional Skills entry level'],
  },
  {
    value: 1,
    label: 'Level 1',
    haveLabel: 'A few GCSEs (grades 3–1)',
    examples: ['GCSEs grades 3–1 (D–G)', 'Level 1 award, certificate or diploma'],
  },
  {
    value: 2,
    label: 'Level 2',
    haveLabel: 'GCSEs (grades 9–4)',
    examples: ['GCSEs grades 9–4 (A*–C)', 'Intermediate apprenticeship', 'Level 2 NVQ'],
  },
  {
    value: 3,
    label: 'Level 3',
    haveLabel: 'A levels, T Levels or equivalent',
    examples: ['A levels', 'T Levels', 'Advanced apprenticeship', 'Level 3 BTEC / NVQ'],
  },
  {
    value: 4,
    label: 'Level 4',
    haveLabel: 'First year of university or HNC',
    examples: ['Certificate of Higher Education', 'Higher apprenticeship', 'HNC'],
  },
  {
    value: 5,
    label: 'Level 5',
    haveLabel: 'Foundation degree or HND',
    examples: ['Foundation degree', 'HND', 'Diploma of Higher Education'],
  },
  {
    value: 6,
    label: 'Level 6',
    haveLabel: "Bachelor's degree",
    examples: ["Bachelor's degree (BA, BSc)", 'Degree apprenticeship'],
  },
  {
    value: 7,
    label: 'Level 7',
    haveLabel: "Master's degree",
    examples: ["Master's degree (MA, MSc)", 'PGCE', 'Postgraduate certificate'],
  },
  {
    value: 8,
    label: 'Level 8',
    haveLabel: 'Doctorate',
    examples: ['Doctorate (PhD, DPhil)'],
  },
];

export function getLevel(value: number): QualificationLevel {
  const level = QUALIFICATION_LEVELS[value];
  if (!level) throw new RangeError(`Qualification level out of range: ${value}`);
  return level;
}

export function levelLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not specified';
  return getLevel(value).label;
}
