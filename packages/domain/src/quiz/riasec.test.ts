import { describe, expect, it } from 'vitest';
import { RIASEC_TYPES } from '../taxonomy/sectors';
import { type Likert, type RiasecItem, rankSectorsByInterest, scoreRiasec } from './riasec';

const items: RiasecItem[] = RIASEC_TYPES.flatMap((type) =>
  [1, 2, 3, 4, 5].map((n) => ({ id: `${type}${n}`, text: `${type} item ${n}`, type })),
);

function answersFor(
  map: Partial<Record<string, Likert>>,
  fill?: Likert,
): Record<string, Likert | undefined> {
  const out: Record<string, Likert | undefined> = {};
  for (const item of items) out[item.id] = fill;
  return { ...out, ...map };
}

function allOfType(type: string, value: Likert): Record<string, Likert> {
  return Object.fromEntries(items.filter((i) => i.type === type).map((i) => [i.id, value]));
}

describe('scoreRiasec', () => {
  it('sums five 0–4 items to a 0–20 raw score per type (O*NET Mini-IP scoring)', () => {
    const result = scoreRiasec(
      items,
      answersFor({ ...allOfType('S', 4), ...allOfType('I', 2) }, 0),
    );
    expect(result.raw.S).toBe(20);
    expect(result.raw.I).toBe(10);
    expect(result.raw.R).toBe(0);
    expect(result.normalised.S).toBe(1);
    expect(result.normalised.I).toBe(0.5);
    expect(result.answered).toBe(30);
    expect(result.reliable).toBe(true);
  });

  it('orders ties deterministically in R-I-A-S-E-C order', () => {
    const result = scoreRiasec(items, answersFor({ ...allOfType('S', 4) }, 0));
    expect(result.ranking).toEqual(['S', 'R', 'I', 'A', 'E', 'C']);
    expect(result.code).toBe('SRI');
    expect(result.differentiation).toBe(1);
  });

  it('scales partial answers so skipping an item does not penalise a type', () => {
    const answers: Record<string, Likert | undefined> = { S1: 4, S2: 4, S3: 4 };
    const result = scoreRiasec(items, answers);
    expect(result.raw.S).toBe(20);
    expect(result.reliable).toBe(false); // other types unanswered
  });

  it('reports low differentiation when everything is rated the same', () => {
    const result = scoreRiasec(items, answersFor({}, 2));
    expect(result.differentiation).toBe(0);
    expect(result.raw.R).toBe(10);
  });

  it('handles no answers without throwing', () => {
    const result = scoreRiasec(items, {});
    expect(result.answered).toBe(0);
    expect(result.reliable).toBe(false);
    expect(result.raw.R).toBe(0);
  });
});

describe('rankSectorsByInterest', () => {
  it('puts people-helping sectors first for a strongly Social profile', () => {
    const ranked = rankSectorsByInterest({ R: 0, I: 0, A: 0, S: 1, E: 0, C: 0 });
    expect(ranked).toHaveLength(15);
    expect(['care-services', 'education-early-years']).toContain(ranked[0]?.sector);
  });

  it('puts hands-on sectors first for a strongly Realistic profile', () => {
    const ranked = rankSectorsByInterest({ R: 1, I: 0.2, A: 0, S: 0, E: 0, C: 0.1 });
    expect([
      'construction-built-environment',
      'engineering-manufacturing',
      'agriculture-environment-animal-care',
    ]).toContain(ranked[0]?.sector);
  });

  it('is deterministic for ties', () => {
    const flat = { R: 0.5, I: 0.5, A: 0.5, S: 0.5, E: 0.5, C: 0.5 };
    expect(rankSectorsByInterest(flat).map((s) => s.sector)).toEqual(
      rankSectorsByInterest(flat).map((s) => s.sector),
    );
    expect(rankSectorsByInterest(flat).every((s) => s.fit === 0.5)).toBe(true);
  });
});
