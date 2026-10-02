import {
  OPPORTUNITY_TYPE_INFO,
  PILLAR_INFO,
  SECTORS,
  type SearchQuery,
  SearchQuerySchema,
  toSearchParams,
  WORK_MODE_LABEL,
} from '@unneet/domain';

/**
 * The search page's whole state lives in the URL, so every search can be shared, bookmarked,
 * reloaded and navigated with the back button. This module is the one place that reads and writes
 * that URL. The same parsing is used by the server page and the form.
 */
export type RawParams = Record<string, string | string[] | undefined>;

/** Plain-English level bands (the form offers these; the API takes levelMin/levelMax). */
export const LEVEL_RANGES = [
  { value: '', label: 'Any level' },
  { value: '0-1', label: 'Entry level and Level 1 (below GCSE grade 4)' },
  { value: '2-2', label: 'Level 2 (GCSEs, intermediate apprenticeships)' },
  { value: '3-3', label: 'Level 3 (A levels, T Levels, advanced apprenticeships)' },
  { value: '4-5', label: 'Levels 4–5 (HNC, HND, foundation degrees)' },
  { value: '6-6', label: 'Level 6 (degrees, degree apprenticeships)' },
  { value: '7-8', label: 'Levels 7–8 (master’s, doctorates)' },
] as const;

export function levelRangeOf(query: Pick<SearchQuery, 'levelMin' | 'levelMax'>): string {
  const { levelMin: min, levelMax: max } = query;
  if (min === undefined && max === undefined) return '';
  const key = `${min ?? 0}-${max ?? 8}`;
  return LEVEL_RANGES.some((r) => r.value === key) ? key : '';
}

/** Parse the URL (including the form's `levelRange` shorthand) into a SearchQuery. Never throws. */
export function parseSearch(raw: RawParams): SearchQuery {
  const { levelRange, ...rest } = raw;
  const base = SearchQuerySchema.parse(rest);
  const range = typeof levelRange === 'string' ? /^(\d)-(\d)$/.exec(levelRange) : null;
  if (range && base.levelMin === undefined && base.levelMax === undefined) {
    return SearchQuerySchema.parse({ ...rest, levelMin: range[1], levelMax: range[2] });
  }
  return base;
}

export function searchHref(query: SearchQuery, path = '/search'): string {
  const qs = toSearchParams(query).toString();
  return qs ? `${path}?${qs}` : path;
}

export interface ActiveFilter {
  key: string;
  label: string;
  /** The same search with just this filter removed. */
  removeHref: string;
}

const without = (query: SearchQuery, ...keys: Array<keyof SearchQuery>): SearchQuery => {
  const next = { ...query, page: undefined } as Record<string, unknown>;
  for (const k of keys) delete next[k];
  return next as SearchQuery;
};

/** The chips shown above results ("Apprenticeships ×"), each a plain link that removes one filter. */
export function activeFilters(query: SearchQuery): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const add = (key: string, label: string, ...remove: Array<keyof SearchQuery>) =>
    out.push({ key, label, removeHref: searchHref(without(query, ...remove)) });

  if (query.pillar?.length)
    add('pillar', query.pillar.map((p) => PILLAR_INFO[p].label).join(', '), 'pillar');
  if (query.type?.length)
    add('type', query.type.map((t) => OPPORTUNITY_TYPE_INFO[t].plural).join(', '), 'type');
  if (query.sector?.length)
    add(
      'sector',
      query.sector.map((s) => SECTORS.find((x) => x.slug === s)?.name ?? s).join(', '),
      'sector',
    );
  const range = levelRangeOf(query);
  if (range)
    add(
      'level',
      LEVEL_RANGES.find((r) => r.value === range)?.label ?? 'Level',
      'levelMin',
      'levelMax',
    );
  if (query.qualified !== undefined)
    add('qualified', `Qualifications up to Level ${query.qualified}`, 'qualified');
  if (query.free) add('free', 'Free', 'free');
  if (query.costMax !== undefined)
    add('costMax', `Up to £${query.costMax.toLocaleString('en-GB')}`, 'costMax');
  if (query.payMin !== undefined)
    add('payMin', `Pay from £${query.payMin.toLocaleString('en-GB')} a year`, 'payMin');
  if (query.workMode?.length)
    add('workMode', query.workMode.map((m) => WORK_MODE_LABEL[m]).join(', '), 'workMode');
  if (query.near)
    add(
      'near',
      `Near ${query.near}${query.radius ? ` (${query.radius} mi)` : ''}`,
      'near',
      'radius',
    );
  if (query.age !== undefined) add('age', `Age ${query.age}`, 'age');
  if (query.noExperience) add('noExperience', 'No experience needed', 'noExperience');
  return out;
}

/** Turn a submitted form into a clean query string: no empty values, no stale page number. */
export function searchFromFormData(data: FormData): string {
  const params = new URLSearchParams();
  for (const key of new Set(data.keys())) {
    if (key === 'page') continue;
    const values = data
      .getAll(key)
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    if (values.length > 0) params.set(key, values.join(','));
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}
