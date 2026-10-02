import { describe, expect, it } from 'vitest';
import { isClosed, isClosingSoon, OpportunityInputSchema } from './opportunity';
import { ProfileSchema, profileCompleteness } from './profile';
import {
  activeFilterCount,
  parseSearchQuery,
  resolveDefaults,
  SearchQuerySchema,
  toSearchParams,
} from './search';

const validInput = {
  externalId: 'abc-1',
  type: 'apprenticeship',
  title: 'Level 2 Adult Care Apprentice',
  description: 'Learn on the job while you earn.',
  organisation: { name: 'Acme Care' },
  applyUrl: 'https://example.com/apply/1',
  location: { label: 'Manchester', workMode: 'onsite' },
};

describe('OpportunityInputSchema', () => {
  it('accepts a minimal valid listing and applies defaults', () => {
    const parsed = OpportunityInputSchema.parse(validInput);
    expect(parsed.location.workMode).toBe('onsite');
  });

  it('rejects non-https apply links', () => {
    expect(
      OpportunityInputSchema.safeParse({ ...validInput, applyUrl: 'http://example.com' }).success,
    ).toBe(false);
    expect(
      OpportunityInputSchema.safeParse({ ...validInput, applyUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('rejects inverted age ranges and out-of-range levels', () => {
    expect(
      OpportunityInputSchema.safeParse({ ...validInput, minAge: 25, maxAge: 18 }).success,
    ).toBe(false);
    expect(OpportunityInputSchema.safeParse({ ...validInput, level: 9 }).success).toBe(false);
  });

  it('rejects unknown opportunity types', () => {
    expect(
      OpportunityInputSchema.safeParse({ ...validInput, type: 'pyramid-scheme' }).success,
    ).toBe(false);
  });
});

describe('closing helpers', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('detects closed and closing-soon', () => {
    expect(isClosed('2026-09-30T00:00:00Z', now)).toBe(true);
    expect(isClosed('2026-10-02T00:00:00Z', now)).toBe(false);
    expect(isClosed(null, now)).toBe(false);
    expect(isClosingSoon('2026-10-05T00:00:00Z', now)).toBe(true);
    expect(isClosingSoon('2026-11-05T00:00:00Z', now)).toBe(false);
  });
});

describe('SearchQuerySchema', () => {
  it('parses comma and repeated list params, flags and numbers', () => {
    const q = parseSearchQuery({
      q: '  care  ',
      type: 'job,course',
      sector: ['digital', 'care-services'],
      free: '1',
      levelMax: '3',
      payMin: '20000',
      near: 'M1 1AE',
      page: '2',
    });
    expect(q).toMatchObject({
      q: 'care',
      type: ['job', 'course'],
      sector: ['digital', 'care-services'],
      free: true,
      levelMax: 3,
      payMin: 20000,
      near: 'M1 1AE',
      page: 2,
    });
  });

  it('drops invalid values instead of failing the whole request', () => {
    const q = parseSearchQuery({
      type: 'job,nonsense',
      radius: 'abc',
      levelMin: '99',
      sort: 'sideways',
      page: '-4',
    });
    expect(q.type).toBeUndefined();
    expect(q.radius).toBeUndefined();
    expect(q.levelMin).toBeUndefined();
    expect(q.sort).toBeUndefined();
    expect(q.page).toBeUndefined();
  });

  it('treats absent params as undefined', () => {
    expect(SearchQuerySchema.parse({})).toEqual({});
  });

  it('round-trips through URL params, omitting defaults', () => {
    const q = parseSearchQuery({ type: 'job', free: '1', sector: 'digital', page: '1' });
    const params = toSearchParams(q);
    // page 1 is the default, so it is omitted from the canonical URL
    expect(params.toString()).toBe('type=job&sector=digital&free=1');
    const { page: _defaultPage, ...canonical } = q;
    expect(parseSearchQuery(Object.fromEntries(params))).toEqual(canonical);
    // and a non-default page survives the round trip
    const page3 = parseSearchQuery({ type: 'job', page: '3' });
    expect(parseSearchQuery(Object.fromEntries(toSearchParams(page3)))).toEqual(page3);
  });

  it('resolves defaults sensibly', () => {
    const centre = { lat: 1, lon: 2, label: 'X' };
    expect(resolveDefaults({}, undefined)).toMatchObject({
      sort: 'newest',
      page: 1,
      pageSize: 20,
      radius: 20,
    });
    expect(resolveDefaults({}, centre).sort).toBe('distance');
    expect(resolveDefaults({ q: 'chef' }, centre).sort).toBe('relevance');
    expect(resolveDefaults({ sort: 'distance' }, undefined).sort).toBe('newest');
  });

  it('counts active filters but not q, sort or paging', () => {
    expect(activeFilterCount(parseSearchQuery({ q: 'x', sort: 'newest', page: '3' }))).toBe(0);
    expect(
      activeFilterCount(parseSearchQuery({ type: 'job', free: '1', levelMin: '2', near: 'Leeds' })),
    ).toBe(4);
  });
});

describe('ProfileSchema', () => {
  it('has safe defaults', () => {
    const p = ProfileSchema.parse({});
    expect(p).toMatchObject({
      highestLevel: 0,
      skills: [],
      budget: 'any',
      values: [],
      doneTimelineIds: [],
    });
    expect(profileCompleteness(p)).toBe(0);
  });

  it('caps values at three and validates ranges', () => {
    expect(
      ProfileSchema.safeParse({ values: ['good-pay', 'helping', 'learning', 'creativity'] })
        .success,
    ).toBe(false);
    expect(ProfileSchema.safeParse({ highestLevel: 12 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ location: { label: 'M1', lat: 200, lon: 0 } }).success).toBe(
      false,
    );
  });

  it('measures completeness', () => {
    const p = ProfileSchema.parse({
      ageBand: '18-21',
      goal: 'explore',
      location: { label: 'M1', lat: 53.48, lon: -2.24 },
      skills: [{ id: 'a', label: 'A' }],
    });
    expect(profileCompleteness(p)).toBeCloseTo(4 / 9);
  });

  it('counts education and experience towards completeness', () => {
    const p = ProfileSchema.parse({
      education: [{ id: 'e1', kind: 'gcse', title: 'Maths and English' }],
      experience: [{ id: 'x1', title: 'Shop assistant' }],
    });
    expect(p.education[0]).toMatchObject({ status: 'completed' });
    expect(p.experience[0]).toMatchObject({ kind: 'job', skills: [] });
    expect(profileCompleteness(p)).toBeCloseTo(3 / 9); // level (via education), education, experience
  });

  it('keeps old stored profiles valid: the new history fields all default to empty', () => {
    const old = ProfileSchema.parse({ highestLevel: 3, skills: [{ id: 'a', label: 'A' }] });
    expect(old).toMatchObject({ education: [], experience: [], achievements: [] });
  });

  it('rejects malformed history entries', () => {
    expect(
      ProfileSchema.safeParse({ education: [{ id: 'e', kind: 'wizardry', title: 'x' }] }).success,
    ).toBe(false);
    expect(
      ProfileSchema.safeParse({ experience: [{ id: 'x', title: 'Cashier', from: '2021-13' }] })
        .success,
    ).toBe(false);
    expect(ProfileSchema.safeParse({ experience: [{ id: 'x', title: '' }] }).success).toBe(false);
  });
});
