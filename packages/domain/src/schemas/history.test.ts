import { describe, expect, it } from 'vitest';
import {
  type EducationEntry,
  type ExperienceEntry,
  educationLevel,
  experienceGaps,
  highestCompletedLevel,
  mergeSpans,
  monthIndex,
  totalExperienceYears,
} from './history';
import { effectiveProfile, ProfileSchema } from './profile';

const NOW = new Date('2026-10-01T12:00:00Z');

const edu = (
  over: Partial<EducationEntry> & Pick<EducationEntry, 'kind' | 'title'>,
): EducationEntry => ({
  id: 'e',
  status: 'completed',
  ...over,
});
const exp = (over: Partial<ExperienceEntry> & Pick<ExperienceEntry, 'title'>): ExperienceEntry => ({
  id: 'x',
  kind: 'job',
  skills: [],
  ...over,
});

describe('educationLevel', () => {
  it('uses what the kind of qualification normally is', () => {
    expect(educationLevel(edu({ kind: 'a-level', title: 'Biology' }))).toBe(3);
    expect(educationLevel(edu({ kind: 't-level', title: 'Digital' }))).toBe(3);
    expect(educationLevel(edu({ kind: 'degree', title: 'BSc Psychology' }))).toBe(6);
    expect(educationLevel(edu({ kind: 'masters', title: 'MSc' }))).toBe(7);
    expect(educationLevel(edu({ kind: 'foundation', title: 'HND Business' }))).toBe(5);
    expect(educationLevel(edu({ kind: 'foundation', title: 'HNC Engineering' }))).toBe(4);
  });

  it('reads "Level N" out of the title when the kind is not enough', () => {
    expect(educationLevel(edu({ kind: 'btec', title: 'BTEC Level 3 in Sport' }))).toBe(3);
    expect(educationLevel(edu({ kind: 'nvq', title: 'NVQ Level 2 in Hospitality' }))).toBe(2);
    expect(
      educationLevel(edu({ kind: 'apprenticeship', title: 'Level 4 Software Developer' })),
    ).toBe(4);
    expect(educationLevel(edu({ kind: 'other', title: 'First aid certificate' }))).toBeNull();
  });

  it('treats GCSEs below grade 4 as Level 1 and passes as Level 2', () => {
    expect(educationLevel(edu({ kind: 'gcse', title: 'Maths', grade: '5' }))).toBe(2);
    expect(educationLevel(edu({ kind: 'gcse', title: 'Maths', grade: 'C' }))).toBe(2);
    expect(educationLevel(edu({ kind: 'gcse', title: 'Maths', grade: '3' }))).toBe(1);
    expect(educationLevel(edu({ kind: 'gcse', title: 'Maths', grade: 'D' }))).toBe(1);
    expect(educationLevel(edu({ kind: 'gcse', title: 'GCSEs' }))).toBe(2);
  });

  it('lets an explicit level win', () => {
    expect(educationLevel(edu({ kind: 'a-level', title: 'x', level: 2 }))).toBe(2);
  });
});

describe('highestCompletedLevel', () => {
  it('ignores qualifications that are not finished yet', () => {
    const entries = [
      edu({ kind: 'gcse', title: 'GCSEs' }),
      edu({ kind: 'a-level', title: 'A levels', status: 'studying' }),
      edu({ kind: 'degree', title: 'BA', status: 'left-early' }),
    ];
    expect(highestCompletedLevel(entries)).toBe(2);
    expect(highestCompletedLevel([])).toBeNull();
  });
});

describe('experience time', () => {
  it('totals dated experience, merging overlaps and counting ongoing roles to today', () => {
    const entries = [
      exp({ title: 'A', from: '2022-01', to: '2023-12' }), // 24 months
      exp({ title: 'B', from: '2023-06', to: '2024-05' }), // overlaps A
      exp({ title: 'C', from: '2025-10', to: null }), // Oct 2025 → Oct 2026 = 13 months
    ];
    expect(totalExperienceYears(entries, NOW)).toBe(3.5);
  });

  it('is null when nothing is dated', () => {
    expect(totalExperienceYears([exp({ title: 'Cashier' })], NOW)).toBeNull();
    expect(totalExperienceYears([], NOW)).toBeNull();
  });

  it('merges adjacent and overlapping spans', () => {
    expect(
      mergeSpans([
        { start: 10, end: 20 },
        { start: 21, end: 30 },
        { start: 50, end: 60 },
        { start: 25, end: 28 },
      ]),
    ).toEqual([
      { start: 10, end: 30 },
      { start: 50, end: 60 },
    ]);
  });

  it('indexes months', () => {
    expect(monthIndex('2026-10') - monthIndex('2026-01')).toBe(9);
  });
});

describe('experienceGaps', () => {
  it('finds a gap between jobs and a recent gap up to today', () => {
    const gaps = experienceGaps(
      [
        exp({ title: 'A', from: '2020-01', to: '2021-06' }),
        exp({ title: 'B', from: '2022-06', to: '2023-12' }),
      ],
      NOW,
    );
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ from: '2021-07', to: '2022-05', months: 11 });
    expect(gaps[1]?.months).toBeGreaterThanOrEqual(9);
  });

  it('ignores short gaps and ongoing roles', () => {
    expect(
      experienceGaps(
        [
          exp({ title: 'A', from: '2024-01', to: '2024-06' }),
          exp({ title: 'B', from: '2024-09', to: null }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it('has no gaps without dates', () => {
    expect(experienceGaps([exp({ title: 'A' })], NOW)).toEqual([]);
  });
});

describe('effectiveProfile', () => {
  it('folds history into what matching reads, without lowering anything the person said', () => {
    const profile = ProfileSchema.parse({
      highestLevel: 3,
      jobTitles: ['Barista'],
      skills: [{ id: 'teamwork', label: 'Teamwork', level: 3 }],
      education: [
        { id: 'e1', kind: 'gcse', title: 'GCSEs' },
        { id: 'e2', kind: 'degree', title: 'BSc', status: 'studying' },
      ],
      experience: [
        {
          id: 'x1',
          title: 'Shop assistant',
          from: '2023-01',
          to: '2024-12',
          skills: [
            { id: 'teamwork', label: 'Teamwork' },
            { id: 'cash-handling', label: 'Cash handling' },
          ],
        },
        { id: 'x2', kind: 'volunteering', title: 'Charity shop volunteer' },
      ],
    });
    const e = effectiveProfile(profile, NOW);
    expect(e.highestLevel).toBe(3); // stated 3 beats GCSEs; the degree is not finished
    expect(e.jobTitles).toEqual(['Barista', 'Shop assistant']); // volunteering is not a job title
    expect(e.yearsExperience).toBe(2);
    expect(e.skills.map((s) => s.id)).toEqual(['teamwork', 'cash-handling']);
    expect(e.skills[0]?.level).toBe(3); // the stated level is kept
  });

  it('raises the level from a finished qualification', () => {
    const p = ProfileSchema.parse({ education: [{ id: 'e', kind: 'a-level', title: 'A levels' }] });
    expect(effectiveProfile(p, NOW).highestLevel).toBe(3);
  });

  it('prefers a stated number of years', () => {
    const p = ProfileSchema.parse({
      yearsExperience: 5,
      experience: [{ id: 'x', title: 'A', from: '2025-01', to: '2025-12' }],
    });
    expect(effectiveProfile(p, NOW).yearsExperience).toBe(5);
  });
});
