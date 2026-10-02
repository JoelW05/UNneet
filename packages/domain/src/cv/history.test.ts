import { describe, expect, it } from 'vitest';
import {
  extractHistory,
  headingSection,
  parseDateRange,
  splitTitleAndOrganisation,
} from './history';

const NOW = new Date('2026-10-01T12:00:00Z');

const SCHOOL_LEAVER = `
Jamie Smith
jamie@example.com   07700 900123

Profile
Reliable and friendly school leaver looking for a first full-time job.

Education
Leeds City Academy, 2019 - 2024
GCSEs: Maths grade 5, English grade 4, Science grade 4
BTEC Level 2 in Sport (2024)

Work experience
Shop assistant, Spar, Leeds                 Jun 2023 – Present
- Served customers and used the till
- Restocked shelves
Work experience placement, Brightway Care Home      July 2022 - July 2022

Volunteering
Charity shop volunteer, British Heart Foundation   2022 - 2023

Skills
Customer service, teamwork, first aid
`;

const ADULT = `
EMPLOYMENT HISTORY
Care Assistant – Sunrise Care Home, Bradford
March 2021 – Present
• Supported 12 residents with personal care and meals
• Kept accurate daily records

Kitchen Porter | The Crown Pub | 2018 – 2020
Washed up and prepared basic food for service

QUALIFICATIONS
NVQ Level 2 Health and Social Care (2022)
GCSE English & Maths (2017)
`;

const GRADUATE = `
Education
BSc (Hons) Computer Science, University of Leeds, 2021 – 2024 (2:1)
A levels: Maths (A), Physics (B), Computing (A) - Leeds Sixth Form College, 2019 - 2021

Experience
Software Engineering Intern, Acme Ltd, Jul 2023 – Sep 2023
- Built a small internal tool in Python
Bar staff - The Union, Sept 2021 - Present
`;

describe('headingSection', () => {
  it.each([
    ['Education', 'education'],
    ['WORK EXPERIENCE', 'experience'],
    ['Employment History:', 'experience'],
    ['Education & Training', 'education'],
    ['Skills and interests', 'skills'],
    ['Volunteering', 'volunteering'],
    ['Personal Statement', 'profile'],
    ['References', 'references'],
  ] as const)('%s → %s', (line, section) => {
    expect(headingSection(line)).toBe(section);
  });

  it('does not mistake sentences or dated lines for headings', () => {
    expect(headingSection('Experience working with children in a nursery setting')).toBeNull();
    expect(headingSection('Work at Tesco 2020 - 2021')).toBeNull();
    expect(headingSection('I have good experience.')).toBeNull();
    expect(headingSection('')).toBeNull();
  });
});

describe('parseDateRange', () => {
  it('reads month-year, year-only, numeric and ongoing ranges', () => {
    expect(parseDateRange('Jun 2023 – Present', NOW)).toMatchObject({ from: '2023-06', to: null });
    expect(parseDateRange('2018 - 2020', NOW)).toMatchObject({ from: '2018-01', to: '2020-12' });
    expect(parseDateRange('03/2021 to 09/2022', NOW)).toMatchObject({
      from: '2021-03',
      to: '2022-09',
    });
    expect(parseDateRange('September 2019 until July 2021', NOW)).toMatchObject({
      from: '2019-09',
      to: '2021-07',
    });
    expect(parseDateRange('Mar 2021 – current', NOW)).toMatchObject({ to: null });
  });
  it('never runs past today when only a year is given, and rejects backwards ranges', () => {
    expect(parseDateRange('2024 - 2026', NOW)?.to).toBe('2026-10');
    expect(parseDateRange('2022 - 2020', NOW)).toBeNull();
    expect(parseDateRange('no dates here', NOW)).toBeNull();
  });
});

describe('splitTitleAndOrganisation', () => {
  it.each([
    ['Care Assistant – Sunrise Care Home, Bradford', 'Care Assistant', 'Sunrise Care Home'],
    ['Kitchen Porter | The Crown Pub', 'Kitchen Porter', 'The Crown Pub'],
    ['Barista at Costa', 'Barista', 'Costa'],
    ['Tesco | Cashier', 'Cashier', 'Tesco'],
    ['Shop assistant, Spar, Leeds', 'Shop assistant', 'Spar'],
  ] as const)('%s', (input, title, organisation) => {
    expect(splitTitleAndOrganisation(input)).toEqual({ title, organisation });
  });
  it('copes with a lone title', () => {
    expect(splitTitleAndOrganisation('Volunteer')).toEqual({ title: 'Volunteer' });
  });
});

describe('extractHistory: a school leaver', () => {
  const h = extractHistory(SCHOOL_LEAVER, NOW);

  it('finds the sections', () => {
    expect(h.sections).toEqual(['profile', 'education', 'experience', 'volunteering', 'skills']);
  });

  it('drafts education with kind, provider, grade and year', () => {
    const gcse = h.education.find((e) => e.kind === 'gcse');
    expect(gcse).toMatchObject({ status: 'completed' });
    expect(gcse?.provider).toBe('Leeds City Academy');
    expect(gcse?.title).toContain('GCSEs');
    expect(h.education.find((e) => e.kind === 'btec')).toMatchObject({
      year: 2024,
      status: 'completed',
    });
  });

  it('drafts experience with dates, the kind of role, and what they did', () => {
    const shop = h.experience.find((e) => /shop assistant/i.test(e.title));
    expect(shop).toMatchObject({ kind: 'job', organisation: 'Spar', from: '2023-06', to: null });
    expect(shop?.description).toContain('Served customers');
    expect(h.experience.find((e) => e.kind === 'volunteering')).toMatchObject({
      organisation: 'British Heart Foundation',
      from: '2022-01',
      to: '2023-12',
    });
    expect(h.experience.find((e) => e.kind === 'work-experience')?.title).toMatch(
      /work experience/i,
    );
  });

  it('never returns contact details', () => {
    const json = JSON.stringify(h);
    expect(json).not.toContain('jamie@example.com');
    expect(json).not.toContain('07700');
    expect(json).not.toContain('Jamie Smith');
  });
});

describe('extractHistory: an adult with dates on their own line', () => {
  const h = extractHistory(ADULT, NOW);
  it('uses the line above when the dates stand alone', () => {
    expect(h.experience[0]).toMatchObject({
      title: 'Care Assistant',
      organisation: 'Sunrise Care Home',
      from: '2021-03',
      to: null,
    });
    expect(h.experience[0]?.description).toContain('Supported 12 residents');
  });
  it('reads a pipe-separated line, and the qualifications section', () => {
    expect(h.experience[1]).toMatchObject({
      title: 'Kitchen Porter',
      organisation: 'The Crown Pub',
      from: '2018-01',
      to: '2020-12',
    });
    expect(h.education.map((e) => e.kind)).toEqual(['nvq', 'gcse']);
    expect(h.education[0]).toMatchObject({ year: 2022, status: 'completed' });
  });
});

describe('extractHistory: a graduate', () => {
  const h = extractHistory(GRADUATE, NOW);
  it('reads a degree with its class and university, and A levels with their college', () => {
    const degree = h.education.find((e) => e.kind === 'degree');
    expect(degree).toMatchObject({
      provider: 'University of Leeds',
      grade: '2:1',
      status: 'completed',
    });
    const alevel = h.education.find((e) => e.kind === 'a-level');
    expect(alevel).toMatchObject({ year: 2021 });
    expect(alevel?.provider).toContain('Leeds Sixth Form College');
  });
  it('classes an internship as work experience and keeps an ongoing job open', () => {
    expect(h.experience.find((e) => /intern/i.test(e.title))?.kind).toBe('work-experience');
    expect(h.experience.find((e) => /bar staff/i.test(e.title))).toMatchObject({
      to: null,
      from: '2021-09',
    });
  });
});

describe('extractHistory: robustness', () => {
  it('returns nothing for empty or date-free text', () => {
    expect(extractHistory('', NOW)).toEqual({ education: [], experience: [], sections: [] });
    const h = extractHistory('I like helping people and I am keen to learn.', NOW);
    expect(h.education).toEqual([]);
    expect(h.experience).toEqual([]);
  });

  it('does not treat a dated education line as a job', () => {
    const h = extractHistory('Education\nA levels: Maths, Biology 2019 - 2021\n', NOW);
    expect(h.experience).toEqual([]);
    expect(h.education).toHaveLength(1);
  });

  it('does not duplicate repeated qualification lines', () => {
    const h = extractHistory('Education\nGCSEs (2021)\nGCSEs (2021)\n', NOW);
    expect(h.education).toHaveLength(1);
  });

  it('marks a course that has not finished as studying', () => {
    const h = extractHistory(
      'Education\nBSc Nursing, University of Bradford, 2024 - Present\n',
      NOW,
    );
    expect(h.education[0]).toMatchObject({ kind: 'degree', status: 'studying' });
  });

  it('attaches skills found in an experience description when given a matcher', () => {
    const matcher = {
      size: 1,
      extract: () => [{ id: 'teamwork', label: 'Teamwork', mentions: 1, evidence: 'team' }],
    };
    const h = extractHistory(
      'Experience\nWaiter, Cafe Roma, 2022 - 2023\n- Worked in a team\n',
      NOW,
      matcher,
    );
    expect(h.experience[0]?.skills).toEqual([{ id: 'teamwork', label: 'Teamwork' }]);
  });

  it('is bounded: huge input cannot produce an unbounded list', () => {
    const lines = Array.from(
      { length: 200 },
      (_, i) => `Cashier, Shop ${i}, 20${10 + (i % 10)} - 20${11 + (i % 10)}\n- did things`,
    ).join('\n');
    const h = extractHistory(`Experience\n${lines}`, NOW);
    expect(h.experience.length).toBeLessThanOrEqual(12);
  });
});
