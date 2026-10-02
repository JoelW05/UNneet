import { type ProviderMeta, ProviderMetaSchema } from '@unneet/domain';
import { z } from 'zod';
import { type FederatedJob, toFederatedCard } from './card';
import type { FederatedProvider } from './types';

/**
 * Adzuna API: https://developer.adzuna.com/
 *   GET https://api.adzuna.com/v1/api/jobs/gb/search/{page}?app_id&app_key&what&where&distance(km)&salary_min&results_per_page
 *
 * Policy `cache`. Terms (https://developer.adzuna.com/docs/terms_of_service) that shape this file:
 *   - commercial use needs a licence agreement (14-day trial for validation only);
 *   - data may not be aggregated/used in its original format without authorisation: so we never
 *     store it and cache for minutes only;
 *   - attribution badge "Jobs by Adzuna" (≥116×23px) must be shown wherever results appear;
 *   - default limits 25/min, 250/day, 1000/week, 2500/month: the gateway budgets against these.
 *
 * STATUS: written to the documented fields; covered by a hand-written fixture; not yet exercised
 * against the live API (needs ADZUNA_APP_ID + ADZUNA_APP_KEY and a licence for commercial use).
 */
export const ADZUNA_PROVIDER: ProviderMeta = ProviderMetaSchema.parse({
  id: 'adzuna',
  name: 'Adzuna',
  licence: 'Adzuna API terms (commercial licence required)',
  attribution: 'Jobs by Adzuna',
  attributionUrl: 'https://www.adzuna.co.uk/',
  storagePolicy: 'cache',
  isSample: false,
  requiresKey: true,
});

const AdzunaJob = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    title: z.string(),
    description: z.string().optional().default(''),
    created: z.string().nullable().optional(),
    redirect_url: z.string(),
    company: z.object({ display_name: z.string().optional() }).partial().optional(),
    location: z.object({ display_name: z.string().optional() }).partial().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    salary_min: z.number().nullable().optional(),
    salary_max: z.number().nullable().optional(),
    salary_is_predicted: z.union([z.string(), z.number(), z.boolean()]).optional(),
    contract_time: z.string().nullable().optional(),
  })
  .passthrough();

const AdzunaResponse = z.object({
  results: z.array(z.unknown()).default([]),
  count: z.number().default(0),
});

const KM_PER_MILE = 1.609344;

export function mapAdzunaJob(raw: unknown): FederatedJob | null {
  const parsed = AdzunaJob.safeParse(raw);
  if (!parsed.success) return null;
  const j = parsed.data;
  if (!j.redirect_url.startsWith('https://')) return null;
  const predicted =
    j.salary_is_predicted === true || j.salary_is_predicted === '1' || j.salary_is_predicted === 1;
  const hasPay = (j.salary_min ?? j.salary_max) != null;
  return {
    externalId: j.id,
    title: j.title,
    description: j.description,
    employer: j.company?.display_name ?? 'Employer',
    url: j.redirect_url,
    locationLabel: j.location?.display_name ?? 'UK',
    lat: j.latitude ?? null,
    lon: j.longitude ?? null,
    pay: hasPay
      ? {
          min: j.salary_min ?? null,
          max: j.salary_max ?? null,
          unit: 'year',
          isEstimate: predicted,
          note: predicted ? 'Salary estimate powered by Adzuna Jobsworth.' : null,
        }
      : null,
    postedAt: j.created ? new Date(j.created).toISOString() : null,
    closesAt: null,
    fullTime: j.contract_time ? j.contract_time === 'full_time' : null,
  };
}

export const adzunaProvider: FederatedProvider = {
  meta: ADZUNA_PROVIDER,
  maxCacheSeconds: 15 * 60,
  isConfigured: (env) => Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
  async search(query, ctx) {
    const { ADZUNA_APP_ID: id, ADZUNA_APP_KEY: key } = ctx.env;
    if (!id || !key) return { items: [], total: 0 };
    const params = new URLSearchParams({
      app_id: id,
      app_key: key,
      results_per_page: String(Math.min(query.pageSize, 50)),
      'content-type': 'application/json',
    });
    if (query.keywords) params.set('what', query.keywords);
    if (query.location) params.set('where', query.location);
    if (query.distanceMiles)
      params.set('distance', String(Math.round(query.distanceMiles * KM_PER_MILE)));
    if (query.minSalary) params.set('salary_min', String(query.minSalary));
    const body = AdzunaResponse.parse(
      await ctx.http.getJson(
        `https://api.adzuna.com/v1/api/jobs/gb/search/${query.page}?${params}`,
        {
          timeoutMs: 5000,
          retries: 1,
        },
      ),
    );
    const items = body.results
      .map(mapAdzunaJob)
      .filter((j): j is FederatedJob => j !== null)
      .map((j) => toFederatedCard(j, ADZUNA_PROVIDER));
    return { items, total: body.count };
  },
};
