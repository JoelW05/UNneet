import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type Profile, ProfileSchema } from '../schemas/profile';
import { NO_REQUIREMENTS, type Requirements } from '../schemas/requirements';
import { assessFit, FIT_LABEL, type FitListing, hasProfileData } from './assess';

const NOW = new Date('2026-10-01T12:00:00Z');

const profile = (p: Record<string, unknown> = {}): Profile => ProfileSchema.parse(p);

const req = (over: Partial<Requirements> = {}): Requirements => ({
  ...NO_REQUIREMENTS,
  stated: true,
  ...over,
});

const listing = (over: Partial<FitListing> = {}): FitListing => ({
  minEntryLevel: null,
  minAge: null,
  maxAge: null,
  experienceRequired: null,
  skills: [],
  requirements: req(),
  ...over,
});

const status = (fit: ReturnType<typeof assessFit>, id: string) =>
  fit.checks.find((c) => c.id === id)?.status;

// A school leaver: GCSEs, a Saturday job, 16-17.
const teen = profile({
  ageBand: '16-17',
  education: [{ id: 'e1', kind: 'gcse', title: 'GCSEs', status: 'completed', year: 2026 }],
  experience: [{ id: 'x1', kind: 'job', title: 'Shop assistant', from: '2026-01', to: null }],
});

describe('no profile, no verdict', () => {
  it('asks the person to add what they have done, rather than guessing', () => {
    const fit = assessFit(EMPTY_PROFILE, listing({ minEntryLevel: 2 }), NOW);
    expect(fit).toMatchObject({ light: 'unknown', score: null, reason: 'no-profile' });
    expect(fit.headline).toMatch(/add what you have done/i);
    expect(hasProfileData(EMPTY_PROFILE)).toBe(false);
    expect(hasProfileData(teen)).toBe(true);
  });

  it('says so when the advert does not state what it needs', () => {
    const fit = assessFit(teen, listing({ requirements: NO_REQUIREMENTS }), NOW);
    expect(fit).toMatchObject({ light: 'unknown', reason: 'no-requirements' });
  });
});

describe('the traffic light', () => {
  it('green: meets everything the advert asks for', () => {
    const fit = assessFit(
      teen,
      listing({ minEntryLevel: 2, experienceRequired: false, requirements: req({ minLevel: 2 }) }),
      NOW,
    );
    expect(fit.light).toBe('green');
    expect(fit.score).toBe(100);
    expect(fit.headline).toMatch(/good fit/i);
  });

  it('red: a senior role with a degree is a stretch for a school leaver, with reasons for both gaps', () => {
    const fit = assessFit(
      teen,
      listing({
        minEntryLevel: 6,
        experienceRequired: true,
        requirements: req({
          minLevel: 6,
          seniority: 'senior',
          experience: { required: true, years: null, basis: 'title', evidence: 'senior' },
        }),
      }),
      NOW,
    );
    expect(fit.light).toBe('red');
    expect(status(fit, 'level')).toBe('gap');
    expect(status(fit, 'experience')).toBe('gap');
    expect(fit.checks.find((c) => c.id === 'experience')?.detail).toMatch(/senior role/i);
    expect(fit.headline).toMatch(/stretch/i);
  });

  it('amber: one level short is close, not a gap', () => {
    const a = profile({
      education: [{ id: 'a', kind: 'a-level', title: 'A levels', status: 'completed' }],
    });
    const fit = assessFit(a, listing({ minEntryLevel: 4, experienceRequired: false }), NOW);
    expect(status(fit, 'level')).toBe('close');
    expect(fit.light).toBe('amber');
  });

  it('amber, not red, when the advert accepts equivalents', () => {
    const fit = assessFit(
      teen,
      listing({
        minEntryLevel: 6,
        experienceRequired: false,
        requirements: req({ minLevel: 6, equivalentAccepted: true }),
      }),
      NOW,
    );
    expect(status(fit, 'level')).toBe('close');
    expect(fit.checks[0]?.detail).toMatch(/equivalents/);
    expect(fit.light).toBe('amber');
  });

  it('is generous to someone working towards the level asked for', () => {
    const p = profile({
      education: [
        { id: 'a', kind: 'a-level', title: 'A levels', status: 'completed' },
        { id: 'b', kind: 'degree', title: 'BSc Computing', status: 'studying' },
      ],
    });
    const fit = assessFit(p, listing({ minEntryLevel: 6, experienceRequired: false }), NOW);
    expect(status(fit, 'level')).toBe('close');
    expect(fit.checks[0]?.detail).toMatch(/working towards/);
  });

  it('counts completed qualifications from the education history, not just the stated level', () => {
    const p = profile({
      education: [{ id: 'd', kind: 'degree', title: 'BA History', status: 'completed' }],
    });
    expect(
      status(assessFit(p, listing({ minEntryLevel: 6, experienceRequired: false }), NOW), 'level'),
    ).toBe('meets');
  });
});

describe('experience', () => {
  const work = (years: number) =>
    profile({
      ageBand: '22-24',
      experience: [
        { id: 'x', kind: 'job', title: 'Barista', from: `${2026 - years}-10`, to: null },
      ],
    });
  const asks = (years: number | null, basis: 'text' | 'title' = 'text') =>
    listing({
      experienceRequired: true,
      requirements: req({ experience: { required: true, years, basis, evidence: null } }),
    });

  it('meets when you have at least the years asked for', () => {
    expect(status(assessFit(work(3), asks(3), NOW), 'experience')).toBe('meets');
  });
  it('is close with most of the years', () => {
    expect(status(assessFit(work(2), asks(3), NOW), 'experience')).toBe('close');
  });
  it('is a gap with well under half', () => {
    const fit = assessFit(work(1), asks(5), NOW);
    expect(status(fit, 'experience')).toBe('gap');
    expect(fit.light).toBe('red');
  });
  it('treats a senior title as needing several years when the advert gives none', () => {
    const fit = assessFit(work(1), asks(null, 'title'), NOW);
    expect(status(fit, 'experience')).toBe('gap');
    expect(fit.checks.find((c) => c.id === 'experience')?.detail).toMatch(
      /usually expect several years/,
    );
  });
  it('is unknown (not counted) when the advert does not say', () => {
    const fit = assessFit(teen, listing({ minEntryLevel: 2 }), NOW);
    expect(status(fit, 'experience')).toBe('unknown');
    expect(fit.light).toBe('green');
  });
  it('encourages adding experience that counts', () => {
    const fit = assessFit(profile({ ageBand: '18-21' }), asks(null), NOW);
    expect(fit.checks.find((c) => c.id === 'experience')?.detail).toMatch(
      /Part-time work, volunteering/,
    );
  });
});

describe('age', () => {
  it.each([
    ['16-17', 18, null, 'gap'],
    ['16-17', 17, null, 'close'],
    ['18-21', 18, null, 'meets'],
    ['25+', null, 24, 'gap'],
    ['18-21', null, 19, 'close'],
    ['22-24', null, 24, 'meets'],
    ['18-21', null, 24, 'meets'],
  ] as const)('band %s, min %s, max %s => %s', (band, minAge, maxAge, expected) => {
    const fit = assessFit(
      profile({ ageBand: band }),
      listing({ minAge, maxAge, experienceRequired: false }),
      NOW,
    );
    expect(status(fit, 'age')).toBe(expected);
    if (expected === 'gap') expect(fit.light).toBe('red');
  });

  it('ignores age when the person has not given a band', () => {
    const fit = assessFit(
      profile({ education: teen.education }),
      listing({ minAge: 18, experienceRequired: false }),
      NOW,
    );
    expect(status(fit, 'age')).toBeUndefined();
  });
});

describe('skills are a soft signal', () => {
  const skills = [
    { id: 'a', label: 'Customer service' },
    { id: 'b', label: 'Teamwork' },
    { id: 'c', label: 'Excel' },
    { id: 'd', label: 'First aid' },
  ];
  const withSkills = (ids: string[]) =>
    profile({
      ...teen,
      skills: ids.map((id) => ({ id, label: id, level: 2 })),
    });

  it('can move green to amber but never to red', () => {
    const fit = assessFit(
      withSkills(['zzz']),
      listing({ minEntryLevel: 2, experienceRequired: false, skills }),
      NOW,
    );
    expect(status(fit, 'skills')).toBe('gap');
    expect(fit.light).toBe('amber');
  });

  it('is green when you have most of the skills', () => {
    const fit = assessFit(
      withSkills(['a', 'b', 'c']),
      listing({ minEntryLevel: 2, experienceRequired: false, skills }),
      NOW,
    );
    expect(status(fit, 'skills')).toBe('meets');
    expect(fit.light).toBe('green');
  });

  it('is skipped when the advert names fewer than three or you listed none', () => {
    expect(
      status(assessFit(withSkills(['a']), listing({ skills: skills.slice(0, 2) }), NOW), 'skills'),
    ).toBeUndefined();
    expect(status(assessFit(teen, listing({ skills }), NOW), 'skills')).toBeUndefined();
  });
});

describe('driving licence', () => {
  const needsLicence = listing({
    experienceRequired: false,
    requirements: req({
      items: [{ kind: 'check', text: 'Full driving licence', essential: true }],
    }),
  });
  it('is a hard gap when asked for and you have said you have none', () => {
    const fit = assessFit(profile({ ...teen, drivingLicence: false }), needsLicence, NOW);
    expect(status(fit, 'licence')).toBe('gap');
    expect(fit.light).toBe('red');
  });
  it('meets when you hold one, and is left out when you have not said', () => {
    expect(
      status(assessFit(profile({ ...teen, drivingLicence: true }), needsLicence, NOW), 'licence'),
    ).toBe('meets');
    expect(status(assessFit(teen, needsLicence, NOW), 'licence')).toBeUndefined();
  });
});

describe('score and wording', () => {
  it('stays between 0 and 100 and falls as gaps appear', () => {
    // Same person throughout: GCSEs and no work history yet.
    const p = profile({ ageBand: '16-17', education: teen.education });
    const good = assessFit(p, listing({ minEntryLevel: 2, experienceRequired: false }), NOW)
      .score as number;
    const worse = assessFit(p, listing({ minEntryLevel: 4, experienceRequired: false }), NOW)
      .score as number;
    const worst = assessFit(p, listing({ minEntryLevel: 6, experienceRequired: true }), NOW)
      .score as number;
    expect(good).toBe(100);
    expect(worse).toBeLessThan(good);
    expect(worst).toBeLessThan(worse);
    expect(worst).toBeGreaterThanOrEqual(0);
  });

  it('never promises a job, and every label is plain', () => {
    expect(FIT_LABEL).toEqual({
      green: 'Good fit',
      amber: 'Possible fit',
      red: 'A stretch',
      unknown: 'Not sure yet',
    });
    const all = assessFit(teen, listing({ minEntryLevel: 6, experienceRequired: true }), NOW);
    const text = JSON.stringify(all);
    expect(text).not.toMatch(/will get|guarantee|chance of|likelihood|probability|reject/i);
  });
});
