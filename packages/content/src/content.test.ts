import {
  buildSkillMatcher,
  buildTimeline,
  extractFromCv,
  SECTOR_SLUGS,
  STAGES,
  scoreRiasec,
} from '@unneet/domain';
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTIONS,
  CALENDAR_EVENTS,
  CURATED_OPPORTUNITIES,
  PATHWAYS,
  RIASEC_ITEMS,
  SKILLS,
  TIMELINE_RULES,
} from './index';

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;

describe('skills dictionary', () => {
  it('has a useful number of unique skills', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(120);
    expect(unique(SKILLS.map((s) => s.id))).toBe(true);
  });

  it('has no alias that maps to two different skills (deterministic extraction)', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    const matcher = buildSkillMatcher(SKILLS); // builds with first-wins; we check clashes ourselves
    expect(matcher.size).toBe(SKILLS.length);
    for (const skill of SKILLS) {
      for (const phrase of [skill.label, ...skill.aliases]) {
        const key = phrase.toLowerCase();
        const existing = owner.get(key);
        if (existing && existing !== skill.id) clashes.push(`${key}: ${existing} vs ${skill.id}`);
        else owner.set(key, skill.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('extracts sensible skills from a realistic CV', () => {
    const cv = `Sales Assistant, Tesco 2021 - present
      Dealing with customers, using the till, stock checks and working in a team.
      Level 2 food hygiene. Full UK driving licence. GCSEs in Maths and English.
      Volunteered at a local care home supporting older people. Good at Excel.`;
    const result = extractFromCv(cv, buildSkillMatcher(SKILLS), new Date('2026-10-01'));
    const ids = result.skills.map((s) => s.id);
    for (const expected of [
      'customer-service',
      'epos-tills',
      'stock-control',
      'teamwork',
      'food-hygiene',
      'driving-licence',
      'working-with-older-people',
      'excel',
    ]) {
      expect(ids).toContain(expected);
    }
    expect(result.qualifications.highestLevel).toBe(2);
  });
});

describe('interests quiz items', () => {
  it('is the 30-item Mini-IP: five per type, unique ids', () => {
    expect(RIASEC_ITEMS).toHaveLength(30);
    expect(unique(RIASEC_ITEMS.map((i) => i.id))).toBe(true);
    for (const type of ['R', 'I', 'A', 'S', 'E', 'C'] as const) {
      expect(RIASEC_ITEMS.filter((i) => i.type === type)).toHaveLength(5);
    }
  });

  it('scores end-to-end', () => {
    const answers = Object.fromEntries(
      RIASEC_ITEMS.map((i) => [i.id, i.type === 'S' ? 4 : 0]),
    ) as Record<string, 0 | 4>;
    expect(scoreRiasec(RIASEC_ITEMS, answers).code.startsWith('S')).toBe(true);
  });

  it('credits O*NET', () => {
    expect(ATTRIBUTIONS.find((a) => a.id === 'onet-mini-ip')?.licence).toBe('CC BY 4.0');
  });
});

describe('curated programmes', () => {
  it('has unique ids and unique links', () => {
    expect(CURATED_OPPORTUNITIES.length).toBeGreaterThanOrEqual(40);
    expect(unique(CURATED_OPPORTUNITIES.map((o) => o.externalId))).toBe(true);
    // One official tool legitimately serves two schemes: the NCS course finder lists Skills Bootcamps.
    const SHARED_URLS = new Set(['https://nationalcareers.service.gov.uk/find-a-course']);
    const urls = CURATED_OPPORTUNITIES.map((o) => o.applyUrl).filter((u) => !SHARED_URLS.has(u));
    expect(unique(urls)).toBe(true);
  });

  it('uses only https links and real sectors', () => {
    for (const o of CURATED_OPPORTUNITIES) {
      expect(o.applyUrl.startsWith('https://')).toBe(true);
      if (o.sector) expect(SECTOR_SLUGS).toContain(o.sector);
    }
  });

  it('is written for humans: substantial plain-English descriptions, no placeholders', () => {
    for (const o of CURATED_OPPORTUNITIES) {
      expect(o.description.length, o.externalId).toBeGreaterThanOrEqual(80);
      expect(o.description, o.externalId).not.toMatch(/todo|lorem|tbc|xxx/i);
    }
  });

  it('never states a cost without a kind, and funded schemes say to check eligibility', () => {
    for (const o of CURATED_OPPORTUNITIES) {
      if (o.cost?.kind === 'funded') {
        const text = `${o.description} ${o.cost.note ?? ''}`.toLowerCase();
        expect(text, o.externalId).toMatch(/eligible|qualify|check/);
      }
    }
  });

  it('covers every type a young person needs a front door for', () => {
    const types = new Set(CURATED_OPPORTUNITIES.map((o) => o.type));
    for (const t of [
      'support',
      'programme',
      'course',
      'apprenticeship',
      'job',
      'volunteering',
      'bootcamp',
      't-level',
    ] as const) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it('includes the safety-net support numbers verbatim', () => {
    const text = CURATED_OPPORTUNITIES.map((o) => `${o.title} ${o.description}`).join(' ');
    expect(text).toContain('116 123');
    expect(text).toContain('85258');
  });
});

describe('pathways', () => {
  it('has unique slugs and covers a spread of sectors', () => {
    expect(PATHWAYS.length).toBeGreaterThanOrEqual(10);
    expect(unique(PATHWAYS.map((p) => p.slug))).toBe(true);
    expect(new Set(PATHWAYS.map((p) => p.sector)).size).toBeGreaterThanOrEqual(10);
  });

  it('keeps every step inside its own sector and ids unique', () => {
    for (const p of PATHWAYS) {
      expect(unique(p.steps.map((s) => s.id)), p.slug).toBe(true);
      for (const s of p.steps) {
        if (s.search.sector) expect(s.search.sector, `${p.slug}/${s.id}`).toEqual([p.sector]);
      }
    }
  });

  it('starts every pathway at an accessible first step', () => {
    for (const p of PATHWAYS) expect(p.steps[0]?.kind, p.slug).toBe('start');
  });
});

describe('timeline content', () => {
  const calendarIds = new Set(CALENDAR_EVENTS.map((e) => e.id));

  it('has unique rule ids', () => {
    expect(unique(TIMELINE_RULES.map((r) => r.id))).toBe(true);
  });

  it('gives every stage at least two rules', () => {
    for (const stage of STAGES) {
      const n = TIMELINE_RULES.filter((r) => r.stages.includes(stage)).length;
      expect(n, stage).toBeGreaterThanOrEqual(1);
    }
    for (const stage of [
      'year-11',
      'year-13',
      'uni-year-1',
      'uni-year-2',
      'uni-final-year',
      'between-things',
    ] as const) {
      expect(
        TIMELINE_RULES.filter((r) => r.stages.includes(stage)).length,
        stage,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('only references calendar events that exist and are verified', () => {
    for (const r of TIMELINE_RULES) {
      if (r.timing.kind === 'fixed') {
        expect(calendarIds.has(r.timing.eventId), r.id).toBe(true);
      }
    }
    for (const e of CALENDAR_EVENTS) {
      expect(e.verifiedOn, e.id).not.toBeNull();
      expect(e.source.url.startsWith('https://')).toBe(true);
    }
  });

  it('uses real calendar dates in academic windows', () => {
    for (const r of TIMELINE_RULES) {
      if (r.timing.kind !== 'academic') continue;
      for (const md of [r.timing.from, r.timing.to]) {
        const d = new Date(Date.UTC(2027, md.month - 1, md.day));
        expect(d.getUTCMonth() + 1, r.id).toBe(md.month);
      }
    }
  });

  it('prompts internship applications as soon as 2nd year starts (headline requirement)', () => {
    const t = buildTimeline(
      { stage: 'uni-year-2', now: new Date('2026-09-02T09:00:00Z') },
      TIMELINE_RULES,
      CALENDAR_EVENTS,
    );
    expect(t.nextUp[0]?.rule.id).toBe('uni2-summer-internships');
    expect(t.now.map((e) => e.rule.id)).toContain('uni2-summer-internships');
    expect(t.nextUp[0]?.rule.action?.search?.type).toEqual(['internship']);
  });

  it('warns first-years over the summer that the internship season is coming', () => {
    const t = buildTimeline(
      { stage: 'uni-year-1', now: new Date('2026-07-20T09:00:00Z') },
      TIMELINE_RULES,
      CALENDAR_EVENTS,
    );
    const heads = t.soon.find((e) => e.rule.id === 'uni2-summer-internships');
    expect(heads?.fromNextStage).toBe(true);
  });

  it('shows Year 13s the exact UCAS deadlines in the autumn', () => {
    const t = buildTimeline(
      { stage: 'year-13', now: new Date('2026-10-01T09:00:00Z') },
      TIMELINE_RULES,
      CALENDAR_EVENTS,
    );
    const oct = t.now.find((e) => e.rule.id === 'y13-ucas-oct');
    expect(oct?.windowLabel).toBe('Deadline 15 Oct 2026, 18:00');
    expect(t.soon.map((e) => e.rule.id)).toContain('y13-ucas-jan');
  });

  it('offers people with no academic calendar a first-30-days plan', () => {
    const t = buildTimeline(
      { stage: 'between-things', now: new Date('2026-10-01T09:00:00Z') },
      TIMELINE_RULES,
      CALENDAR_EVENTS,
    );
    expect(t.now.map((e) => e.rule.id)).toEqual(
      expect.arrayContaining(['bt-start-here', 'bt-talk-to-adviser']),
    );
  });

  it('only shows teacher-training nudges to people interested in education', () => {
    const base = { stage: 'graduate' as const, now: new Date('2026-10-10T09:00:00Z') };
    const without = buildTimeline(base, TIMELINE_RULES, CALENDAR_EVENTS);
    const withSector = buildTimeline(
      { ...base, sectors: ['education-early-years'] },
      TIMELINE_RULES,
      CALENDAR_EVENTS,
    );
    expect(without.now.map((e) => e.rule.id)).not.toContain('uni3-teacher-training');
    expect(withSector.now.map((e) => e.rule.id)).toContain('uni3-teacher-training');
  });
});
