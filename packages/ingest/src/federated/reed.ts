import { type ProviderMeta, ProviderMetaSchema } from '@unneet/domain';
import { z } from 'zod';
import { type FederatedJob, toFederatedCard } from './card';
import type { FederatedProvider } from './types';

/**
 * Reed Jobseeker API: https://www.reed.co.uk/developers/jobseeker
 *   GET https://www.reed.co.uk/api/1.0/search?keywords&locationName&distanceFromLocation&minimumSalary&resultsToTake&resultsToSkip
 *   Auth: HTTP Basic, API key as the username, empty password.
 *
 * Policy `cache`: Reed's API terms aren't published in its docs, so we do NOT mirror its data. We
 * query at request time, cache results briefly, link straight out and attribute. Confirm Reed's
 * terms in writing before a commercial launch (tracked in docs/DATA-SOURCES.md).
 *
 * STATUS: written to the documented request/response fields and covered by a hand-written fixture;
 * not yet exercised against the live API (needs REED_API_KEY).
 */
export const REED_PROVIDER: ProviderMeta = ProviderMetaSchema.parse({
  id: 'reed',
  name: 'Reed',
  licence: 'Reed API terms',
  attribution: 'Jobs from reed.co.uk',
  attributionUrl: 'https://www.reed.co.uk/',
  storagePolicy: 'cache',
  isSample: false,
  requiresKey: true,
});

const ReedJob = z
  .object({
    jobId: z.union([z.number(), z.string()]).transform(String),
    employerName: z.string().optional().default('Employer'),
    jobTitle: z.string(),
    locationName: z.string().optional().default('UK'),
    minimumSalary: z.number().nullable().optional(),
    maximumSalary: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    expirationDate: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    jobDescription: z.string().optional().default(''),
    jobUrl: z.string().optional(),
  })
  .passthrough();

const ReedResponse = z.object({
  results: z.array(z.unknown()).default([]),
  totalResults: z.number().default(0),
});

/** Reed dates are "dd/mm/yyyy". */
export function parseReedDate(value: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapReedJob(raw: unknown): FederatedJob | null {
  const parsed = ReedJob.safeParse(raw);
  if (!parsed.success) return null;
  const j = parsed.data;
  if (!j.jobUrl?.startsWith('https://')) return null;
  const hasPay = (j.minimumSalary ?? j.maximumSalary) != null && (j.currency ?? 'GBP') === 'GBP';
  return {
    externalId: j.jobId,
    title: j.jobTitle,
    description: j.jobDescription,
    employer: j.employerName,
    url: j.jobUrl,
    locationLabel: j.locationName,
    pay: hasPay
      ? {
          min: j.minimumSalary ?? null,
          max: j.maximumSalary ?? null,
          unit: 'year',
          isEstimate: false,
          note: 'As advertised on Reed. Check the listing.',
        }
      : null,
    postedAt: parseReedDate(j.date),
    closesAt: parseReedDate(j.expirationDate),
  };
}

export const reedProvider: FederatedProvider = {
  meta: REED_PROVIDER,
  maxCacheSeconds: 15 * 60,
  isConfigured: (env) => Boolean(env.REED_API_KEY),
  async search(query, ctx) {
    const key = ctx.env.REED_API_KEY;
    if (!key) return { items: [], total: 0 };
    const params = new URLSearchParams();
    if (query.keywords) params.set('keywords', query.keywords);
    if (query.location) params.set('locationName', query.location);
    if (query.distanceMiles)
      params.set('distanceFromLocation', String(Math.round(query.distanceMiles)));
    if (query.minSalary) params.set('minimumSalary', String(query.minSalary));
    params.set('resultsToTake', String(Math.min(query.pageSize, 100)));
    params.set('resultsToSkip', String((query.page - 1) * query.pageSize));
    const auth = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
    const body = ReedResponse.parse(
      await ctx.http.getJson(`https://www.reed.co.uk/api/1.0/search?${params}`, {
        headers: { authorization: auth },
        timeoutMs: 5000,
        retries: 1,
      }),
    );
    const items = body.results
      .map(mapReedJob)
      .filter((j): j is FederatedJob => j !== null)
      .map((j) => toFederatedCard(j, REED_PROVIDER));
    return { items, total: body.totalResults };
  },
};
