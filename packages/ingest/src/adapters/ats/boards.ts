import type { Pay, WorkMode } from '@unneet/domain';
import { z } from 'zod';
import { type AtsEmployer, type AtsJob, unescapeHtml } from './common';

/**
 * The three public job-board APIs. Each is unauthenticated, JSON, and documented by the vendor as
 * the way to build a careers page from an employer's published postings (Lever's README adds that
 * published postings "may be scraped by third parties"):
 *   Greenhouse  GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever       GET https://api.lever.co/v0/postings/{token}?mode=json
 *   Ashby       GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
 * Each mapper is pure and returns null for rows it cannot use.
 */

const str = z.union([z.string(), z.number()]).nullable().optional();
const asString = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

// --- Greenhouse -----------------------------------------------------------------------------

const GreenhouseJob = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    absolute_url: z.string(),
    location: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
    content: z.string().nullable().optional(),
    first_published: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export const greenhouseUrl = (token: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;

export function mapGreenhouse(raw: unknown, employer: AtsEmployer): AtsJob | null {
  const p = GreenhouseJob.safeParse(raw);
  if (!p.success) return null;
  const j = p.data;
  return {
    employer,
    id: String(j.id),
    title: j.title,
    description: unescapeHtml(j.content ?? ''),
    url: j.absolute_url,
    locationText: j.location?.name ?? '',
    countryCode: null,
    workplaceType: null,
    postedAt: j.first_published ?? j.updated_at ?? null,
    employmentType: null,
    pay: null,
  };
}

// --- Lever ----------------------------------------------------------------------------------

const LeverJob = z
  .object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string().optional(),
    country: z.string().nullable().optional(),
    workplaceType: z.string().nullable().optional(),
    createdAt: z.number().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    additionalPlain: z.string().nullable().optional(),
    categories: z
      .object({
        location: z.string().nullable().optional(),
        allLocations: z.array(z.string()).nullable().optional(),
        commitment: z.string().nullable().optional(),
      })
      .partial()
      .nullable()
      .optional(),
    lists: z
      .array(
        z.object({
          text: z.string().nullable().optional(),
          content: z.string().nullable().optional(),
        }),
      )
      .nullable()
      .optional(),
    salaryRange: z
      .object({
        min: z.number().nullable().optional(),
        max: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        interval: z.string().nullable().optional(),
      })
      .partial()
      .nullable()
      .optional(),
  })
  .passthrough();

export const leverUrl = (token: string): string =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;

const WORKPLACE: Readonly<Record<string, WorkMode>> = {
  remote: 'remote',
  hybrid: 'hybrid',
  'on-site': 'onsite',
  onsite: 'onsite',
};

function leverPay(range: z.infer<typeof LeverJob>['salaryRange']): Pay | null {
  if (!range || (range.currency ?? '').toUpperCase() !== 'GBP') return null;
  const interval = (range.interval ?? '').toLowerCase();
  const unit = interval.includes('hour') ? 'hour' : interval.includes('year') ? 'year' : null;
  if (!unit || (range.min == null && range.max == null)) return null;
  return {
    min: range.min ?? null,
    max: range.max ?? null,
    unit,
    isEstimate: false,
    note: 'As advertised by the employer.',
  };
}

export function mapLever(raw: unknown, employer: AtsEmployer): AtsJob | null {
  const p = LeverJob.safeParse(raw);
  if (!p.success) return null;
  const j = p.data;
  const hostedUrl = j.hostedUrl;
  if (!hostedUrl) return null;
  const locations = j.categories?.allLocations?.length
    ? j.categories.allLocations.join('; ')
    : (j.categories?.location ?? '');
  const lists = (j.lists ?? []).map((l) => `<h3>${l.text ?? ''}</h3>${l.content ?? ''}`).join('');
  const body = j.description ?? (j.descriptionPlain ? `<p>${j.descriptionPlain}</p>` : '');
  return {
    employer,
    id: j.id,
    title: j.text,
    description: `${body}${lists}${j.additionalPlain ? `<p>${j.additionalPlain}</p>` : ''}`,
    url: hostedUrl,
    locationText: locations,
    countryCode: j.country ?? null,
    workplaceType: WORKPLACE[(j.workplaceType ?? '').toLowerCase()] ?? null,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    employmentType: j.categories?.commitment ?? null,
    pay: leverPay(j.salaryRange),
  };
}

// --- Ashby ----------------------------------------------------------------------------------

const AshbyJob = z
  .object({
    id: z.string(),
    title: z.string(),
    location: str,
    isListed: z.boolean().nullable().optional(),
    isRemote: z.boolean().nullable().optional(),
    workplaceType: z.string().nullable().optional(),
    employmentType: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    jobUrl: z.string().optional(),
    descriptionHtml: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    address: z
      .object({
        postalAddress: z
          .object({ addressCountry: str, addressLocality: str })
          .partial()
          .nullable()
          .optional(),
      })
      .partial()
      .nullable()
      .optional(),
    compensation: z
      .object({
        compensationTiers: z
          .array(
            z.object({
              components: z
                .array(
                  z
                    .object({
                      compensationType: z.string().nullable().optional(),
                      interval: z.string().nullable().optional(),
                      currencyCode: z.string().nullable().optional(),
                      minValue: z.number().nullable().optional(),
                      maxValue: z.number().nullable().optional(),
                    })
                    .passthrough(),
                )
                .nullable()
                .optional(),
            }),
          )
          .nullable()
          .optional(),
      })
      .partial()
      .nullable()
      .optional(),
  })
  .passthrough();

export const ashbyUrl = (token: string): string =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`;

const ASHBY_WORKPLACE: Readonly<Record<string, WorkMode>> = {
  remote: 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
};

/** Ashby gives the country as a name ("United Kingdom"), not a code. Map it, or say "not UK". */
function ashbyCountryCode(name: string): string | null {
  if (!name) return null;
  return /^(united kingdom|uk|gb|great britain|england|scotland|wales|northern ireland)$/i.test(
    name.trim(),
  )
    ? 'GB'
    : 'XX';
}

function ashbyPay(c: z.infer<typeof AshbyJob>['compensation']): Pay | null {
  for (const tier of c?.compensationTiers ?? []) {
    for (const comp of tier.components ?? []) {
      if ((comp.compensationType ?? '').toLowerCase() !== 'salary') continue;
      if ((comp.currencyCode ?? '').toUpperCase() !== 'GBP') continue;
      const interval = (comp.interval ?? '').toLowerCase();
      const unit = interval.includes('hour') ? 'hour' : interval.includes('year') ? 'year' : null;
      if (!unit || (comp.minValue == null && comp.maxValue == null)) continue;
      return {
        min: comp.minValue ?? null,
        max: comp.maxValue ?? null,
        unit,
        isEstimate: false,
        note: 'As advertised by the employer.',
      };
    }
  }
  return null;
}

export function mapAshby(raw: unknown, employer: AtsEmployer): AtsJob | null {
  const p = AshbyJob.safeParse(raw);
  if (!p.success || p.data.isListed === false) return null;
  const j = p.data;
  const jobUrl = j.jobUrl;
  if (!jobUrl) return null;
  const country = asString(j.address?.postalAddress?.addressCountry);
  const locality = asString(j.address?.postalAddress?.addressLocality);
  const location = asString(j.location);
  return {
    employer,
    id: j.id,
    title: j.title,
    description: j.descriptionHtml ?? (j.descriptionPlain ? `<p>${j.descriptionPlain}</p>` : ''),
    url: jobUrl,
    // The locality is the most precise place when Ashby has one ("London"), else the free text.
    locationText: locality && country ? `${locality}, ${country}` : location,
    countryCode: ashbyCountryCode(country),
    workplaceType:
      ASHBY_WORKPLACE[(j.workplaceType ?? '').toLowerCase()] ?? (j.isRemote ? 'remote' : null),
    postedAt: j.publishedAt ?? null,
    employmentType: j.employmentType ?? null,
    pay: ashbyPay(j.compensation),
  };
}
