import { describe, expect, it } from 'vitest';
import { extractFromCv } from '../skills/cv';
import { buildSkillMatcher, type SkillDef } from '../skills/matcher';
import { compareToJob, requiredYearsOf } from './fit';
import { extractHistory } from './history';
import { reviewCv } from './review';

const NOW = new Date('2026-10-01T12:00:00Z');

const defs: SkillDef[] = [
  {
    id: 'customer-service',
    label: 'Customer service',
    category: 'people',
    aliases: ['customer care', 'serving customers', 'served customers'],
  },
  {
    id: 'teamwork',
    label: 'Teamwork',
    category: 'people',
    aliases: ['team work', 'working in a team', 'team player'],
  },
  {
    id: 'excel',
    label: 'Microsoft Excel',
    category: 'digital',
    aliases: ['excel', 'spreadsheets'],
  },
  { id: 'first-aid', label: 'First aid', category: 'care', aliases: ['first aid', 'first-aid'] },
  {
    id: 'cash-handling',
    label: 'Cash handling',
    category: 'practical',
    aliases: ['till', 'cash handling', 'handling cash'],
  },
  {
    id: 'driving-licence',
    label: 'Driving licence',
    category: 'practical',
    aliases: ['driving licence', 'driving license'],
  },
  { id: 'python', label: 'Python', category: 'digital', aliases: ['python'] },
];
const matcher = buildSkillMatcher(defs);

function review(text: string) {
  const extraction = extractFromCv(text, matcher, NOW);
  const history = extractHistory(text, NOW, matcher);
  return reviewCv(text, extraction, history, NOW);
}

const GOOD_CV = `
Alex Morgan
alex.morgan@example.com | 07700 900456

Profile
Friendly, reliable school leaver with retail and volunteering experience, looking for a first role in care.

Education
Leeds City Academy, 2019 - 2024
GCSE Maths grade 5, GCSE English grade 5, GCSE Science grade 4
BTEC Level 2 in Health and Social Care (2024)

Experience
Shop assistant, Spar, Leeds   Jun 2023 – Present
- Served around 80 customers a shift and operated the till
- Restocked shelves and kept the store tidy
- Trained 2 new starters in a team of 6

Volunteering
Charity shop volunteer, British Heart Foundation   2022 - 2023
- Sorted donations and helped customers every Saturday
- Raised £250 at a summer fair

Skills
Customer service, teamwork, Microsoft Excel, first aid, full driving licence
${'Reliable and friendly with a good sense of humour who enjoys helping people and learning new things every day. '.repeat(3)}
`;

const WEAK_CV = `
I am a hard working team player and a fast learner.
I like computers. I am good at lots of things.
Date of birth: 12/05/2008
References available on request
`;

describe('reviewCv: a good CV', () => {
  const r = review(GOOD_CV);

  it('celebrates what is working', () => {
    const ids = r.strengths.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'contact',
        'section-education',
        'section-profile',
        'section-skills',
        'numbers',
        'action-verbs',
        'volunteering',
        'dated',
      ]),
    );
  });

  it('only has small things left to fix, and no high priorities', () => {
    expect(r.improvements.filter((i) => i.priority === 'high')).toEqual([]);
    expect(r.headline).toMatch(/foundations|strong|basics/i);
  });

  it('reports honest stats', () => {
    expect(r.stats.experienceEntries).toBe(2);
    expect(r.stats.educationEntries).toBeGreaterThanOrEqual(2);
    expect(r.stats.numbersInExperience).toBeGreaterThanOrEqual(3);
    expect(r.stats.actionVerbShare).toBeGreaterThanOrEqual(0.6);
  });
});

describe('reviewCv: a weak CV', () => {
  const r = review(WEAK_CV);
  const ids = r.improvements.map((i) => i.id);

  it('finds the important problems first', () => {
    expect(ids).toEqual(
      expect.arrayContaining(['contact-email', 'length-short', 'section-education']),
    );
    expect(r.improvements[0]?.priority).toBe('high');
    const priorities = r.improvements.map((i) => i.priority);
    expect(priorities).toEqual(
      [...priorities].sort(
        (a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b),
      ),
    );
  });

  it('flags personal details to remove, cliches, and the references line', () => {
    expect(ids).toEqual(expect.arrayContaining(['remove-personal', 'cliches', 'references-line']));
    expect(r.improvements.find((i) => i.id === 'remove-personal')?.detail).toContain(
      'date of birth',
    );
  });

  it('gives every finding a plain explanation and a fix', () => {
    for (const f of r.improvements) {
      expect(f.title.length).toBeGreaterThan(5);
      expect(f.detail.length).toBeGreaterThan(20);
      expect(f.fix?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('never repeats the personal details it noticed back in a fix', () => {
    const json = JSON.stringify(r);
    expect(json).not.toContain('12/05/2008');
  });
});

describe('reviewCv: gaps and basics', () => {
  it('suggests a one-line explanation for a gap in dated history, without judgement', () => {
    const text = `Experience
Cashier, Shop A, Jan 2020 - Jun 2021
- Used the till
Waiter, Cafe B, Sep 2022 - Dec 2023
- Served customers
Education
GCSEs (2019)
alex@example.com 07700 900456
`;
    const r = review(text);
    const gap = r.improvements.find((i) => i.id.startsWith('gap-'));
    expect(gap?.detail).toContain('Jul 2021');
    expect(gap?.fix).toMatch(/honest/);
    expect(gap?.detail).not.toMatch(/should have|fail|lazy/i);
  });

  it('never returns the e-mail or phone number it detected', () => {
    const r = review('alex.secret@example.com\n07700 900456\nSome text about retail work.');
    expect(JSON.stringify(r)).not.toContain('alex.secret');
    expect(JSON.stringify(r)).not.toContain('07700');
  });

  it('is happy when there is a current activity', () => {
    const r = review('Experience\nBarista, Costa, Mar 2024 - Present\n- Made drinks\n');
    expect(r.strengths.map((s) => s.id)).toContain('current');
  });
});

describe('compareToJob', () => {
  const cv = [
    { id: 'customer-service', label: 'Customer service' },
    { id: 'teamwork', label: 'Teamwork' },
    { id: 'first-aid', label: 'First aid' },
  ];
  const job = `Care assistant. We need someone with customer care experience and working in a team.
You must hold a current first aid certificate and a full driving licence. Minimum 2 years experience.
GCSEs at grade 4 or above including Maths and English.`;

  const fit = compareToJob({ cvSkills: cv, jobText: job, matcher, haveLevel: 2, haveYears: 1 });

  it("splits the job's skills into the ones you have and the ones you do not", () => {
    expect(fit.matched.map((s) => s.id).sort()).toEqual([
      'customer-service',
      'first-aid',
      'teamwork',
    ]);
    expect(fit.missing.map((s) => s.id)).toEqual(['driving-licence']);
    expect(fit.coverage).toBe(0.75);
    expect(fit.verdict).toMatch(/strong match/i);
  });

  it('reads the level and years a job asks for', () => {
    expect(fit.level).toEqual({ required: 2, have: 2, status: 'meets' });
    expect(fit.experience).toEqual({ requiredYears: 2, haveYears: 1, status: 'below' });
    expect(requiredYearsOf('5+ years of relevant experience')).toBe(5);
    expect(requiredYearsOf('no experience needed')).toBeNull();
  });

  it('gives honest, encouraging tips and never tells anyone to claim a skill', () => {
    const tips = fit.tips.join('\n');
    expect(tips).toMatch(/driving licence/i);
    expect(tips).toMatch(/If you have really used it/);
    expect(tips).toMatch(/Many people apply when they meet most/);
    expect(tips).not.toMatch(/add (it|them) anyway|pretend|lie/i);
  });

  it('frames a poor match as a stretch', () => {
    const stretch = compareToJob({
      cvSkills: [],
      jobText: 'We need excel, python and first aid.',
      matcher,
      haveLevel: 0,
      haveYears: null,
    });
    expect(stretch.coverage).toBe(0);
    expect(stretch.verdict).toMatch(/stretch/i);
  });

  it('says so when it cannot find any skills to compare', () => {
    const none = compareToJob({
      cvSkills: cv,
      jobText: 'Join our friendly team.',
      matcher,
      haveLevel: 2,
      haveYears: 1,
    });
    expect(none.coverage).toBeNull();
    expect(none.verdict).toMatch(/could not spot/i);
  });

  it('notes a level shortfall with the "or equivalent" route', () => {
    const f = compareToJob({
      cvSkills: cv,
      jobText: 'You need a degree.',
      matcher,
      haveLevel: 2,
      haveYears: null,
    });
    expect(f.level.status).toBe('below');
    expect(f.tips.join(' ')).toMatch(/or equivalent/);
  });
});
