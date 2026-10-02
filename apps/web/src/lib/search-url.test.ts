import { describe, expect, it } from 'vitest';
import {
  activeFilters,
  levelRangeOf,
  parseSearch,
  searchFromFormData,
  searchHref,
} from './search-url';

describe('parseSearch', () => {
  it('reads comma lists, repeated keys and numbers', () => {
    const q = parseSearch({
      type: 'job,apprenticeship',
      sector: ['digital', 'care-services'],
      radius: '15',
      free: '1',
    });
    expect(q.type).toEqual(['job', 'apprenticeship']);
    expect(q.sector).toEqual(['digital', 'care-services']);
    expect(q.radius).toBe(15);
    expect(q.free).toBe(true);
  });

  it('ignores junk instead of throwing', () => {
    const q = parseSearch({ type: 'banana', radius: '-4', page: 'x', levelMin: 'abc' });
    expect(q).toEqual({});
  });

  it('expands the form shorthand levelRange into levelMin and levelMax', () => {
    expect(parseSearch({ levelRange: '3-3' })).toMatchObject({ levelMin: 3, levelMax: 3 });
    expect(parseSearch({ levelRange: '4-5' })).toMatchObject({ levelMin: 4, levelMax: 5 });
    expect(parseSearch({ levelRange: 'nonsense' }).levelMin).toBeUndefined();
  });

  it('lets explicit levelMin/levelMax win over the shorthand', () => {
    expect(parseSearch({ levelRange: '3-3', levelMin: '6' })).toMatchObject({ levelMin: 6 });
  });
});

describe('levelRangeOf', () => {
  it('maps a min/max pair back to a named band, or nothing', () => {
    expect(levelRangeOf({ levelMin: 3, levelMax: 3 })).toBe('3-3');
    expect(levelRangeOf({ levelMin: 7, levelMax: 8 })).toBe('7-8');
    expect(levelRangeOf({})).toBe('');
    expect(levelRangeOf({ levelMin: 1, levelMax: 6 })).toBe('');
  });
});

describe('searchHref', () => {
  it('round-trips a query through the URL and omits defaults', () => {
    const q = parseSearch({ q: 'care', near: 'Leeds', type: 'apprenticeship', page: '2' });
    const href = searchHref(q);
    expect(href).toBe('/search?q=care&type=apprenticeship&near=Leeds&page=2');
    const again = parseSearch(Object.fromEntries(new URL(href, 'https://x.test').searchParams));
    expect(again).toEqual(q);
  });
  it('is just /search for an empty query', () => {
    expect(searchHref({})).toBe('/search');
  });
});

describe('activeFilters', () => {
  it('lists each active filter with a link that removes only it (and resets paging)', () => {
    const q = parseSearch({
      q: 'care',
      type: 'apprenticeship',
      free: '1',
      near: 'Leeds',
      radius: '10',
      page: '3',
    });
    const filters = activeFilters(q);
    expect(filters.map((f) => f.key)).toEqual(['type', 'free', 'near']);
    const free = filters.find((f) => f.key === 'free');
    expect(free?.removeHref).toBe('/search?q=care&type=apprenticeship&near=Leeds&radius=10');
    expect(filters.find((f) => f.key === 'near')?.removeHref).toBe(
      '/search?q=care&type=apprenticeship&free=1',
    );
  });
  it('shows nothing for a text-only search', () => {
    expect(activeFilters(parseSearch({ q: 'care' }))).toEqual([]);
  });
});

describe('searchFromFormData', () => {
  it('drops empty values and the page, and joins repeated values', () => {
    const form = new FormData();
    form.append('q', ' cleaner ');
    form.append('near', '');
    form.append('type', 'job');
    form.append('type', 'apprenticeship');
    form.append('page', '4');
    form.append('free', '1');
    expect(searchFromFormData(form)).toBe('/search?q=cleaner&type=job%2Capprenticeship&free=1');
  });
  it('is /search when everything is empty', () => {
    const form = new FormData();
    form.append('q', '');
    expect(searchFromFormData(form)).toBe('/search');
  });
});
