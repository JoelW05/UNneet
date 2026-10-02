import {
  type Country,
  normalisePostcode,
  type OpportunityInput,
  type OpportunityType,
  type ProviderMeta,
  ProviderMetaSchema,
  regionFromPostcodesIo,
} from '@unneet/domain';
import { z } from 'zod';
import type { GeoPoint } from '../geo';
import { parseCsvRecords } from '../lib/csv';
import { osgbToWgs84 } from '../lib/osgb';
import { websiteUrl } from '../lib/url';
import type { AdapterContext, Mapped, ProviderAdapter } from '../types';

/**
 * Get Information about Schools (GIAS), Department for Education. A complete, daily-refreshed
 * register of education establishments in England, published as an open CSV under the Open
 * Government Licence v3.0:
 *   https://get-information-schools.service.gov.uk/Downloads
 *   https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldataYYYYMMDD.csv
 *
 * What it adds to UnNEET: the PLACES to study, which is what a 16-year-old leaving school needs
 * first. Each college, sixth form, technical college and university becomes an `education`
 * listing that links to the institution's own website. It does NOT list individual courses or
 * vacancies, and the descriptions say only what the data supports ("typically", "check the
 * website"), never specific courses we cannot see.
 *
 * Selection rules (see `classify`): open establishments only; FE and sixth form colleges, 16–19
 * academies and free schools, UTCs, studio schools, specialist post-16 colleges, universities,
 * and state-funded school sixth forms. Independent (fee-paying) schools, special-school sixth
 * forms (entry is by Education, Health and Care plan) and overseas schools are left out.
 */
export const GIAS_PROVIDER: ProviderMeta = ProviderMetaSchema.parse({
  id: 'gias',
  name: 'Get Information about Schools (DfE)',
  licence: 'Open Government Licence v3.0',
  attribution:
    'Education provider details from Get Information about Schools (Department for Education). Contains public sector information licensed under the Open Government Licence v3.0.',
  attributionUrl: 'https://get-information-schools.service.gov.uk/',
  storagePolicy: 'store',
  isSample: false,
  requiresKey: false,
});

const DOWNLOAD_BASE = 'https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public';
const DETAIL_URL =
  'https://get-information-schools.service.gov.uk/Establishments/Establishment/Details';

/** The columns we read. Keeping only these keeps ~3,000 selected rows small in memory. */
const COLUMNS = [
  'URN',
  'EstablishmentName',
  'TypeOfEstablishment (name)',
  'EstablishmentTypeGroup (name)',
  'EstablishmentStatus (name)',
  'FurtherEducationType (name)',
  'OfficialSixthForm (name)',
  'StatutoryLowAge',
  'StatutoryHighAge',
  'Town',
  'Postcode',
  'SchoolWebsite',
  'Easting',
  'Northing',
  'GOR (name)',
] as const;

export const GiasRowSchema = z.object(
  Object.fromEntries(COLUMNS.map((c) => [c, z.string().default('')])) as Record<
    (typeof COLUMNS)[number],
    z.ZodDefault<z.ZodString>
  >,
);
export type GiasRow = z.infer<typeof GiasRowSchema>;

export type Kind =
  | 'general-college'
  | 'sixth-form-college'
  | 'specialist-college'
  | 'special-post-16'
  | 'post-16-academy'
  | 'technical-college'
  | 'school-sixth-form'
  | 'university';

const POST_16_ACADEMY_TYPES = new Set([
  'Sixth form centres',
  'Academy 16-19 converter',
  'Academy 16 to 19 sponsor led',
  'Free schools 16 to 19',
  'Academy secure 16 to 19',
]);

/** Which kind of provider this row is, or null if it should not be listed. */
export function classify(row: GiasRow): Kind | null {
  if (!row['EstablishmentStatus (name)'].startsWith('Open')) return null;
  const type = row['TypeOfEstablishment (name)'];
  const group = row['EstablishmentTypeGroup (name)'];
  const fe = row['FurtherEducationType (name)'];

  if (type === 'Higher education institutions') return 'university';
  if (type === 'Further education') {
    if (fe.startsWith('Sixth Form College')) return 'sixth-form-college';
    if (fe === 'General Further Education College') return 'general-college';
    return 'specialist-college';
  }
  if (type === 'Special post 16 institution') return 'special-post-16';
  if (POST_16_ACADEMY_TYPES.has(type)) return 'post-16-academy';
  if (type === 'University technical college' || type === 'Studio schools')
    return 'technical-college';

  // A school sixth form: state-funded, open to applicants from other schools, not a special school.
  if (
    row['OfficialSixthForm (name)'] === 'Has a sixth form' &&
    group !== 'Independent schools' &&
    group !== 'Special schools' &&
    group !== 'Welsh schools' &&
    group !== 'Online provider'
  ) {
    return 'school-sixth-form';
  }
  return null;
}

const COPY: Readonly<
  Record<
    Kind,
    {
      type: OpportunityType;
      title: (name: string) => string;
      body: (name: string, town: string) => string;
    }
  >
> = {
  'general-college': {
    type: 'course',
    title: (n) => `Study at ${n}`,
    body: (n, t) =>
      `${n} is a further education college${t ? ` in ${t}` : ''}. Colleges like this typically run practical, job-focused courses from entry level upwards, plus A-levels, T Levels and apprenticeships, for 16 to 18 year olds and for adults. Check the college website for exactly which courses it offers, its open days and how to apply.`,
  },
  'sixth-form-college': {
    type: 'course',
    title: (n) => `Study at ${n}`,
    body: (n, t) =>
      `${n} is a sixth form college${t ? ` in ${t}` : ''}, for students aged 16 to 18. Sixth form colleges typically teach A-levels and other level 3 courses such as BTECs and T Levels. Check the college website for the subjects it offers, its entry requirements and how to apply.`,
  },
  'specialist-college': {
    type: 'course',
    title: (n) => `Study at ${n}`,
    body: (n, t) =>
      `${n} is a specialist further education college${t ? ` in ${t}` : ''}, such as a land-based, art or performing arts college. Check the college website for its courses, entry requirements, open days and how to apply.`,
  },
  'special-post-16': {
    type: 'course',
    title: (n) => `Study at ${n}`,
    body: (n, t) =>
      `${n} is a specialist college${t ? ` in ${t}` : ''} for young people with special educational needs and disabilities (SEND). Places are usually arranged with your local authority through an Education, Health and Care (EHC) plan. Check the college website for what it offers and how to get a place.`,
  },
  'post-16-academy': {
    type: 'course',
    title: (n) => `Study at ${n}`,
    body: (n, t) =>
      `${n} is a 16 to 19 school${t ? ` in ${t}` : ''} for students after GCSEs. These schools typically teach A-levels and other level 3 courses. Check its website for the subjects it offers, its entry requirements and how to apply.`,
  },
  'technical-college': {
    type: 'course',
    title: (n) => `Study at ${n}`,
    body: (n, t) =>
      `${n} is a technical school${t ? ` in ${t}` : ''} (a university technical college or studio school) that combines technical, hands-on study with academic subjects, usually from age 14 or 16. Check its website for its specialisms, entry points and how to apply.`,
  },
  'school-sixth-form': {
    type: 'course',
    title: (n) => `Sixth form at ${n}`,
    body: (n, t) =>
      `${n}${t ? ` in ${t}` : ''} has a sixth form for students aged 16 to 18 (after GCSEs). You can usually apply to a sixth form at a different school from your own, and entry usually depends on your GCSE results. Check the school website for the subjects it offers and how to apply.`,
  },
  university: {
    type: 'degree',
    title: (n) => `Study a degree at ${n}`,
    body: (n, t) =>
      `${n} is a university or higher education college${t ? ` in ${t}` : ''} offering degrees and other higher education courses. Check its website for courses, entry requirements, fees, open days and how to apply (most full-time undergraduate degrees are applied for through UCAS).`,
  },
};

const FUNDED_16_18 = {
  kind: 'funded' as const,
  amount: null,
  note: 'Free for most 16 to 18 year olds in England. Fees and funding for adults vary.',
};

const COST: Readonly<Record<Kind, OpportunityInput['cost']>> = {
  'general-college': FUNDED_16_18,
  'sixth-form-college': FUNDED_16_18,
  'specialist-college': FUNDED_16_18,
  'special-post-16': {
    kind: 'funded',
    amount: null,
    note: 'Usually funded by your local authority through an EHC plan.',
  },
  'post-16-academy': FUNDED_16_18,
  'technical-college': FUNDED_16_18,
  'school-sixth-form': {
    kind: 'funded',
    amount: null,
    note: 'Free to attend: state-funded sixth forms do not charge fees.',
  },
  university: {
    kind: 'paid',
    amount: null,
    note: 'Tuition fees apply. Most students pay with a student loan that is only repaid once their earnings pass a threshold.',
  },
};

const LEVELS: Readonly<Record<Kind, { level: number | null; minEntry: number | null }>> = {
  'general-college': { level: null, minEntry: null },
  'sixth-form-college': { level: 3, minEntry: 2 },
  'specialist-college': { level: null, minEntry: null },
  'special-post-16': { level: null, minEntry: null },
  'post-16-academy': { level: 3, minEntry: 2 },
  'technical-college': { level: null, minEntry: null },
  'school-sixth-form': { level: 3, minEntry: 2 },
  university: { level: 6, minEntry: 3 },
};

const AGES: Readonly<Record<Kind, { min: number | null; max: number | null }>> = {
  'general-college': { min: 16, max: null },
  'sixth-form-college': { min: 16, max: 19 },
  'specialist-college': { min: 16, max: null },
  'special-post-16': { min: 16, max: 25 },
  'post-16-academy': { min: 16, max: 19 },
  'technical-college': { min: 14, max: 19 },
  'school-sixth-form': { min: 16, max: 19 },
  university: { min: null, max: null },
};

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** A cleaned-up record: the CSV row plus any coordinates the adapter could add. */
export interface GiasRecord extends GiasRow {
  _geo?: GeoPoint | undefined;
}

export function mapGiasRecord(raw: unknown): Mapped {
  const parsed = GiasRowSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not a GIAS row' };
  const row = parsed.data;
  const geo = (raw as GiasRecord)._geo;
  const kind = classify(row);
  if (!kind) return { ok: false, reason: `${row.URN}: not a listed kind of provider` };

  const name = row.EstablishmentName.trim();
  if (!name) return { ok: false, reason: `${row.URN}: no name` };
  const town = row.Town.trim();
  const copy = COPY[kind];
  const url = websiteUrl(row.SchoolWebsite) ?? `${DETAIL_URL}/${encodeURIComponent(row.URN)}`;

  const easting = num(row.Easting);
  const northing = num(row.Northing);
  const point =
    easting !== null && northing !== null && easting > 0 && northing > 0
      ? osgbToWgs84(easting, northing)
      : geo
        ? { lat: geo.lat, lon: geo.lon }
        : null;
  const region = regionFromPostcodesIo(row['GOR (name)'], 'England') ?? geo?.region ?? null;
  const country: Country = 'england';
  const { level, minEntry } = LEVELS[kind];
  const ages = AGES[kind];
  const postcode = row.Postcode.trim();

  const input: OpportunityInput = {
    externalId: row.URN,
    type: copy.type,
    title: copy.title(name),
    description: copy.body(name, town),
    organisation: { name, url: websiteUrl(row.SchoolWebsite) },
    applyUrl: url,
    sector: null,
    level,
    minEntryLevel: minEntry,
    location: {
      label: town || row['GOR (name)'] || 'England',
      workMode: 'onsite',
      country,
      ...(region ? { region } : {}),
      ...(postcode ? { postcode } : {}),
      ...(point ? { lat: point.lat, lon: point.lon } : {}),
    },
    cost: COST[kind] ?? { kind: 'unknown', amount: null },
    minAge: ages.min,
    maxAge: ages.max,
    tags: kind === 'university' ? [] : ['government-funded'],
  };
  return { ok: true, input };
}

function dateStamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** The newest daily file: today's if published, otherwise the most recent of the last week. */
async function downloadLatest(now: Date): Promise<string> {
  let lastStatus = 0;
  for (let back = 0; back < 8; back++) {
    const day = new Date(now.getTime() - back * 86_400_000);
    const url = `${DOWNLOAD_BASE}/edubasealldata${dateStamp(day)}.csv`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'UnNEET/0.1 (+https://unneet.example/about/data)' },
      signal: AbortSignal.timeout(180_000),
    });
    lastStatus = res.status;
    if (res.ok) {
      // GIAS files are Windows-1252, not UTF-8.
      return new TextDecoder('windows-1252').decode(await res.arrayBuffer());
    }
  }
  throw new Error(`No GIAS file found for the last 8 days (last HTTP status ${lastStatus})`);
}

export function* selectRows(csv: string): Generator<GiasRow> {
  for (const record of parseCsvRecords(csv)) {
    const picked = Object.fromEntries(COLUMNS.map((c) => [c, record[c] ?? '']));
    const row = GiasRowSchema.parse(picked);
    if (classify(row)) yield row;
  }
}

export const giasAdapter: ProviderAdapter = {
  meta: GIAS_PROVIDER,
  fullFeed: true,
  isConfigured: () => true,
  async *fetch(ctx: AdapterContext) {
    const rows = [...selectRows(await downloadLatest(ctx.now))];
    ctx.logger.info(`GIAS: ${rows.length} providers selected`);

    // Most rows carry a grid reference. For the few that don't, look the postcode up in bulk.
    const needGeo = rows.filter((r) => !num(r.Easting) || !num(r.Northing));
    const geo = needGeo.length
      ? await ctx.geocoder.postcodes(needGeo.map((r) => r.Postcode))
      : new Map<string, GeoPoint>();

    for (const row of rows) {
      const g = geo.get(normalisePostcode(row.Postcode) ?? '');
      yield { ...row, ...(g ? { _geo: g } : {}) } satisfies GiasRecord;
    }
  },
  map: (raw) => mapGiasRecord(raw),
};
