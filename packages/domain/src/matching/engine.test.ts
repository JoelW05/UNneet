import { describe, expect, it } from 'vitest';
import { type Profile, ProfileSchema } from '../schemas/profile';
import { rankMatches, scoreCandidate } from './engine';
import { rankSectors } from './sectors';
import type { MatchCandidate } from './types';

const NOW = new Date('2026-10-01T12:00:00Z');
const MANCHESTER = { lat: 53.4808, lon: -2.2426 };

function profile(overrides: Partial<Profile> = {}): Profile {
  return ProfileSchema.parse(overrides);
}

let counter = 0;
function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    type: 'job',
    sector: null,
    level: null,
    minEntryLevel: null,
    skills: [],
    pay: null,
    cost: { kind: 'unknown', amount: null },
    location: { ...MANCHESTER, workMode: 'onsite', label: 'Manchester' },
    minAge: null,
    maxAge: null,
    postedAt: null,
    closesAt: null,
    tags: [],
    experienceRequired: null,
    ...overrides,
  };
}

const withLocation = { location: { label: 'M1', lat: MANCHESTER.lat, lon: MANCHESTER.lon } };

describe('scoreCandidate', () => {
  it('renormalises weights so a sparse profile still produces a sensible score', () => {
    const sparse = scoreCandidate(profile(withLocation), candidate(), NOW);
    // Perfect location (1.0) blended with a neutral unknown-entry-requirement (0.7):
    // (0.14·1 + 0.12·0.7) / (0.14 + 0.12) ≈ 0.86, i.e. weights renormalised over available features.
    expect(sparse.score).toBe(86);
    expect(sparse.confidence).toBe(0.26); // but we know little about them
    expect(Object.keys(sparse.parts)).toEqual(['level', 'location']);
  });

  it('scores nothing (0) when there is no data at all', () => {
    const m = scoreCandidate(profile(), candidate({ minEntryLevel: null }), NOW);
    // only `level` (unknown requirement → neutral 0.7) has data
    expect(m.score).toBe(70);
  });

  it('rewards skill overlap and explains it', () => {
    const p = profile({
      skills: [
        { id: 'customer-service', label: 'Customer service', level: 3 },
        { id: 'teamwork', label: 'Teamwork', level: 2 },
      ],
    });
    const good = scoreCandidate(
      p,
      candidate({
        skills: [
          { id: 'customer-service', label: 'Customer service' },
          { id: 'teamwork', label: 'Teamwork' },
        ],
      }),
      NOW,
    );
    const poor = scoreCandidate(
      p,
      candidate({ skills: [{ id: 'welding', label: 'Welding' }] }),
      NOW,
    );
    expect(good.parts.skills).toBeGreaterThan(poor.parts.skills ?? 1);
    expect(
      good.reasons.some((r) => r.feature === 'skills' && r.text.includes('Customer service')),
    ).toBe(true);
  });

  it('flags a one-level stretch instead of rejecting it', () => {
    const p = profile({ highestLevel: 2 });
    const m = scoreCandidate(p, candidate({ minEntryLevel: 3 }), NOW);
    expect(m.stretch).toBe(true);
    expect(m.eligibility.eligible).toBe(true);
    expect(m.reasons.find((r) => r.feature === 'level')?.tone).toBe('caution');
  });

  it('says so plainly when no qualifications are needed', () => {
    const m = scoreCandidate(profile(), candidate({ minEntryLevel: 0 }), NOW);
    expect(m.reasons.find((r) => r.feature === 'level')?.text).toBe(
      'No qualifications needed to start',
    );
  });

  it('penalises cost for someone who wants free options', () => {
    const p = profile({ budget: 'free-only' });
    const paid = scoreCandidate(
      p,
      candidate({ type: 'course', cost: { kind: 'paid', amount: 1500 } }),
      NOW,
    );
    const free = scoreCandidate(
      p,
      candidate({ type: 'course', cost: { kind: 'free', amount: null } }),
      NOW,
    );
    expect(free.parts.budget).toBe(1);
    expect(paid.parts.budget).toBe(0);
    expect(free.score).toBeGreaterThan(paid.score);
  });

  it('does not apply "budget" to jobs with no cost information', () => {
    const m = scoreCandidate(profile({ budget: 'free-only' }), candidate({ type: 'job' }), NOW);
    expect(m.parts.budget).toBeUndefined();
  });

  it('decays with distance and cautions beyond the travel limit', () => {
    const p = profile({ ...withLocation, maxTravelMiles: 10 });
    const near = scoreCandidate(p, candidate(), NOW);
    const far = scoreCandidate(
      p,
      candidate({ location: { lat: 51.5074, lon: -0.1278, workMode: 'onsite', label: 'London' } }),
      NOW,
    );
    expect(near.parts.location).toBeGreaterThan(far.parts.location ?? 1);
    expect(far.reasons.find((r) => r.feature === 'location')?.tone).toBe('caution');
  });

  it('treats remote and nationwide as accessible from anywhere', () => {
    const p = profile(withLocation);
    const remote = scoreCandidate(
      p,
      candidate({ location: { workMode: 'remote', label: 'Online' } }),
      NOW,
    );
    expect(remote.parts.location).toBe(0.9);
  });

  it('blocks on age and on closed listings', () => {
    const p = profile({ ageBand: '16-17' });
    expect(scoreCandidate(p, candidate({ minAge: 18 }), NOW).eligibility).toEqual({
      eligible: false,
      blockers: ['For ages 18+'],
    });
    expect(
      scoreCandidate(profile({ ageBand: '25+' }), candidate({ maxAge: 24 }), NOW).eligibility
        .eligible,
    ).toBe(false);
    const closed = scoreCandidate(profile(), candidate({ closesAt: '2026-09-01T00:00:00Z' }), NOW);
    expect(closed.eligibility.blockers).toContain('Applications have closed');
  });

  it('derives a default goal from stage', () => {
    const p = profile({ stage: 'uni-year-2' }); // → experience
    const internship = scoreCandidate(p, candidate({ type: 'internship' }), NOW);
    const degree = scoreCandidate(p, candidate({ type: 'degree' }), NOW);
    expect(internship.parts.goal).toBe(1);
    expect(degree.parts.goal).toBe(0.1);
  });

  it('uses interest fit from the RIASEC profile', () => {
    const social = profile({ riasec: { R: 0, I: 0, A: 0, S: 1, E: 0, C: 0 } });
    const care = scoreCandidate(social, candidate({ sector: 'care-services' }), NOW);
    const construction = scoreCandidate(
      social,
      candidate({ sector: 'construction-built-environment' }),
      NOW,
    );
    expect(care.parts.interest).toBeGreaterThan(construction.parts.interest ?? 1);
    expect(care.reasons.some((r) => r.text.startsWith('Fits your interest in helping'))).toBe(true);
    // floor: poor fits are not annihilated
    expect(construction.parts.interest).toBeGreaterThanOrEqual(0.25);
  });

  it('is pure: same inputs, same output', () => {
    const p = profile({ ...withLocation, skills: [{ id: 'a', label: 'A', level: 2 }] });
    const c = candidate({ skills: [{ id: 'a', label: 'A' }] });
    expect(scoreCandidate(p, c, NOW)).toEqual(scoreCandidate(p, c, NOW));
  });
});

describe('rankMatches', () => {
  it('removes ineligible items unless asked to keep them', () => {
    const items = [candidate({ minAge: 18 }), candidate()];
    const p = profile({ ageBand: '16-17' });
    expect(rankMatches(p, items, { now: NOW, limit: 5 })).toHaveLength(1);
    expect(rankMatches(p, items, { now: NOW, limit: 5, includeIneligible: true })).toHaveLength(2);
  });

  it('diversifies across sectors instead of returning one sector wall-to-wall', () => {
    const fresh = '2026-09-30T00:00:00Z';
    const old = '2026-09-01T00:00:00Z';
    const care = Array.from({ length: 6 }, () =>
      candidate({ sector: 'care-services', postedAt: fresh }),
    );
    const hospitality = Array.from({ length: 3 }, () =>
      candidate({ sector: 'catering-hospitality', postedAt: old }),
    );
    const ranked = rankMatches(profile(withLocation), [...care, ...hospitality], {
      now: NOW,
      limit: 4,
      exploreShare: 0,
      relevanceWeight: 0.5,
    });
    const distinct = new Set(ranked.map((m) => m.item.sector));
    expect(ranked).toHaveLength(4);
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  it('adds flagged "explore" picks from outside the sectors someone leans towards', () => {
    const p = profile({ ...withLocation, sectorsInterested: ['care-services'] });
    const items = [
      ...Array.from({ length: 8 }, () => candidate({ sector: 'care-services' })),
      candidate({ sector: 'digital' }),
      candidate({ sector: 'construction-built-environment' }),
    ];
    const ranked = rankMatches(p, items, { now: NOW, limit: 10, exploreShare: 0.2 });
    const explore = ranked.filter((m) => m.explore);
    expect(explore.length).toBeGreaterThanOrEqual(1);
    for (const m of explore) {
      expect(m.item.sector).not.toBe('care-services');
      expect(m.reasons[0]?.feature).toBe('explore');
    }
  });

  it('is deterministic and breaks ties by id', () => {
    const items = Array.from({ length: 5 }, () => candidate());
    const a = rankMatches(profile(), items, { now: NOW, limit: 5 }).map((m) => m.item.id);
    const b = rankMatches(profile(), [...items].reverse(), { now: NOW, limit: 5 }).map(
      (m) => m.item.id,
    );
    expect(a).toEqual(b);
  });

  it('returns an empty list for no candidates', () => {
    expect(rankMatches(profile(), [], { now: NOW })).toEqual([]);
  });
});

describe('rankSectors', () => {
  it('always returns all 15 sectors', () => {
    expect(rankSectors(profile())).toHaveLength(15);
  });

  it('ranks a chosen sector first when nothing else is known', () => {
    expect(rankSectors(profile({ sectorsInterested: ['digital'] }))[0]?.sector).toBe('digital');
  });

  it('combines interests and values', () => {
    const ranked = rankSectors(
      profile({ riasec: { R: 0, I: 0, A: 0, S: 1, E: 0, C: 0 }, values: ['helping'] }),
    );
    expect(['care-services', 'education-early-years', 'health-science']).toContain(
      ranked[0]?.sector,
    );
    expect(ranked[0]?.signals).toContain('interest');
  });
});
