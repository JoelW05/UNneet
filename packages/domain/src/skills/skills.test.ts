import { describe, expect, it } from 'vitest';
import { classifySector } from '../classify/sector';
import {
  estimateYearsExperience,
  extractFromCv,
  extractJobTitles,
  extractQualifications,
} from './cv';
import { buildSkillMatcher, type SkillDef, tokenise } from './matcher';

const defs: SkillDef[] = [
  {
    id: 'customer-service',
    label: 'Customer service',
    category: 'people',
    aliases: ['customer care', 'dealing with customers'],
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
  { id: 'cpp', label: 'C++', category: 'digital', aliases: [] },
  { id: 'first-aid', label: 'First aid', category: 'care', aliases: ['first aider'] },
];
const matcher = buildSkillMatcher(defs);

describe('tokenise', () => {
  it('lower-cases, strips punctuation and stems plurals', () => {
    expect(tokenise('Dealing with Customers, daily!')).toEqual([
      'dealing',
      'with',
      'customer',
      'daily',
    ]);
  });

  it('keeps symbol-bearing skill names', () => {
    expect(tokenise('Knows C++ and node.js')).toEqual(['know', 'c++', 'and', 'node.js']);
  });

  it('does not mangle words ending in ss or short words', () => {
    expect(tokenise('process bus class')).toEqual(['process', 'bus', 'class']);
  });
});

describe('skill matcher', () => {
  it('finds skills by label and alias and counts mentions', () => {
    const found = matcher.extract(
      'I worked in customer service and enjoyed working in a team. Customer care is important to me.',
    );
    const byId = Object.fromEntries(found.map((s) => [s.id, s]));
    expect(byId['customer-service']?.mentions).toBe(2);
    expect(byId.teamwork?.mentions).toBe(1);
    expect(byId.excel).toBeUndefined();
  });

  it('shows the original wording as evidence, not the stemmed form', () => {
    const [skill] = matcher.extract('Strong at dealing with customers');
    expect(skill?.evidence).toBe('dealing with customers');
  });

  it('prefers the longest match', () => {
    const m = buildSkillMatcher([
      { id: 'a', label: 'Customer', category: 'people', aliases: [] },
      { id: 'b', label: 'Customer service', category: 'people', aliases: [] },
    ]);
    expect(m.extract('customer service').map((s) => s.id)).toEqual(['b']);
  });

  it('matches plural and symbol forms', () => {
    expect(
      matcher
        .extract('Built spreadsheets and some C++')
        .map((s) => s.id)
        .sort(),
    ).toEqual(['cpp', 'excel']);
  });

  it('returns nothing for unrelated text', () => {
    expect(matcher.extract('The weather in Leeds is grey.')).toEqual([]);
    expect(matcher.extract('')).toEqual([]);
  });
});

describe('qualifications', () => {
  it('finds the highest level mentioned', () => {
    const q = extractQualifications(
      'GCSEs in Maths and English. BTEC Level 3 Diploma in Sport. 2 A levels.',
    );
    expect(q.highestLevel).toBe(3);
    expect(q.found.map((f) => f.level)).toEqual([3, 2]);
  });

  it('recognises degrees and postgraduate study', () => {
    expect(extractQualifications('BSc (Hons) Computer Science').highestLevel).toBe(6);
    expect(extractQualifications("Master's degree in History").highestLevel).toBe(7);
    expect(extractQualifications('Foundation degree in Childcare').highestLevel).toBe(5);
    expect(extractQualifications('HND Engineering').highestLevel).toBe(5);
  });

  it('returns 0 when nothing is recognised', () => {
    expect(extractQualifications('Keen worker, reliable').highestLevel).toBe(0);
  });
});

describe('job titles', () => {
  it('picks title-like lines and ignores sentences and contact details', () => {
    const text = [
      'jane@example.com',
      'Sales Assistant – Tesco',
      '• Barista',
      'Responsible for helping customers and stock control in a busy store environment daily',
      'Phone: 07123456789',
    ].join('\n');
    expect(extractJobTitles(text)).toEqual(['Sales Assistant', 'Barista']);
  });
});

describe('years of experience', () => {
  const now = new Date('2026-10-01T00:00:00Z');

  it('merges overlapping ranges and handles "present"', () => {
    expect(
      estimateYearsExperience('Sep 2019 – Mar 2022 Sales assistant\n2021 - present Barista', now),
    ).toBe(7);
  });

  it('returns null when no date ranges are present', () => {
    expect(estimateYearsExperience('No dates here', now)).toBeNull();
  });

  it('ignores impossible ranges', () => {
    expect(estimateYearsExperience('2030 - 2020', now)).toBeNull();
  });
});

describe('extractFromCv', () => {
  it('assembles a draft profile and never returns contact details', () => {
    const cv = `Jane Doe\njane@example.com 07123 456789\nSales Assistant\n2020 - 2023\nGood at customer service and working in a team.\nGCSEs in Maths and English`;
    const result = extractFromCv(cv, matcher, new Date('2026-10-01T00:00:00Z'));
    expect(result.skills.map((s) => s.id).sort()).toEqual(['customer-service', 'teamwork']);
    expect(result.qualifications.highestLevel).toBe(2);
    expect(result.jobTitles).toContain('Sales Assistant');
    expect(JSON.stringify(result)).not.toContain('jane@example.com');
    expect(JSON.stringify(result)).not.toContain('07123');
  });
});

describe('classifySector', () => {
  it('classifies clear titles', () => {
    expect(classifySector('Care Assistant', 'Support adults in residential care').sector).toBe(
      'care-services',
    );
    expect(classifySector('Warehouse Operative').sector).toBe('transport-logistics');
    expect(classifySector('Barista').sector).toBe('catering-hospitality');
    expect(classifySector('Junior Web Developer').sector).toBe('digital');
  });

  it('abstains when evidence is weak', () => {
    expect(classifySector('Operations assistant', 'A varied role').sector).toBeNull();
  });

  it('can use the description when the title is vague', () => {
    const g = classifySector(
      'Team member',
      'Work in our kitchen as a cook alongside our chef in the restaurant',
    );
    expect(g.sector).toBe('catering-hospitality');
  });
});
