import { z } from 'zod';
import { LevelSchema } from '../taxonomy/levels';
import { WorkModeSchema } from '../taxonomy/misc';
import { OpportunityTypeSchema, PillarSchema } from '../taxonomy/opportunity-types';
import { SectorSlugSchema } from '../taxonomy/sectors';
import { OpportunityCardSchema } from './opportunity';

export const SORTS = ['relevance', 'newest', 'closing', 'distance', 'pay', 'cost'] as const;
export const SortSchema = z.enum(SORTS);
export type Sort = z.infer<typeof SortSchema>;

export const SORT_LABEL: Readonly<Record<Sort, string>> = {
  relevance: 'Best match',
  newest: 'Newest',
  closing: 'Closing soonest',
  distance: 'Nearest',
  pay: 'Highest pay',
  cost: 'Lowest cost',
};

export const DEFAULT_RADIUS_MILES = 20;
export const MAX_PAGE_SIZE = 50;

/** URL params arrive as "a,b" or repeated keys; accept both. */
const listOf = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const parts = (Array.isArray(v) ? v : String(v).split(','))
      .map((s) => String(s).trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  }, z.array(item).max(20).optional());

const flag = z.preprocess((v) => {
  if (v === true || v === '1' || v === 'true' || v === 'on') return true;
  if (v === false || v === '0' || v === 'false') return false;
  return undefined;
}, z.boolean().optional());

const num = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.coerce.number().pipe(schema).optional(),
  );

/**
 * Everything the search page / API can filter on. This one schema is parsed from the browser
 * URL, from the API query string, and drives the SQL builder, so they can never drift apart.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  pillar: listOf(PillarSchema).catch(undefined),
  type: listOf(OpportunityTypeSchema).catch(undefined),
  sector: listOf(SectorSlugSchema).catch(undefined),
  /** Level of the opportunity itself (course level, apprenticeship level, role level). */
  levelMin: num(LevelSchema).catch(undefined),
  levelMax: num(LevelSchema).catch(undefined),
  /** "I have qualifications up to this level" → only things I can start now (+ no requirement). */
  qualified: num(LevelSchema).catch(undefined),
  /** Only things that cost the learner nothing (includes "free if you qualify"). */
  free: flag.catch(undefined),
  /** Max cost to the learner in GBP. */
  costMax: num(z.number().min(0).max(100_000)).catch(undefined),
  /** Min pay, annual full-time-equivalent GBP. */
  payMin: num(z.number().min(0).max(500_000)).catch(undefined),
  workMode: listOf(WorkModeSchema).catch(undefined),
  /** Free-text location: postcode, outcode, or place name. Resolved server-side. */
  near: z.string().trim().max(80).optional().catch(undefined),
  radius: num(z.number().min(1).max(200)).catch(undefined),
  /** Only things a person of this age can take up. */
  age: num(z.number().int().min(14).max(99)).catch(undefined),
  noExperience: flag.catch(undefined),
  /** Hide expired listings (default true). */
  openOnly: flag.catch(undefined),
  sort: SortSchema.optional().catch(undefined),
  page: num(z.number().int().min(1).max(500)).catch(undefined),
  pageSize: num(z.number().int().min(1).max(MAX_PAGE_SIZE)).catch(undefined),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** A query after the API has resolved `near` into coordinates and applied defaults. */
export interface ResolvedSearch extends SearchQuery {
  centre?: { lat: number; lon: number; label: string } | undefined;
  page: number;
  pageSize: number;
  sort: Sort;
  radius: number;
}

export function resolveDefaults(
  query: SearchQuery,
  centre?: { lat: number; lon: number; label: string },
): ResolvedSearch {
  const hasText = Boolean(query.q);
  const sort: Sort = query.sort ?? (hasText ? 'relevance' : centre ? 'distance' : 'newest');
  return {
    ...query,
    centre,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
    radius: query.radius ?? DEFAULT_RADIUS_MILES,
    sort: sort === 'distance' && !centre ? 'newest' : sort,
  };
}

const FacetBucketSchema = z.object({ value: z.string(), count: z.number().int().nonnegative() });
export type FacetBucket = z.infer<typeof FacetBucketSchema>;

export const FacetsSchema = z.object({
  pillar: z.array(FacetBucketSchema),
  type: z.array(FacetBucketSchema),
  sector: z.array(FacetBucketSchema),
  level: z.array(FacetBucketSchema),
  workMode: z.array(FacetBucketSchema),
  free: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type Facets = z.infer<typeof FacetsSchema>;

export const SearchResponseSchema = z.object({
  items: z.array(OpportunityCardSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  facets: FacetsSchema,
  /** Echo of the resolved location so the UI can show "within 20 miles of Manchester". */
  centre: z.object({ lat: z.number(), lon: z.number(), label: z.string() }).nullable(),
  /** Set when `near` was given but couldn't be resolved. */
  locationError: z.string().nullable(),
  /**
   * Extra jobs from partner job boards queried live (never stored). Shown in their own labelled
   * section, each linking straight out. Empty unless a federated provider is configured.
   */
  external: z.array(OpportunityCardSchema),
  /** Attribution lines the UI must display for the providers present in these results. */
  attributions: z.array(
    z.object({ providerName: z.string(), text: z.string(), url: z.string().nullable() }),
  ),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** Turn a query back into URL params (omitting defaults), for links, pagination and sharing. */
export function toSearchParams(query: SearchQuery): URLSearchParams {
  const p = new URLSearchParams();
  const setList = (key: string, v: readonly string[] | undefined) => {
    if (v?.length) p.set(key, v.join(','));
  };
  if (query.q) p.set('q', query.q);
  setList('pillar', query.pillar);
  setList('type', query.type);
  setList('sector', query.sector);
  if (query.levelMin !== undefined) p.set('levelMin', String(query.levelMin));
  if (query.levelMax !== undefined) p.set('levelMax', String(query.levelMax));
  if (query.qualified !== undefined) p.set('qualified', String(query.qualified));
  if (query.free) p.set('free', '1');
  if (query.costMax !== undefined) p.set('costMax', String(query.costMax));
  if (query.payMin !== undefined) p.set('payMin', String(query.payMin));
  setList('workMode', query.workMode);
  if (query.near) p.set('near', query.near);
  if (query.radius !== undefined) p.set('radius', String(query.radius));
  if (query.age !== undefined) p.set('age', String(query.age));
  if (query.noExperience) p.set('noExperience', '1');
  if (query.openOnly === false) p.set('openOnly', '0');
  if (query.sort) p.set('sort', query.sort);
  if (query.page && query.page > 1) p.set('page', String(query.page));
  if (query.pageSize) p.set('pageSize', String(query.pageSize));
  return p;
}

/** Parse Next.js-style `searchParams` (string | string[] | undefined values). */
export function parseSearchQuery(raw: Record<string, string | string[] | undefined>): SearchQuery {
  return SearchQuerySchema.parse(raw);
}

/** How many filters are active (for the "Filters (3)" button). Excludes q, sort, paging. */
export function activeFilterCount(query: SearchQuery): number {
  let n = 0;
  if (query.pillar?.length) n++;
  if (query.type?.length) n++;
  if (query.sector?.length) n++;
  if (query.levelMin !== undefined || query.levelMax !== undefined) n++;
  if (query.qualified !== undefined) n++;
  if (query.free) n++;
  if (query.costMax !== undefined) n++;
  if (query.payMin !== undefined) n++;
  if (query.workMode?.length) n++;
  if (query.near) n++;
  if (query.age !== undefined) n++;
  if (query.noExperience) n++;
  return n;
}
