import { describe, expect, it } from 'vitest';
import {
  type CalendarEvent,
  CalendarEventSchema,
  type TimelineRule,
  TimelineRuleSchema,
} from '../schemas/timeline';
import { academicYearOf, advanceStage } from '../taxonomy/stages';
import { dayNumber, dayToIso, formatDay, isoToDay, relativeDays } from './dates';
import { buildTimeline, whenLabel } from './engine';
import { buildIcs, escapeIcsText, foldIcsLine } from './ics';
import { actionHref } from './links';

const source = { label: 'Official', url: 'https://example.gov.uk/page' };

const rule = (
  r: Partial<TimelineRule> & Pick<TimelineRule, 'id' | 'stages' | 'timing'>,
): TimelineRule =>
  TimelineRuleSchema.parse({
    title: `Rule ${r.id}`,
    summary: 'Do the thing well before it closes.',
    why: 'Because the deadline matters to you.',
    sources: [source],
    ...r,
  });

const rules: TimelineRule[] = [
  rule({
    id: 'internship-y2',
    stages: ['uni-year-2'],
    urgency: 'high',
    timing: { kind: 'academic', from: { month: 9, day: 1 }, to: { month: 12, day: 15 } },
    action: { label: 'See internships', search: { type: ['internship'] } },
  }),
  rule({
    id: 'ucas-jan',
    stages: ['year-13'],
    timing: { kind: 'fixed', eventId: 'ucas-2027-jan', leadDays: 60 },
  }),
  rule({
    id: 'ucas-unverified',
    stages: ['year-13'],
    timing: { kind: 'fixed', eventId: 'ucas-unverified', leadDays: 60 },
  }),
  rule({
    id: 'first-week',
    stages: ['between-things'],
    timing: { kind: 'relative', fromDay: 0, toDay: 7 },
  }),
  rule({
    id: 'grad-schemes',
    stages: ['uni-final-year'],
    timing: { kind: 'academic', from: { month: 9, day: 1 }, to: { month: 12, day: 31 } },
  }),
  rule({
    id: 'digital-only',
    stages: ['uni-year-2'],
    sectors: ['digital'],
    timing: { kind: 'academic', from: { month: 9, day: 1 }, to: { month: 12, day: 15 } },
  }),
  rule({
    id: 'wrap-window',
    stages: ['year-11'],
    timing: { kind: 'academic', from: { month: 11, day: 1 }, to: { month: 2, day: 28 } },
  }),
];

const events: CalendarEvent[] = [
  CalendarEventSchema.parse({
    id: 'ucas-2027-jan',
    cycle: 'ucas-2027-entry',
    label: 'UCAS equal consideration deadline',
    closes: '2027-01-13',
    closesAtTime: '18:00',
    source,
    verifiedOn: '2026-10-01',
  }),
  CalendarEventSchema.parse({
    id: 'ucas-unverified',
    cycle: 'x',
    label: 'Unverified',
    closes: '2027-01-30',
    source,
    verifiedOn: null,
  }),
];

const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
const ids = (entries: { rule: { id: string } }[]) => entries.map((e) => e.rule.id);

describe('dates', () => {
  it('round-trips day numbers', () => {
    expect(dayToIso(isoToDay('2027-01-13'))).toBe('2027-01-13');
    expect(isoToDay('2027-01-14') - isoToDay('2027-01-13')).toBe(1);
    expect(dayNumber(2026, 12, 31) + 1).toBe(dayNumber(2027, 1, 1));
  });

  it('formats days and relative phrases', () => {
    expect(formatDay(isoToDay('2027-01-13'))).toBe('13 Jan 2027');
    expect(relativeDays(0)).toBe('today');
    expect(relativeDays(1)).toBe('tomorrow');
    expect(relativeDays(5)).toBe('in 5 days');
    expect(relativeDays(21)).toBe('in 3 weeks');
    expect(relativeDays(120)).toBe('in 4 months');
    expect(relativeDays(-3)).toBe('3 days ago');
  });
});

describe('stages', () => {
  it('identifies the academic year (Sept–Aug)', () => {
    expect(academicYearOf(at('2026-08-31'))).toBe(2025);
    expect(academicYearOf(at('2026-09-01'))).toBe(2026);
    expect(academicYearOf(at('2027-03-15'))).toBe(2026);
  });

  it('advances unambiguous academic stages each September and asks to confirm', () => {
    expect(advanceStage('uni-year-1', 2025, at('2026-09-15'))).toEqual({
      stage: 'uni-year-2',
      needsConfirmation: true,
    });
    expect(advanceStage('uni-year-1', 2025, at('2027-09-15'))).toEqual({
      stage: 'uni-final-year',
      needsConfirmation: true,
    });
  });

  it('asks instead of assuming when the next step is unknown', () => {
    expect(advanceStage('year-11', 2025, at('2026-09-15'))).toEqual({
      stage: 'year-11',
      needsConfirmation: true,
    });
  });

  it('leaves non-academic stages and same-year stages alone', () => {
    expect(advanceStage('working', 2020, at('2026-09-15'))).toEqual({
      stage: 'working',
      needsConfirmation: false,
    });
    expect(advanceStage('uni-year-2', 2026, at('2027-03-01'))).toEqual({
      stage: 'uni-year-2',
      needsConfirmation: false,
    });
  });
});

describe('buildTimeline', () => {
  it('prompts internship applications as soon as 2nd year starts', () => {
    const t = buildTimeline({ stage: 'uni-year-2', now: at('2026-09-02') }, rules, events);
    const entry = t.now.find((e) => e.rule.id === 'internship-y2');
    expect(entry).toBeDefined();
    expect(entry?.opensOn).toBe('2026-09-01');
    expect(entry?.closesOn).toBe('2026-12-15');
    expect(entry?.daysToClose).toBe(104);
    expect(entry?.exact).toBe(false);
    expect(entry?.windowLabel).toBe('Typically 1 Sep – 15 Dec');
    expect(t.nextUp[0]?.rule.id).toBe('internship-y2');
  });

  it("gives a summer heads-up about next stage's rules", () => {
    const t = buildTimeline({ stage: 'uni-year-1', now: at('2026-07-15') }, rules, events);
    const entry = t.soon.find((e) => e.rule.id === 'internship-y2');
    expect(entry?.fromNextStage).toBe(true);
    expect(entry?.opensOn).toBe('2026-09-01');
    expect(entry?.daysToOpen).toBe(48);
  });

  it('does not give the heads-up outside summer', () => {
    const t = buildTimeline({ stage: 'uni-year-1', now: at('2026-02-01') }, rules, events);
    expect(ids([...t.now, ...t.soon, ...t.later])).not.toContain('internship-y2');
  });

  it('uses exact dated events and shows the deadline time', () => {
    const t = buildTimeline({ stage: 'year-13', now: at('2026-11-20') }, rules, events);
    const entry = t.now.find((e) => e.rule.id === 'ucas-jan');
    expect(entry?.exact).toBe(true);
    expect(entry?.windowLabel).toBe('Deadline 13 Jan 2027, 18:00');
    expect(entry?.daysToClose).toBe(54);
  });

  it('hides unverified fixed dates', () => {
    const t = buildTimeline({ stage: 'year-13', now: at('2026-11-20') }, rules, events);
    const all = ids([...t.now, ...t.soon, ...t.later, ...t.missed, ...t.done]);
    expect(all).not.toContain('ucas-unverified');
  });

  it('hides fixed events a couple of weeks after the deadline', () => {
    const t = buildTimeline({ stage: 'year-13', now: at('2027-02-01') }, rules, events);
    expect(ids([...t.now, ...t.soon, ...t.later, ...t.missed])).not.toContain('ucas-jan');
  });

  it('shows a recently-ended window as missed rather than disappearing', () => {
    const t = buildTimeline({ stage: 'uni-final-year', now: at('2027-01-10') }, rules, events);
    const entry = t.missed.find((e) => e.rule.id === 'grad-schemes');
    expect(entry).toBeDefined();
    expect(whenLabel(entry as NonNullable<typeof entry>)).toBe('Window ended 10 days ago');
  });

  it('handles windows that wrap over New Year', () => {
    const dec = buildTimeline({ stage: 'year-11', now: at('2026-12-20') }, rules, events);
    expect(ids(dec.now)).toContain('wrap-window');
    const jan = buildTimeline({ stage: 'year-11', now: at('2027-01-20') }, rules, events);
    expect(ids(jan.now)).toContain('wrap-window');
    expect(jan.now.find((e) => e.rule.id === 'wrap-window')?.closesOn).toBe('2027-02-28');
  });

  it('runs relative rules from the day someone started', () => {
    const t = buildTimeline(
      { stage: 'between-things', now: at('2026-10-03'), startedOn: '2026-10-01' },
      rules,
      events,
    );
    const entry = t.now.find((e) => e.rule.id === 'first-week');
    expect(entry?.windowLabel).toBe('Week 1');
    expect(entry?.closesOn).toBe('2026-10-08');
  });

  it('moves ticked-off items to done', () => {
    const t = buildTimeline(
      { stage: 'uni-year-2', now: at('2026-09-02'), doneIds: ['internship-y2'] },
      rules,
      events,
    );
    expect(ids(t.done)).toEqual(['internship-y2']);
    expect(ids(t.now)).not.toContain('internship-y2');
  });

  it('shows sector-specific rules only to people interested in that sector', () => {
    const base = { stage: 'uni-year-2' as const, now: at('2026-09-02') };
    expect(
      ids(buildTimeline({ ...base, sectors: ['care-services'] }, rules, events).now),
    ).not.toContain('digital-only');
    expect(ids(buildTimeline({ ...base, sectors: ['digital'] }, rules, events).now)).toContain(
      'digital-only',
    );
    expect(ids(buildTimeline(base, rules, events).now)).not.toContain('digital-only');
  });

  it('caps nextUp at three and orders high urgency first', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) =>
      rule({
        id: `r-${id}`,
        stages: ['working'],
        urgency: id === 'd' ? 'high' : 'normal',
        timing: { kind: 'academic', from: { month: 9, day: 1 }, to: { month: 12, day: 15 } },
      }),
    );
    const t = buildTimeline({ stage: 'working', now: at('2026-10-01') }, many, []);
    expect(t.nextUp).toHaveLength(3);
    expect(t.nextUp[0]?.rule.id).toBe('r-d');
  });

  it('is deterministic', () => {
    const input = { stage: 'uni-year-2' as const, now: at('2026-09-02') };
    expect(buildTimeline(input, rules, events)).toEqual(buildTimeline(input, rules, events));
  });
});

describe('actionHref', () => {
  it('turns searches into site-relative links and keeps official hrefs', () => {
    expect(
      actionHref({ label: 'x', search: { type: ['internship'], sector: ['digital'], free: true } }),
    ).toEqual({
      href: '/search?type=internship&sector=digital&free=1',
      external: false,
    });
    expect(actionHref({ label: 'x', href: 'https://www.ucas.com/' })).toEqual({
      href: 'https://www.ucas.com/',
      external: true,
    });
  });
});

describe('iCalendar', () => {
  const now = new Date('2026-10-01T12:34:56Z');
  const timeline = buildTimeline({ stage: 'uni-year-2', now: at('2026-09-02') }, rules, events);

  it('escapes TEXT values per RFC 5545', () => {
    expect(escapeIcsText('a, b; c\\d\nline2')).toBe('a\\, b\\; c\\\\d\\nline2');
  });

  it('folds long lines to ≤75 octets without splitting characters', () => {
    const long = `SUMMARY:${'é'.repeat(100)}`;
    const folded = foldIcsLine(long).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded)
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
  });

  it('builds a valid all-day calendar with exclusive DTEND and CRLF endings', () => {
    const ics = buildIcs(timeline.now, {
      calendarName: 'My next steps',
      uidDomain: 'unneet.test',
      siteOrigin: 'https://unneet.test',
      now,
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:internship-y2-20260901@unneet.test');
    expect(ics).toContain('DTSTAMP:20261001T123456Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20261216'); // exclusive: day after 15 Dec
    expect(ics).toContain('URL:https://unneet.test/search?type=internship');
    expect(ics).not.toMatch(/[^\r]\n/); // no bare LF
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('produces an empty-but-valid calendar for no entries', () => {
    const ics = buildIcs([], { calendarName: 'x', uidDomain: 'd', siteOrigin: 'https://s', now });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});

describe('schemas', () => {
  it('rejects a rule action with both or neither of search/href', () => {
    const base = {
      id: 'x',
      stages: ['working'],
      title: 'Title',
      summary: 'A summary sentence.',
      why: 'Because reasons here.',
      sources: [source],
      timing: { kind: 'relative', fromDay: 0, toDay: 3 },
    };
    expect(TimelineRuleSchema.safeParse({ ...base, action: { label: 'Go' } }).success).toBe(false);
    expect(
      TimelineRuleSchema.safeParse({
        ...base,
        action: { label: 'Go', search: {}, href: 'https://a.b/' },
      }).success,
    ).toBe(false);
    expect(
      TimelineRuleSchema.safeParse({ ...base, action: { label: 'Go', href: 'https://a.b/' } })
        .success,
    ).toBe(true);
  });

  it('requires https sources', () => {
    expect(
      CalendarEventSchema.safeParse({
        id: 'a',
        cycle: 'c',
        label: 'l',
        closes: '2027-01-13',
        verifiedOn: null,
        source: { label: 'x', url: 'http://insecure.example' },
      }).success,
    ).toBe(false);
  });
});
