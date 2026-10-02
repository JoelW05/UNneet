import {
  extractQualifications,
  formatPay,
  isPlausiblyUk,
  type Level,
  normalisePostcode,
  type OpportunityInput,
  type OpportunityTag,
  type ProviderMeta,
  ProviderMetaSchema,
  RegionSchema,
  SECTORS,
  type SectorSlug,
  tidyTitle,
  truncate,
} from '@unneet/domain';
import { z } from 'zod';
import { clean, rich, townCase } from '../lib/plain';
import { websiteUrl } from '../lib/url';
import type { AdapterContext, Env, Mapped, ProviderAdapter } from '../types';

/**
 * Find an apprenticeship: Display Advert API v2 (DfE / Education and Skills Funding Agency).
 * Open Government Licence v3.0, and the service itself advises storing the vacancies in your own
 * data store rather than calling it from a browser, so this adapter STORES them.
 *
 *   Base      https://api.apprenticeships.education.gov.uk/vacancies
 *   Auth      Ocp-Apim-Subscription-Key  +  X-Version: 2
 *   Limits    150 requests / 5 minutes (HTTP 429 beyond that): we pace at 2.1 s between pages
 *   Spec      https://developer.apprenticeships.education.gov.uk/Documentation/display-advert-api-v2
 *             (an OpenAPI 3 document is served at …/display-advert-api-v2/description)
 *
 * The field names below are the published schema, checked against live responses on 2026-10-01
 * (see test/fixtures/faa-vacancies.json, which is a trimmed recording of real vacancies).
 * Things the real data taught us that the schema alone does not say:
 *   - `wage.wageAmount` is empty in practice. The pay is the machine-formatted sentence in
 *     `wage.wageAdditionalInformation` ("£16,640 a year", "£12,480 to £19,827.60 a year").
 *   - `applicationUrl` is sometimes a bare host with no scheme, so the apply link is always
 *     `vacancyUrl` (the Find an apprenticeship page, which is where applying happens anyway).
 *   - `fullDescription` and the other long fields are HTML; `employerWebsiteUrl` may lack a scheme.
 *   - Employer contact name/phone/email exist in the schema. We never store them (data minimisation).
 */
export const FAA_PROVIDER: ProviderMeta = ProviderMetaSchema.parse({
  id: 'find-an-apprenticeship',
  name: 'Find an apprenticeship',
  licence: 'Open Government Licence v3.0',
  attribution:
    'Apprenticeship vacancies from Find an apprenticeship (GOV.UK). Contains public sector information licensed under the Open Government Licence v3.0.',
  attributionUrl: 'https://www.findapprenticeship.service.gov.uk/',
  storagePolicy: 'store',
  isSample: false,
  requiresKey: true,
});

const BASE_URL = 'https://api.apprenticeships.education.gov.uk/vacancies';
const PAGE_SIZE = 100;
/** 150 requests per 5 minutes is one every 2 s; stay just under. */
const PACE_MS = 2_100;
/** A crawl that returns less than this share of what the API says exists is not a full feed. */
const MIN_COMPLETE = 0.97;
const MAX_DESCRIPTION = 19_500;

const text = z.string().nullish();
const num = z.number().nullish();

const AddressSchema = z.object({
  addressLine1: text,
  addressLine2: text,
  addressLine3: text,
  addressLine4: text,
  postcode: text,
  latitude: num,
  longitude: num,
});
type Address = z.infer<typeof AddressSchema>;

const WageSchema = z.object({
  wageType: text,
  wageUnit: text,
  wageAmount: num,
  wageAdditionalInformation: text,
  workingWeekDescription: text,
});
type Wage = z.infer<typeof WageSchema>;

const QualificationSchema = z.object({
  weighting: text,
  qualificationType: text,
  subject: text,
  grade: text,
});
type Qualification = z.infer<typeof QualificationSchema>;

/** Every field is optional here; `mapFaaVacancy` checks what it needs and says why when it can't. */
export const FaaVacancySchema = z.object({
  vacancyReference: z.union([z.string(), z.number()]).transform(String).nullish(),
  vacancyUrl: text,
  title: text,
  description: text,
  fullDescription: text,
  numberOfPositions: num,
  postedDate: text,
  closingDate: text,
  startDate: text,
  wage: WageSchema.nullish(),
  hoursPerWeek: num,
  expectedDuration: text,
  addresses: z.array(AddressSchema).nullish(),
  employerName: text,
  employerWebsiteUrl: text,
  employerDescription: text,
  course: z.object({ title: text, level: num, route: text, type: text }).nullish(),
  providerName: text,
  isDisabilityConfident: z.boolean().nullish(),
  isNationalVacancy: z.boolean().nullish(),
  isNationalVacancyDetails: text,
  trainingDescription: text,
  additionalTrainingDescription: text,
  outcomeDescription: text,
  skills: z.array(z.string()).nullish(),
  qualifications: z.array(QualificationSchema).nullish(),
  thingsToConsider: text,
  companyBenefitsInformation: text,
  /** Attached by `fetch` from a bulk postcode lookup; carries the region the API does not give. */
  _geo: z
    .object({
      lat: z.number().nullish(),
      lon: z.number().nullish(),
      region: RegionSchema.nullish(),
      district: text,
    })
    .nullish(),
});
export type FaaVacancy = z.infer<typeof FaaVacancySchema>;

// --- small helpers -------------------------------------------------------------------------

const asIso = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** The API's route names are the Skills England routes, which are exactly our sector names. */
const routeKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
const SECTOR_BY_ROUTE: ReadonlyMap<string, SectorSlug> = new Map(
  SECTORS.map((s) => [routeKey(s.name), s.slug]),
);

/** Words that make a line a street, building or site rather than a town. */
const NOT_A_PLACE =
  /\b(road|rd|street|lane|ln|avenue|ave|drive|close|way|court|gardens|place|crescent|terrace|walk|square|mews|grove|rise|yard|farm|house|centre|center|college|school|hospital|estate|industrial|business|park|works|unit|building|campus|studios?|hall|stables|church|nursery|suite|floor|flat)\b|\bst$/i;
const A_COUNTRY = /^(united kingdom|uk|great britain|gb|england|wales|scotland)$/i;

/** Does this address line look like a town, village or county, rather than a street or a unit? */
function isPlaceName(s: string): boolean {
  return (
    s.length >= 3 && s.length <= 40 && !/\d/.test(s) && !NOT_A_PLACE.test(s) && !A_COUNTRY.test(s)
  );
}

/**
 * A readable place for the card. Employers fill the four address lines inconsistently: line 1 is
 * usually the street or unit, and the town can sit in line 2, 3 or 4 (units and business parks
 * often push it to the last line). So a line is only used when it reads like a place, preferring
 * "town, county" when both lines 3 and 4 do. Otherwise we fall back to the postcode's local
 * authority, then the postcode itself.
 */
export function placeLabel(address: Address | undefined, district?: string | null): string {
  const line = (n: 2 | 3 | 4) => clean(address?.[`addressLine${n}` as const]);
  const [locality, town, county] = [line(2), line(3), line(4)];

  let label = '';
  if (isPlaceName(town) && isPlaceName(county)) label = `${townCase(town)}, ${townCase(county)}`;
  else if (isPlaceName(county)) label = townCase(county);
  else if (isPlaceName(town)) label = townCase(town);
  else if (isPlaceName(locality)) label = townCase(locality);
  return (
    label || townCase(clean(district)) || normalisePostcode(clean(address?.postcode)) || 'England'
  );
}

/**
 * The wage sentence comes in a few machine formats: "£16,640 a year", "£12,480 to £19,827.60 a
 * year" (standard adverts) and "£15600.00", "19514.00 - 19514.00", "£25760.00 to £27476.00"
 * (NHS and Civil Service adverts, which leave the unit to `wageUnit`). Anything that does not
 * start with a figure ("Competitive", "Negotiable") has no pay we can state.
 */
const WAGE_ANY =
  /^£?\s*([\d,]+(?:\.\d+)?)(?:\s*(?:to|-|–|—)\s*£?\s*([\d,]+(?:\.\d+)?))?(?:\s+(?:a|per)\s+(year|week|month|hour)\b)?/i;
const WAGE_UNIT: Readonly<Record<string, 'year' | 'month' | 'week' | 'hour'>> = {
  annually: 'year',
  monthly: 'month',
  weekly: 'week',
};
/** Sanity bounds per unit. A figure outside them is a typo or a different thing, not a wage. */
const WAGE_BOUNDS = {
  year: [4_000, 200_000],
  month: [330, 17_000],
  week: [75, 4_000],
  hour: [4, 100],
} as const;
const WAGE_NOTE: Readonly<Record<string, string>> = {
  ApprenticeshipMinimum: 'Apprenticeship minimum wage',
  NationalMinimum: 'National minimum wage, which depends on your age',
  CompetitiveSalary: 'Competitive salary',
};

type Pay = NonNullable<OpportunityInput['pay']>;

/** Pay from the wage block, or null when it is not a clear figure (we never guess one). */
export function parseFaaWage(wage: Wage | null | undefined): Pay | null {
  if (!wage) return null;
  const note = WAGE_NOTE[wage.wageType ?? ''] ?? null;
  const within = (n: number, unit: keyof typeof WAGE_BOUNDS) =>
    Number.isFinite(n) && n >= WAGE_BOUNDS[unit][0] && n <= WAGE_BOUNDS[unit][1];

  if (typeof wage.wageAmount === 'number' && wage.wageAmount > 0) {
    const unit = WAGE_UNIT[clean(wage.wageUnit).toLowerCase()] ?? 'year';
    if (within(wage.wageAmount, unit)) {
      return { min: wage.wageAmount, max: wage.wageAmount, unit, isEstimate: false, note };
    }
  }

  const m = WAGE_ANY.exec(clean(wage.wageAdditionalInformation));
  const figure = m?.[1];
  // A unit in the sentence wins; otherwise `wageUnit`. A figure that is implausible for the unit
  // ("£9.00" with an annual unit: an hourly rate? a typo?) is dropped, never guessed at.
  const unitName = m?.[3]?.toLowerCase() ?? WAGE_UNIT[clean(wage.wageUnit).toLowerCase()];
  if (!figure || !unitName) return null;
  const unit = unitName as keyof typeof WAGE_BOUNDS;
  const min = Number(figure.replace(/,/g, ''));
  const max = m?.[2] ? Number(m[2].replace(/,/g, '')) : min;
  if (!within(min, unit) || !within(max, unit) || max < min) return null;
  return { min, max, unit, isEstimate: false, note };
}

/** "Level 3 Early Years", "L2 Accounts", "LV2": employers write the level in many ways. */
const EXPLICIT_LEVEL = /\b(?:level|lv|l)\s?([2-7])\b/i;

/** The highest level an employer marks ESSENTIAL (desired ones do not count). Null if none do. */
function essentialLevel(quals: readonly Qualification[]): Level | null {
  let best: Level | null = null;
  const consider = (level: number) => {
    if (best === null || level > best) best = level as Level;
  };
  for (const q of quals) {
    if (q.weighting !== 'Essential') continue;
    const text = [q.qualificationType, q.subject, q.grade].map(clean).filter(Boolean).join(' ');
    const found = extractQualifications(text);
    if (found.found.length > 0) consider(found.highestLevel);
    const explicit = EXPLICIT_LEVEL.exec(text);
    if (explicit?.[1]) consider(Number(explicit[1]));
  }
  return best;
}

const lowerUnits = (s: string): string =>
  s.replace(/\b(Years?|Months?|Weeks?)\b/g, (u) => u.toLowerCase());

const bullets = (items: readonly string[]): string => items.map((i) => `• ${i}`).join('\n');

/**
 * The long description: what the job is, then everything a candidate needs to decide. Section
 * headings are their own short paragraphs ending in a colon. Everything is plain text.
 */
function buildDescription(
  v: FaaVacancy,
  pay: Pay | null,
  otherPlaces: readonly string[],
  where: { employer: string; place: string },
): string {
  const parts: string[] = [];
  const add = (heading: string, body: string | null | undefined) => {
    const t = (body ?? '').trim();
    if (t) parts.push(`${heading}:`, t);
  };
  const html = rich;

  const summary = html(v.description);
  const body = html(v.fullDescription);
  if (summary) parts.push(summary);
  // NHS and Civil Service adverts often carry no text at all. Say so rather than show a blank.
  else if (!body) {
    parts.push(
      `${where.employer} is recruiting an apprentice in ${where.place}. This advert is short: read the full details on Find an apprenticeship before you apply.`,
    );
  }
  add("What you'll do", body);
  add(
    'Your training',
    [html(v.trainingDescription), html(v.additionalTrainingDescription)]
      .filter(Boolean)
      .join('\n\n'),
  );
  add('After the apprenticeship', html(v.outcomeDescription));

  const skills = (v.skills ?? []).map(clean).filter(Boolean);
  if (skills.length > 0) add('Skills they are looking for', bullets(skills));

  const quals = v.qualifications ?? [];
  const describe = (q: Qualification) =>
    `${clean(q.subject) || 'Qualification'} (${[
      clean(q.qualificationType),
      clean(q.grade) ? `grade ${clean(q.grade)}` : '',
    ]
      .filter(Boolean)
      .join(', ')})`;
  const essential = quals.filter((q) => q.weighting === 'Essential').map(describe);
  const desired = quals.filter((q) => q.weighting !== 'Essential').map(describe);
  if (essential.length > 0) add('You will need', bullets(essential));
  if (desired.length > 0) add('Helpful, but not required', bullets(desired));

  const facts: string[] = [];
  const w = v.wage;
  const wageText = clean(w?.wageAdditionalInformation);
  const wageLabel = WAGE_NOTE[w?.wageType ?? ''];
  if (pay) {
    facts.push(`Pay: ${[wageLabel, formatPay(pay)].filter(Boolean).join(': ')}`);
  } else if (wageText && !/^(competitive|negotiable)$/i.test(wageText)) {
    // A figure we could not read with confidence: show it as written, and say why it is unclear.
    facts.push(
      `Pay: ${[wageLabel, wageText].filter(Boolean).join(': ')}${/^£?\d/.test(wageText) ? ' (the advert does not say per what: check before you apply)' : ''}`,
    );
  } else if (wageLabel) facts.push(`Pay: ${wageLabel}`);
  if (clean(w?.workingWeekDescription))
    facts.push(`Working week: ${clean(w?.workingWeekDescription)}`);
  if (v.hoursPerWeek) facts.push(`Hours: ${v.hoursPerWeek} a week, including training`);
  if (v.numberOfPositions && v.numberOfPositions > 1)
    facts.push(`Places available: ${v.numberOfPositions}`);
  if (clean(v.providerName)) facts.push(`Training provider: ${tidyTitle(clean(v.providerName))}`);
  if (v.isNationalVacancy) {
    facts.push('Open to people anywhere in England');
  }
  if (otherPlaces.length > 0) facts.push(`Also available in: ${otherPlaces.join(', ')}`);
  if (facts.length > 0) add('Key details', bullets(facts));

  add('About the employer', html(v.employerDescription));
  if (v.isNationalVacancy) add('Where you can work', html(v.isNationalVacancyDetails));
  add(
    'Good to know',
    [html(v.thingsToConsider), html(v.companyBenefitsInformation)].filter(Boolean).join('\n\n'),
  );

  return truncate(parts.join('\n\n'), MAX_DESCRIPTION);
}

export function mapFaaVacancy(raw: unknown): Mapped {
  const parsed = FaaVacancySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `unexpected shape at ${issue?.path.join('.') || 'record'}: ${issue?.message}`,
    };
  }
  const v = parsed.data;
  const ref = clean(v.vacancyReference);
  if (!ref) return { ok: false, reason: 'missing vacancyReference' };
  const title = clean(v.title);
  if (title.length < 3) return { ok: false, reason: `${ref}: missing title` };
  const applyUrl = clean(v.vacancyUrl);
  if (!applyUrl.startsWith('https://'))
    return { ok: false, reason: `${ref}: missing https vacancyUrl` };

  const level = v.course?.level ?? null;
  const pay = parseFaaWage(v.wage);

  const addresses = v.addresses ?? [];
  const first = addresses[0];
  const postcode = normalisePostcode(clean(first?.postcode));
  const lat = first?.latitude;
  const lon = first?.longitude;
  const hasPoint =
    typeof lat === 'number' && typeof lon === 'number' && isPlausiblyUk({ lat, lon });
  const geo = v._geo;
  const point = hasPoint
    ? { lat, lon }
    : typeof geo?.lat === 'number' && typeof geo.lon === 'number'
      ? { lat: geo.lat, lon: geo.lon }
      : null;

  const firstLabel = placeLabel(first, geo?.district);
  // Other sites are listed by name only when it is a real place (never a bare postcode).
  const otherPlaces = [
    ...new Set(
      addresses
        .slice(1)
        .map((a) => placeLabel(a))
        .filter((l) => l !== firstLabel && !/\d/.test(l) && l !== 'England'),
    ),
  ].slice(0, 6);
  const national = v.isNationalVacancy === true;

  const entry = essentialLevel(v.qualifications ?? []);
  // Employers say what they need, so believe them. With nothing marked essential, only the
  // higher levels (4+) imply a prior level: that is what makes them "higher" apprenticeships.
  const minEntryLevel = (entry ?? (level !== null && level >= 4 ? 3 : 0)) as Level;

  const tags = new Set<OpportunityTag>(['accredited', 'government-funded']);
  if (v.isDisabilityConfident) tags.add('disability-confident');
  if (typeof v.hoursPerWeek === 'number' && v.hoursPerWeek > 0 && v.hoursPerWeek < 30) {
    tags.add('part-time');
  }

  const sector = SECTOR_BY_ROUTE.get(routeKey(clean(v.course?.route)));
  const duration = clean(v.expectedDuration);

  const input: OpportunityInput = {
    externalId: ref,
    type: 'apprenticeship',
    title,
    description:
      buildDescription(v, pay, otherPlaces, {
        employer: tidyTitle(clean(v.employerName)) || 'The employer',
        place: national ? 'England' : firstLabel,
      }) || title,
    organisation: {
      name: tidyTitle(clean(v.employerName)) || 'Employer',
      url: websiteUrl(clean(v.employerWebsiteUrl)),
    },
    applyUrl,
    ...(sector ? { sector } : {}),
    level: level !== null && level >= 2 && level <= 7 ? level : null,
    minEntryLevel,
    location: {
      label: national ? 'Across England' : firstLabel,
      workMode: national ? 'nationwide' : 'onsite',
      country: 'england',
      ...(geo?.region ? { region: geo.region } : {}),
      ...(postcode ? { postcode } : {}),
      ...(point ? point : {}),
    },
    pay,
    cost: { kind: 'free', amount: null, note: 'Apprenticeship training is free to you.' },
    duration: duration ? lowerUnits(duration) : null,
    postedAt: asIso(v.postedDate),
    startsAt: asIso(v.startDate),
    closesAt: asIso(v.closingDate),
    minAge: 16,
    tags: [...tags],
  };
  return { ok: true, input };
}

interface FaaPage {
  vacancies?: unknown[] | null;
  total?: number;
  totalFiltered?: number;
  totalPages?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const faaAdapter: ProviderAdapter = {
  meta: FAA_PROVIDER,
  fullFeed: true,
  isConfigured: (env: Env) => Boolean(env.FAA_API_KEY),
  async *fetch(ctx: AdapterContext) {
    const key = ctx.env.FAA_API_KEY;
    if (!key) return;
    const headers = {
      'Ocp-Apim-Subscription-Key': key,
      'X-Version': '2',
      // Also return NHS Jobs and Civil Service Jobs apprenticeships (a header, not a query
      // parameter: the spec says so, and as a query parameter it is silently ignored).
      AdditionalDataSources: 'Nhs,Csj',
    };
    const seen = new Set<string>();
    let expected = 0;

    for (let page = 1; ; page += 1) {
      // IncludeDetails adds the full description, skills, qualifications and training text.
      const url = `${BASE_URL}/vacancy?PageNumber=${page}&PageSize=${PAGE_SIZE}&Sort=AgeDesc&IncludeDetails=true`;
      const body = await ctx.http.getJson<FaaPage>(url, { headers, timeoutMs: 60_000 });
      const items = (body.vacancies ?? []) as Array<Record<string, unknown>>;
      expected = body.totalFiltered ?? expected;

      // The API gives coordinates but no region. One bulk postcode lookup per page adds it.
      const geo = await ctx.geocoder.postcodes(
        items
          .map((j) => (j.addresses as Array<{ postcode?: unknown }> | undefined)?.[0]?.postcode)
          .filter((p): p is string => typeof p === 'string'),
      );
      for (const item of items) {
        const ref = String(item.vacancyReference ?? '');
        // The list is sorted newest-first and moves while we page through it: skip repeats.
        if (ref) {
          if (seen.has(ref)) continue;
          seen.add(ref);
        }
        const first = (item.addresses as Array<{ postcode?: unknown }> | undefined)?.[0];
        const point = geo.get(normalisePostcode(String(first?.postcode ?? '')) ?? '');
        yield point
          ? {
              ...item,
              _geo: {
                lat: point.lat,
                lon: point.lon,
                region: point.region,
                district: point.district,
              },
            }
          : item;
      }

      const totalPages = body.totalPages ?? page;
      if (items.length === 0 || page >= totalPages) break;
      await sleep(PACE_MS);
    }

    // An incomplete crawl must never be treated as "everything else has closed".
    if (expected > 0 && seen.size < expected * MIN_COMPLETE) {
      throw new Error(
        `Find an apprenticeship crawl incomplete: received ${seen.size} of ${expected}`,
      );
    }
  },
  map: (raw) => mapFaaVacancy(raw),
};
