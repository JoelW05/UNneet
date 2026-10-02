import 'server-only';
import type {
  OpportunityCard,
  OpportunityDetail,
  SearchQuery,
  SearchResponse,
} from '@unneet/domain';
import { toSearchParams } from '@unneet/domain';
import { cache } from 'react';
import type {
  CurrentUser,
  ExternalResults,
  InterestsQuiz,
  PathwayDetail,
  PathwaySummary,
  Stats,
  Taxonomy,
} from '@/lib/api-types';
import { serverApi } from './api';

export type {
  CurrentUser,
  ExternalResults,
  InterestsQuiz,
  PathwayDetail,
  PathwaySummary,
  Stats,
  Taxonomy,
} from '@/lib/api-types';

/**
 * The server-side data-access layer: the ONLY place pages talk to the API. Keeping it in one
 * module means one place to handle outages, one place to add caching, and no secrets or raw
 * fetches scattered through components (see the Next.js data-security guide).
 */
export class DataError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

interface Result {
  data?: unknown;
  error?: unknown;
  response: Response;
}

/** Unwrap a client call, mapping failures to a DataError the page can turn into a 404 or an error page. */
async function expectData<T>(run: Promise<Result>): Promise<T> {
  let result: Result;
  try {
    result = await run;
  } catch {
    throw new DataError(503, 'The service is not reachable right now.');
  }
  if (result.data !== undefined) return result.data as T;
  const detail =
    (result.error as { detail?: string } | undefined)?.detail ??
    `Request failed (${result.response.status})`;
  throw new DataError(result.response.status, detail);
}

/** Like `expectData` but a 404 becomes `null`. */
async function maybeData<T>(run: Promise<Result>): Promise<T | null> {
  try {
    return await expectData<T>(run);
  } catch (error) {
    if (error instanceof DataError && error.status === 404) return null;
    throw error;
  }
}

const queryObject = (query: SearchQuery): Record<string, string> =>
  Object.fromEntries(toSearchParams(query));

export const getStats = cache(async (): Promise<Stats> => {
  const api = await serverApi();
  return expectData<Stats>(api.GET('/v1/stats') as Promise<Result>);
});

export const getTaxonomy = cache(async (): Promise<Taxonomy> => {
  const api = await serverApi();
  return expectData<Taxonomy>(api.GET('/v1/taxonomy') as Promise<Result>);
});

/** First-party results. Partner job boards are fetched separately so they can stream in. */
export async function searchOpportunities(query: SearchQuery): Promise<SearchResponse> {
  const api = await serverApi();
  return expectData<SearchResponse>(
    api.GET('/v1/opportunities', {
      params: { query: { ...queryObject(query), external: '0' } },
    }) as Promise<Result>,
  );
}

export async function searchExternal(query: SearchQuery): Promise<ExternalResults> {
  const api = await serverApi();
  return expectData<ExternalResults>(
    api.GET('/v1/opportunities/external', {
      params: { query: queryObject(query) },
    }) as Promise<Result>,
  );
}

export const getOpportunity = cache(async (slug: string): Promise<OpportunityDetail | null> => {
  const api = await serverApi();
  return maybeData<OpportunityDetail>(
    api.GET('/v1/opportunities/{slug}', { params: { path: { slug } } }) as Promise<Result>,
  );
});

export async function getSimilar(slug: string, limit = 6): Promise<OpportunityCard[]> {
  const api = await serverApi();
  const r = await expectData<{ items: OpportunityCard[] }>(
    api.GET('/v1/opportunities/{slug}/similar', {
      params: { path: { slug }, query: { limit: String(limit) } },
    }) as Promise<Result>,
  );
  return r.items;
}

export const getPathways = cache(async (): Promise<PathwaySummary[]> => {
  const api = await serverApi();
  const r = await expectData<{ items: PathwaySummary[] }>(
    api.GET('/v1/pathways') as Promise<Result>,
  );
  return r.items;
});

export const getPathway = cache(async (slug: string): Promise<PathwayDetail | null> => {
  const api = await serverApi();
  return maybeData<PathwayDetail>(
    api.GET('/v1/pathways/{slug}', { params: { path: { slug } } }) as Promise<Result>,
  );
});

export const getInterestsQuiz = cache(async (): Promise<InterestsQuiz> => {
  const api = await serverApi();
  return expectData<InterestsQuiz>(api.GET('/v1/quizzes/interests') as Promise<Result>);
});

/** The signed-in user, or null. Never throws: an outage must not break the public pages. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const api = await serverApi({ withSession: true });
    const result = (await api.GET('/v1/me')) as Result;
    return (result.data as { user: CurrentUser } | undefined)?.user ?? null;
  } catch {
    return null;
  }
});
