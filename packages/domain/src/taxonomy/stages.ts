import { z } from 'zod';

/**
 * Where someone is in their journey right now. Drives the timeline ("what should I be doing
 * about next steps at this point in the year?") and gives matching a sensible default goal.
 */
export const STAGES = [
  'year-11',
  'year-12',
  'year-13',
  'college',
  'apprentice',
  'uni-year-1',
  'uni-year-2',
  'uni-final-year',
  'graduate',
  'working',
  'between-things',
] as const;

export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export interface StageInfo {
  stage: Stage;
  /** Plain-English label shown on the stage picker. */
  label: string;
  hint: string;
  /**
   * Stage the person is *probably* in after the next 1 September. `null` means "we can't
   * assume, ask" (leaving school/college, or a course of unknown length).
   */
  next: Stage | null;
  /** Whether the stage follows the Sept–Aug academic calendar. */
  academic: boolean;
}

export const STAGE_INFO: Readonly<Record<Stage, StageInfo>> = {
  'year-11': {
    stage: 'year-11',
    label: 'Year 11',
    hint: 'Doing GCSEs and deciding what comes next',
    next: null,
    academic: true,
  },
  'year-12': {
    stage: 'year-12',
    label: 'Year 12',
    hint: 'First year of sixth form or college (A levels, T Levels, BTEC)',
    next: 'year-13',
    academic: true,
  },
  'year-13': {
    stage: 'year-13',
    label: 'Year 13',
    hint: 'Final year of sixth form or college',
    next: null,
    academic: true,
  },
  college: {
    stage: 'college',
    label: 'At college',
    hint: 'On a vocational or technical course',
    next: null,
    academic: true,
  },
  apprentice: {
    stage: 'apprentice',
    label: 'On an apprenticeship',
    hint: 'Working and training at the same time',
    next: null,
    academic: false,
  },
  'uni-year-1': {
    stage: 'uni-year-1',
    label: 'University: 1st year',
    hint: 'Just started, or in your first year',
    next: 'uni-year-2',
    academic: true,
  },
  'uni-year-2': {
    stage: 'uni-year-2',
    label: 'University: 2nd year',
    hint: 'The year most big internships are won',
    next: 'uni-final-year',
    academic: true,
  },
  'uni-final-year': {
    stage: 'uni-final-year',
    label: 'University: final year',
    hint: 'Graduating this summer',
    next: 'graduate',
    academic: true,
  },
  graduate: {
    stage: 'graduate',
    label: 'Finished university',
    hint: 'Graduated and looking for what’s next',
    next: null,
    academic: false,
  },
  working: {
    stage: 'working',
    label: 'Working',
    hint: 'In a job, thinking about the next move',
    next: null,
    academic: false,
  },
  'between-things': {
    stage: 'between-things',
    label: 'Not in work or study right now',
    hint: 'Looking for a way forward, at your own pace',
    next: null,
    academic: false,
  },
};

/**
 * Academic years run 1 September – 31 August. The "academic year" is identified by the calendar
 * year it starts in (so 12 Oct 2026 and 3 Mar 2027 are both academic year 2026).
 */
export function academicYearOf(date: Date): number {
  return date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/**
 * Best-guess stage for `now`, given the stage the person chose and the academic year in which
 * they chose it. Advances one step per elapsed September where the next step is unambiguous;
 * otherwise reports that we should ask them.
 */
export function advanceStage(
  stage: Stage,
  setInAcademicYear: number,
  now: Date,
): { stage: Stage; needsConfirmation: boolean } {
  const elapsed = academicYearOf(now) - setInAcademicYear;
  if (elapsed <= 0) return { stage, needsConfirmation: false };
  let current = stage;
  for (let i = 0; i < elapsed; i++) {
    const info = STAGE_INFO[current];
    if (!info.academic) return { stage: current, needsConfirmation: false };
    if (info.next === null) return { stage: current, needsConfirmation: true };
    current = info.next;
  }
  return { stage: current, needsConfirmation: true };
}
