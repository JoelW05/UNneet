import {
  htmlToText,
  normalisePostcode,
  type OpportunityInput,
  type OpportunityTag,
  type Pay,
  type ProviderMeta,
  ProviderMetaSchema,
  type SectorSlug,
  truncate,
} from '@unneet/domain';
import { z } from 'zod';
import type { GeoPoint } from '../geo';
import { websiteUrl } from '../lib/url';
import type { AdapterContext, Mapped, ProviderAdapter } from '../types';

/**
 * Teaching Vacancies (Department for Education): every job advertised by state schools in
 * England, teaching AND support roles (teaching assistants, caretakers, cleaners, chefs, office
 * staff, IT support, apprentices), which makes it one of the best sources of entry-level jobs
 * for young people. A public JSON feed of schema.org `JobPosting`s, published under the Open
 * Government Licence v3.0:
 *   https://teaching-vacancies.service.gov.uk/api/v1/jobs.json?page=N   (100 per page)
 * Terms for API users: https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions
 * (OGL; "you must not charge any fee or commission for contacting, interviewing or hiring" a
 * candidate if you reuse the data; and the service expects a Referer, which we send.)
 */
export const TEACHING_VACANCIES_PROVIDER: ProviderMeta = ProviderMetaSchema.parse({
  id: 'teaching-vacancies',
  name: 'Teaching Vacancies',
  licence: 'Open Government Licence v3.0',
  attribution:
    'School job listings from Teaching Vacancies (Department for Education). Contains public sector information licensed under the Open Government Licence v3.0.',
  attributionUrl: 'https://teaching-vacancies.service.gov.uk/',
  storagePolicy: 'store',
  isSample: false,
  requiresKey: false,
});

const FEED_URL = 'https://teaching-vacancies.service.gov.uk/api/v1/jobs.json';
const SITE_REFERER = 'https://unneet.example/';
/** The feed repeats some rows and shifts while we page, so accept a near-complete crawl. */
const MIN_COMPLETE = 0.98;

const text = z.union([z.string(), z.number()]).nullable().optional();

export const TvJobSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    jobBenefits: z.string().nullable().optional(),
    datePosted: text,
    validThrough: text,
    occupationalCategory: z.string().nullable().optional(),
    employmentType: z
      .union([z.array(z.string()), z.string()])
      .nullable()
      .optional(),
    url: z.string().optional(),
    jobLocation: z
      .object({
        address: z
          .object({
            addressLocality: text,
            addressRegion: text,
            postalCode: text,
          })
          .partial()
          .nullable()
          .optional(),
      })
      .partial()
      .nullable()
      .optional(),
    baseSalary: z
      .object({
        value: z
          .object({ value: text, unitText: z.string().nullable().optional() })
          .partial()
          .nullable()
          .optional(),
      })
      .partial()
      .nullable()
      .optional(),
    hiringOrganization: z.object({ name: text, sameAs: text }).partial().nullable().optional(),
  })
  .passthrough();
export type TvJob = z.infer<typeof TvJobSchema>;

/** A feed row plus any coordinates the adapter looked up for its postcode. */
export type TvRecord = TvJob & { _geo?: GeoPoint | undefined };

/** Stable id: the job page's slug, e.g. "learning-support-assistant-saint-john-bosco-college". */
export function jobIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== 'teaching-vacancies.service.gov.uk') return null;
    const match = /^\/jobs\/([a-z0-9-]+)\/?$/i.exec(u.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const NUMBER = String.raw`£?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const RANGE = new RegExp(`${NUMBER}\\s*(?:-|–|—|to|up to|and)\\s*${NUMBER}`, 'gi');
const SINGLE = new RegExp(NUMBER, 'g');
const BOUNDS = { year: { min: 8000, max: 250_000 }, hour: { min: 5, max: 150 } } as const;
const HOURLY_WORDS = /\b(per hour|an hour|hourly|p\/h)\b/i;

const amount = (whole: string | undefined, pence: string | undefined): number =>
  Number(`${(whole ?? '').replaceAll(',', '')}${pence ? `.${pence}` : ''}`);

/**
 * Schools write salaries as free text ("MPS (£39,196 -£52,241)", "Grade 6, £31,828 - £32,364 per
 * annum", "N2 £26,016 pro rata", "Between £30,000 and £35,000", "Up to £39,201"). We only claim
 * a number when the text clearly gives one: the first range, else the first single amount
 * ("up to" gives only a maximum, "from" only a minimum), inside plausible bounds for the unit.
 * The unit comes from the feed, unless the wording says hourly ("£13.11 Hourly" under a YEAR unit
 * is common). Pay scales with no figures ("MPS", "Leadership Group L6") and impossible figures
 * ("£12.85 Annually") give no pay at all rather than a guess. The advertised wording is always
 * kept in `note`, so nothing is hidden.
 */
export function parseTvSalary(
  raw: string | number | null | undefined,
  unitText: string | null | undefined,
): Pay | null {
  const original = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!original) return null;
  const stated =
    unitText?.toUpperCase() === 'HOUR'
      ? 'hour'
      : unitText?.toUpperCase() === 'YEAR'
        ? 'year'
        : null;
  const unit = HOURLY_WORDS.test(original) ? 'hour' : stated;
  if (!unit) return null;
  const { min: lo, max: hi } = BOUNDS[unit];
  const inBounds = (n: number) => n >= lo && n <= hi;

  let min: number | null = null;
  let max: number | null = null;
  // The first plausible range wins ("Points 3 to 4" is skipped because 3 is no salary)...
  for (const range of original.matchAll(RANGE)) {
    const a = amount(range[1], range[2]);
    const b = amount(range[3], range[4]);
    if (inBounds(a) && inBounds(b)) {
      [min, max] = a <= b ? [a, b] : [b, a];
      break;
    }
  }
  // ...otherwise the first plausible single figure.
  if (min === null) {
    for (const single of original.matchAll(SINGLE)) {
      const a = amount(single[1], single[2]);
      if (!inBounds(a)) continue;
      const before = original.slice(0, single.index).toLowerCase();
      if (/\bup to\s*$/.test(before)) [min, max] = [null, a];
      else if (/\b(from|starting at|starts at|minimum)\s*$/.test(before)) [min, max] = [a, null];
      else [min, max] = [a, a];
      break;
    }
  }
  if (min === null && max === null) return null;
  return { min, max, unit, isEstimate: false, note: `As advertised: ${truncate(original, 240)}` };
}

const LEADERSHIP_OR_TEACHING = new Set([
  'teacher',
  'teaching_assistant',
  'higher_level_teaching_assistant',
  'sendco',
  'headteacher',
  'deputy_headteacher',
  'assistant_headteacher',
  'other_leadership',
  'head_of_department_or_curriculum',
  'head_of_year_or_phase',
  'education_support',
  'student_support_learning_and_progress',
  'leadership_and_management',
]);

/** Only categories that clearly map; everything else is left to the shared text classifier. */
function sectorFor(category: string | null | undefined): SectorSlug | undefined {
  if (!category) return undefined;
  if (LEADERSHIP_OR_TEACHING.has(category)) return 'education-early-years';
  if (category === 'administration_hr_data_and_finance') return 'business-administration';
  if (category === 'it_support') return 'digital';
  return undefined;
}

/** QTS (and in practice a degree) is needed to teach in a state school; FE-style trainers are not teachers in that sense. */
const NOT_SCHOOL_TEACHER = /\b(lecturer|trainer|instructor|assessor|tutor|coach|technician)\b/i;
const DEGREE_CATEGORIES = new Set([
  'teacher',
  'headteacher',
  'deputy_headteacher',
  'assistant_headteacher',
]);

const APPRENTICE_ROLE = /\bapprentice\b/i;

const asIso = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const MAX_DESCRIPTION = 19_500;

export function mapTvJob(raw: unknown): Mapped {
  const parsed = TvJobSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not an object' };
  const job = parsed.data as TvRecord;
  const id = jobIdFromUrl(job.url);
  if (!id || !job.url)
    return { ok: false, reason: `unusable url: ${String(job.url).slice(0, 80)}` };
  const title = (job.title ?? '').trim();
  if (title.length < 3) return { ok: false, reason: `${id}: missing title` };

  const address = job.jobLocation?.address ?? {};
  const postcode = address.postalCode ? String(address.postalCode).trim() : '';
  const label =
    String(address.addressLocality ?? '').trim() ||
    String(address.addressRegion ?? '').trim() ||
    postcode ||
    'England';
  const geo = job._geo;

  const types = Array.isArray(job.employmentType)
    ? job.employmentType
    : job.employmentType
      ? [job.employmentType]
      : [];
  const partTimeOnly = types.includes('PART_TIME') && !types.includes('FULL_TIME');
  const temporary = types.includes('TEMPORARY');
  const isApprenticeship = APPRENTICE_ROLE.test(title);

  const body = htmlToText(job.description ?? '');
  const benefits = job.jobBenefits ? htmlToText(job.jobBenefits) : '';
  const description = truncate(
    [body, benefits ? `Benefits: ${benefits}` : ''].filter(Boolean).join('\n\n') || title,
    MAX_DESCRIPTION,
  );

  const category = job.occupationalCategory ?? null;
  const needsDegree =
    category !== null && DEGREE_CATEGORIES.has(category) && !NOT_SCHOOL_TEACHER.test(title);
  const sector = sectorFor(category);

  const tags: OpportunityTag[] = [];
  if (partTimeOnly) tags.push('part-time');
  if (isApprenticeship) tags.push('accredited', 'government-funded');

  const salary = job.baseSalary?.value;
  const pay = parseTvSalary(salary?.value, salary?.unitText);

  const input: OpportunityInput = {
    externalId: id,
    type: isApprenticeship ? 'apprenticeship' : 'job',
    title,
    description,
    organisation: {
      name: String(job.hiringOrganization?.name ?? '').trim() || 'A school in England',
      url: websiteUrl(
        job.hiringOrganization?.sameAs === undefined ? null : String(job.hiringOrganization.sameAs),
      ),
    },
    applyUrl: job.url,
    ...(sector ? { sector } : {}),
    level: null,
    minEntryLevel: needsDegree ? 6 : null,
    location: {
      label,
      workMode: 'onsite',
      country: 'england',
      ...(geo?.region ? { region: geo.region } : {}),
      ...(postcode ? { postcode } : {}),
      ...(geo ? { lat: geo.lat, lon: geo.lon } : {}),
    },
    pay,
    cost: isApprenticeship
      ? { kind: 'free', amount: null, note: 'Apprenticeship training is free to you.' }
      : { kind: 'unknown', amount: null },
    duration: temporary ? 'Temporary or fixed term' : null,
    postedAt: asIso(job.datePosted),
    closesAt: asIso(job.validThrough),
    minAge: isApprenticeship ? 16 : null,
    tags,
  };
  return { ok: true, input };
}

interface FeedPage {
  data?: unknown[];
  meta?: { totalPages?: number; count?: number };
  links?: { next?: string | null };
}

export const teachingVacanciesAdapter: ProviderAdapter = {
  meta: TEACHING_VACANCIES_PROVIDER,
  fullFeed: true,
  isConfigured: () => true,
  async *fetch(ctx: AdapterContext) {
    const referer = ctx.env.SITE_ORIGIN
      ? `${ctx.env.SITE_ORIGIN.replace(/\/$/, '')}/`
      : SITE_REFERER;
    const seenIds = new Set<string>();
    let rows = 0;
    let reported = 0;

    for (let page = 1; ; page += 1) {
      const body = await ctx.http.getJson<FeedPage>(`${FEED_URL}?page=${page}`, {
        headers: { referer },
        timeoutMs: 90_000,
      });
      const items = (body.data ?? []) as TvRecord[];
      rows += items.length;
      reported = body.meta?.count ?? reported;

      // One bulk postcode lookup per page (100 jobs) instead of 100 separate ones.
      const geo = await ctx.geocoder.postcodes(
        items
          .map((j) => j.jobLocation?.address?.postalCode)
          .filter((p): p is string => typeof p === 'string'),
      );
      for (const job of items) {
        const id = jobIdFromUrl(job.url);
        if (id) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        }
        const point = geo.get(
          normalisePostcode(String(job.jobLocation?.address?.postalCode ?? '')) ?? '',
        );
        yield point ? { ...job, _geo: point } : job;
      }
      if (items.length === 0 || !body.links?.next) break;
    }

    // The crawl takes a minute and the feed moves under it. Complete enough to trust, or say so
    // loudly: an incomplete crawl must not be treated as "everything else has closed".
    if (reported > 0 && rows < reported * MIN_COMPLETE) {
      throw new Error(`Teaching Vacancies feed incomplete: received ${rows} of ${reported} rows`);
    }
  },
  map: (raw) => mapTvJob(raw),
};
