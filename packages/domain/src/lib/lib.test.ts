import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  classifyLocationQuery,
  haversineMiles,
  isOutcode,
  isPlausiblyUk,
  normalisePostcode,
  outcodeOf,
} from './geo';
import { clamp, distanceDecay, shapeSimilarity } from './math';
import { annualRange, formatCost, formatGBP, formatPay, isFreeCost, toAnnual } from './money';
import {
  htmlToText,
  opportunitySlug,
  shortHash,
  slugify,
  summarise,
  tidyTitle,
  truncate,
} from './text';

describe('text', () => {
  it('converts HTML to readable text, dropping scripts and keeping lists', () => {
    const html =
      '<p>Hello&nbsp;<b>world</b> &amp; welcome</p><script>alert(1)</script><ul><li>One</li><li>Two</li></ul>';
    expect(htmlToText(html)).toBe('Hello world & welcome\n\n• One\n• Two');
  });

  it('removes inline tags without leaving stray spaces before punctuation', () => {
    expect(htmlToText('Visit our <b>care home</b>, then <a href="https://x.test">apply</a>.')).toBe(
      'Visit our care home, then apply.',
    );
  });

  it('decodes numeric entities and ignores invalid ones', () => {
    expect(htmlToText('&#163;20 &#x2013; &#0; ok')).toBe('£20 – ok');
  });

  it('decodes the named entities real feeds use, and leaves unknown ones as text', () => {
    expect(htmlToText('Caf&eacute; &bull; &pound;5 &rarr; &Scaron;kola &zwj;ok &reg;')).toBe(
      'Café • £5 → Škola ok ®',
    );
    expect(htmlToText('&notarealentity; &constructor; &toString;')).toBe(
      '&notarealentity; &constructor; &toString;',
    );
  });

  it('keeps a bulleted list together even when each <li> is on its own line', () => {
    const html =
      '<p>Intro</p>\n<ul>\n<li>One</li>\n<li>Two</li>\n<li>Three</li>\n</ul>\n<p>After</p>';
    expect(htmlToText(html)).toBe('Intro\n\n• One\n• Two\n• Three\n\nAfter');
    expect(htmlToText('<ul>\n<li>Only</li>\n<li>Two</li>\n</ul>')).toBe('• Only\n• Two');
  });

  it('never leaves tags behind, even when malformed', () => {
    expect(htmlToText('<div onclick="x()">Hi<br>there</div><img src=x onerror=alert(1)>')).toBe(
      'Hi\nthere',
    );
  });

  it('slugifies with diacritics and ampersands', () => {
    expect(slugify('Café & Bar — Manchester!')).toBe('cafe-and-bar-manchester');
    expect(slugify('   ')).toBe('');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    expect(truncate('The quick brown fox jumps over the lazy dog', 20)).toBe('The quick brown…');
    expect(truncate('Short', 20)).toBe('Short');
  });

  it('summarises using the first paragraph', () => {
    expect(summarise('First para.\n\nSecond para.', 100)).toBe('First para.');
  });

  it('produces stable, distinct short hashes', () => {
    expect(shortHash('a')).toBe(shortHash('a'));
    expect(shortHash('a')).not.toBe(shortHash('b'));
    expect(shortHash('anything')).toHaveLength(7);
  });

  it('builds stable opportunity slugs', () => {
    const a = opportunitySlug('Care Assistant', 'Acme Care', 'reed', '123');
    expect(a).toMatch(/^care-assistant-acme-care-[0-9a-z]{7}$/);
    expect(opportunitySlug('Care Assistant', 'Acme Care', 'reed', '123')).toBe(a);
    expect(opportunitySlug('Care Assistant', 'Acme Care', 'reed', '124')).not.toBe(a);
  });

  it('tidies SHOUTING titles but keeps acronyms', () => {
    expect(tidyTitle('SENIOR NHS HEALTHCARE ASSISTANT')).toBe('Senior NHS Healthcare Assistant');
    expect(tidyTitle('Customer Service Advisor')).toBe('Customer Service Advisor');
  });
});

describe('geo', () => {
  it('normalises postcodes', () => {
    expect(normalisePostcode('m11ae')).toBe('M1 1AE');
    expect(normalisePostcode('  sw1a   2aa ')).toBe('SW1A 2AA');
    expect(normalisePostcode('EC1A1BB')).toBe('EC1A 1BB');
    expect(normalisePostcode('hello')).toBeNull();
    expect(normalisePostcode('M1')).toBeNull();
  });

  it('extracts outcodes', () => {
    expect(outcodeOf('M1 1AE')).toBe('M1');
    expect(outcodeOf('sw1a')).toBe('SW1A');
    expect(outcodeOf('Manchester')).toBeNull();
    expect(isOutcode('B33')).toBe(true);
    expect(isOutcode('B')).toBe(false);
  });

  it('classifies location queries', () => {
    expect(classifyLocationQuery('m1 1ae')).toEqual({ kind: 'postcode', value: 'M1 1AE' });
    expect(classifyLocationQuery('M1')).toEqual({ kind: 'outcode', value: 'M1' });
    expect(classifyLocationQuery(' Leeds ')).toEqual({ kind: 'place', value: 'Leeds' });
  });

  it('computes great-circle distance (Manchester → London ≈ 163 miles)', () => {
    const d = haversineMiles({ lat: 53.4808, lon: -2.2426 }, { lat: 51.5074, lon: -0.1278 });
    expect(d).toBeGreaterThan(160);
    expect(d).toBeLessThan(166);
    expect(haversineMiles({ lat: 1, lon: 1 }, { lat: 1, lon: 1 })).toBe(0);
  });

  it('flags points outside the UK', () => {
    expect(isPlausiblyUk({ lat: 53.48, lon: -2.24 })).toBe(true);
    expect(isPlausiblyUk({ lat: 40.7, lon: -74 })).toBe(false);
  });

  it('builds a bounding box that contains the radius', () => {
    const centre = { lat: 53.48, lon: -2.24 };
    const box = boundingBox(centre, 20);
    const edge = haversineMiles(centre, { lat: box.maxLat, lon: centre.lon });
    expect(edge).toBeGreaterThanOrEqual(19.5);
    expect(box.minLon).toBeLessThan(centre.lon);
  });
});

describe('math', () => {
  it('clamps', () => {
    expect(clamp(5)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.4)).toBe(0.4);
  });

  it('shape similarity ignores level and compares profile shape', () => {
    expect(shapeSimilarity([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(shapeSimilarity([1, 2, 3], [3, 2, 1])).toBeCloseTo(0);
    expect(shapeSimilarity([1, 1, 1], [1, 2, 3])).toBe(0.5);
    expect(() => shapeSimilarity([1], [1, 2])).toThrow();
  });

  it('decays with distance', () => {
    expect(distanceDecay(0, 15)).toBe(1);
    expect(distanceDecay(15, 15)).toBeCloseTo(0.5);
    expect(distanceDecay(30, 15)).toBeCloseTo(0.25);
  });
});

describe('money', () => {
  it('annualises pay across units using a 37.5h week', () => {
    expect(toAnnual(12, 'hour')).toBe(23_400);
    expect(toAnnual(100, 'day')).toBe(26_000);
    expect(toAnnual(500, 'week')).toBe(26_000);
    expect(toAnnual(2000, 'month')).toBe(24_000);
    expect(toAnnual(25_000, 'year')).toBe(25_000);
  });

  it('computes annual ranges and fills missing bounds', () => {
    expect(annualRange({ min: 12, max: null, unit: 'hour', isEstimate: false })).toEqual({
      min: 23_400,
      max: 23_400,
    });
    expect(annualRange(null)).toEqual({ min: null, max: null });
  });

  it('formats pay and cost', () => {
    expect(formatPay({ min: 12.21, max: 12.21, unit: 'hour', isEstimate: false })).toBe(
      '£12.21 an hour',
    );
    expect(formatPay({ min: 22_000, max: 25_000, unit: 'year', isEstimate: false })).toBe(
      '£22,000 – £25,000 a year',
    );
    // A one-sided figure must not read as an exact amount.
    expect(formatPay({ min: 20_000, max: null, unit: 'year', isEstimate: true })).toBe(
      'From £20,000 a year (estimate)',
    );
    expect(formatPay({ min: null, max: 39_201, unit: 'year', isEstimate: false })).toBe(
      'Up to £39,201 a year',
    );
    expect(formatPay(null)).toBe('Pay not stated');
    expect(formatCost({ kind: 'free', amount: null })).toBe('Free');
    expect(formatCost({ kind: 'funded', amount: null })).toBe('Free if you qualify');
    expect(formatCost({ kind: 'paid', amount: 1250 })).toBe('£1,250');
    expect(formatGBP(5)).toBe('£5');
  });

  it('treats funded as free for filtering', () => {
    expect(isFreeCost({ kind: 'funded', amount: null })).toBe(true);
    expect(isFreeCost({ kind: 'paid', amount: 10 })).toBe(false);
    expect(isFreeCost(null)).toBe(false);
  });
});
