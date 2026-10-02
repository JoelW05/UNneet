import {
  classifySector,
  extractQualifications,
  isPlausiblyUk,
  type Level,
  normalisePostcode,
  type OpportunityInput,
  type OpportunityTag,
  type ProviderMeta,
  ProviderMetaSchema,
  RegionSchema,
  type SectorSlug,
  tidyTitle,
  truncate,
} from '@unneet/domain';
import { z } from 'zod';
import { parseCsvRecords } from '../lib/csv';
import { clean, rich, townCase } from '../lib/plain';
import { websiteUrl } from '../lib/url';
import type { AdapterContext, Mapped, ProviderAdapter } from '../types';

/**
 * National Careers Service course directory ("Find a course"): every publicly funded course in
 * England from 2,300+ colleges, schools, local authorities and training providers. Open
 * Government Licence v3.0, published as monthly CSV files, so we STORE it.
 *
 *   Index   https://www.gov.uk/api/content/government/publications/national-careers-service-course-directory
 *           (GOV.UK's public content API; lists each month's attachments)
 *   Files   "Live courses with regions and venues" (~100 MB, one row per course run and venue)
 *           "Live course providers" (provider names and websites, ~260 KB)
 *   Codes   …/code-tables (delivery mode, study mode, attendance, duration unit, course type)
 *
 * What the real file taught us (August 2026, 110k rows):
 *   - more than half the rows are runs that have ALREADY started, so only flexible or upcoming
 *     starts are kept: a listing you cannot join is worse than no listing;
 *   - a course is repeated for every run and venue, so we keep one listing per course, venue and
 *     delivery mode (the soonest run), with a stable id that survives the run changing;
 *   - 4% of rows have no link, so those fall back to the official Find a course page for that
 *     exact run, which always exists;
 *   - `SECTOR` and `EDUCATION_LEVEL` are almost always empty, so level comes from the title and
 *     sector from our own classifier;
 *   - `WHO_THIS_COURSE_IS_FOR` and `ENTRY_REQUIREMENTS` are written by the provider and become the
 *     description, which is also where "minimum requirements" for a course are read from.
 */
export const COURSE_DIRECTORY_PROVIDER: ProviderMeta = ProviderMetaSchema.parse({
  id: 'course-directory',
  name: 'National Careers Service course directory',
  licence: 'Open Government Licence v3.0',
  attribution:
    'Course information from the National Careers Service course directory (GOV.UK). Contains public sector information licensed under the Open Government Licence v3.0.',
  attributionUrl: 'https://nationalcareers.service.gov.uk/find-a-course',
  storagePolicy: 'store',
  isSample: false,
  requiresKey: false,
});

const PUBLICATION_API =
  'https://www.gov.uk/api/content/government/publications/national-careers-service-course-directory';
const DETAILS_URL = 'https://nationalcareers.service.gov.uk/find-a-course/course-details';
/** A file with fewer course rows than this is truncated or a different layout, not "the courses". */
const MIN_ROWS = 20_000;
const GEOCODE_CHUNK = 500;
const MAX_DESCRIPTION = 19_500;
const REQUIRED_COLUMNS = ['PROVIDER_UKPRN', 'COURSE_ID', 'COURSE_RUN_ID', 'COURSE_NAME'] as const;

// --- finding this month's files -----------------------------------------------------------------

interface Attachment {
  title?: string;
  url?: string;
  content_type?: string;
}
const COURSES_FILE = /LiveCoursesWithRegionsAndVenuesReport-(\d{8})\.csv$/i;
const PROVIDERS_FILE = /LiveCourseProvidersReport-(\d{8})\.csv$/i;

/** The newest month for which both CSV files are published. */
export function pickLatestFiles(
  attachments: readonly Attachment[],
): { coursesUrl: string; providersUrl: string; stamp: string } | null {
  const find = (re: RegExp) =>
    new Map(
      attachments.flatMap((a) => {
        const m = re.exec(a.url ?? '');
        return m?.[1] && a.url ? [[m[1], a.url] as const] : [];
      }),
    );
  const courses = find(COURSES_FILE);
  const providers = find(PROVIDERS_FILE);
  const stamp = [...courses.keys()]
    .filter((s) => providers.has(s))
    .sort()
    .at(-1);
  if (!stamp) return null;
  return {
    coursesUrl: courses.get(stamp) as string,
    providersUrl: providers.get(stamp) as string,
    stamp,
  };
}

// --- the official code tables -------------------------------------------------------------------

const DELIVER: Readonly<Record<string, string>> = {
  '1': 'Classroom based',
  '2': 'Online',
  '3': 'Work based',
  '4': 'Blended learning',
};
const STUDY: Readonly<Record<string, string>> = {
  '1': 'Full-time',
  '2': 'Part-time',
  '3': 'Flexible',
};
const ATTENDANCE: Readonly<Record<string, string>> = {
  '1': 'Daytime',
  '2': 'Evening',
  '3': 'Weekend',
  '4': 'Day or block release',
};
const UNITS: Readonly<Record<string, readonly [string, string]>> = {
  '1': ['day', 'days'],
  '2': ['week', 'weeks'],
  '3': ['month', 'months'],
  '4': ['year', 'years'],
  '5': ['hour', 'hours'],
  '6': ['minute', 'minutes'],
};
const COURSE_TYPE: Readonly<Record<string, string>> = {
  '1': 'Essential skills',
  '2': 'T Level',
  '3': 'Higher Technical Qualification',
  '4': 'Free Courses for Jobs',
  '5': 'Multiply (free maths for adults)',
  '6': 'Skills Bootcamp',
};
/** Course types the government funds for eligible people: free if you qualify. */
const FUNDED_TYPES = new Set(['4', '5', '6']);

const SECTOR_BY_CODE: Readonly<Record<string, SectorSlug>> = {
  CONSTRUCTION: 'construction-built-environment',
  DIGITAL: 'digital',
  TRANSPORT: 'transport-logistics',
  EDUCATION: 'education-early-years',
  ENGMAN: 'engineering-manufacturing',
  BUSINESSADMIN: 'business-administration',
  CARE: 'care-services',
  HEALTH: 'health-science',
  CATERINGHOSP: 'catering-hospitality',
  SALESMARKETING: 'sales-marketing-procurement',
  CREATIVE: 'creative-design',
  ENVIRONMENTAL: 'agriculture-environment-animal-care',
  PROTECTIVE: 'protective-services',
  LEGALFINANCE: 'legal-finance-accounting',
  HAIRBEAUTY: 'hair-beauty',
};

// --- reading one row ----------------------------------------------------------------------------

const Row = z.record(z.string(), z.string());
const RecordSchema = z.object({
  row: Row,
  provider: z.object({
    name: z.string(),
    website: z.string().nullish(),
  }),
  _geo: z
    .object({
      lat: z.number().nullish(),
      lon: z.number().nullish(),
      region: RegionSchema.nullish(),
      district: z.string().nullish(),
    })
    .nullish(),
});
type CdRecord = z.infer<typeof RecordSchema>;
type CsvRow = z.infer<typeof Row>;

const field = (row: CsvRow, key: string): string => clean(row[key]);

/** "05/11/2026" → ISO date-time, or null. */
export function parseUkDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Entry 3", "Entry Level 1", "E2": the entry rungs below GCSE. Real titles use all three spellings. */
const ENTRY_RUNG = /\bentry[- ]?level\s*[1-3]\b|\bentry\s*[1-3]\b|\bentry (?:one|two|three)\b/i;
const ENTRY_CODE = /\bE[1-3]\b/;
/** A bare "Entry Level …" or "Pre Entry …", but not "Data Entry" or "Entry into …". */
const ENTRY_WORD = /(?<!\bdata )\b(?:pre[- ]?entry|entry[- ]level)\b/i;

/**
 * The level a course title states: "Level 2", "L3", "Entry 2", "GCSE", "HNC". Null when it does not.
 * The provider's own `EDUCATION_LEVEL` wins, but it is almost always empty.
 */
export function levelFromTitle(title: string, educationLevel = ''): Level | null {
  if (/^[0-8]$/.test(educationLevel.trim())) return Number(educationLevel.trim()) as Level;
  // "Entry Level 1" is the entry rung, so look for it before the generic "level 1".
  if ((ENTRY_RUNG.test(title) || ENTRY_CODE.test(title)) && !/\blevel\s?[2-7]\b/i.test(title))
    return 0;
  const explicit = /\b(?:level|lvl|l)\s?([0-7])\b/i.exec(title);
  if (explicit?.[1]) return Number(explicit[1]) as Level;
  if (ENTRY_WORD.test(title)) return 0;
  if (/\badvanced level\b/i.test(title)) return 3;
  const found = extractQualifications(title);
  return found.found.length > 0 ? (found.highestLevel as Level) : null;
}

/** The level in the course page's own address: ".../sport-btec-level-3-national-extended-certificate". */
export function levelFromUrl(url: string | null): Level | null {
  if (!url) return null;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  if (/(?:^|[-_/])entry-?(?:level-?)?[1-3](?=$|[-_/.])/i.test(path)) return 0;
  const m = /(?:^|[-_/])level-?([0-7])(?=$|[-_/.])/i.exec(path);
  return m?.[1] ? (Number(m[1]) as Level) : null;
}

/**
 * The directory's text lost some characters on the way in: apostrophes and dashes became "?"
 * ("don?t", "Multiply ? Managing Your Money"). Repair only the unambiguous cases.
 */
export function repairText(s: string): string {
  return s
    .replace(/(?<=[A-Za-z])\?(?=(?:s|t|re|ve|ll|d|m)\b)/g, "'")
    .replace(/ \? (?=[A-Za-z0-9])/g, ' – ');
}

function durationText(row: CsvRow): string | null {
  const value = Number(field(row, 'DURATION_VALUE'));
  const unit = UNITS[field(row, 'DURATION_UNIT')];
  if (!unit || !Number.isFinite(value) || value <= 0) return null;
  return `${value} ${value === 1 ? unit[0] : unit[1]}`;
}

const dateText = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const bullets = (items: readonly string[]): string => items.map((i) => `• ${i}`).join('\n');

export function mapCourseRecord(raw: unknown): Mapped {
  const parsed = RecordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: `unexpected shape: ${parsed.error.issues[0]?.message}` };
  }
  const { row, provider, _geo: geo } = parsed.data;
  const courseId = field(row, 'COURSE_ID');
  const runId = field(row, 'COURSE_RUN_ID');
  const name = repairText(field(row, 'COURSE_NAME'));
  if (!courseId || !runId) return { ok: false, reason: 'missing course or run id' };
  if (name.length < 3) return { ok: false, reason: `${courseId}: missing course name` };

  const deliver = field(row, 'DELIVER_MODE');
  const study = field(row, 'STUDY_MODE');
  const attendance = field(row, 'ATTENDANCE_PATTERN');
  const type = field(row, 'COURSE_TYPE');
  const online = deliver === '2';
  const national = field(row, 'NATIONAL').toUpperCase() === 'TRUE';
  const flexibleStart = field(row, 'FLEXIBLE_STARTDATE').toUpperCase() === 'TRUE';
  const startsAt = flexibleStart ? null : parseUkDate(field(row, 'STARTDATE'));

  // --- where ---
  const postcode = normalisePostcode(field(row, 'LOCATION_POSTCODE'));
  const lat = Number(field(row, 'LOCATION_LATITUDE'));
  const lon = Number(field(row, 'LOCATION_LONGITUDE'));
  const csvPoint =
    field(row, 'LOCATION_LATITUDE') &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    isPlausiblyUk({ lat, lon })
      ? { lat, lon }
      : null;
  const point =
    csvPoint ??
    (typeof geo?.lat === 'number' && typeof geo.lon === 'number'
      ? { lat: geo.lat, lon: geo.lon }
      : null);
  const venueName = field(row, 'LOCATION_NAME');
  const town = townCase(field(row, 'LOCATION_TOWN'));
  const placeLabel = town || townCase(clean(geo?.district)) || postcode || 'England';
  const label = online ? 'Online' : national ? 'Across England' : placeLabel;
  const workMode = online
    ? 'remote'
    : national
      ? 'nationwide'
      : deliver === '4'
        ? 'hybrid'
        : 'onsite';

  // --- cost ---
  const costText = field(row, 'COST');
  const cost = Number(costText);
  const costNote = repairText(field(row, 'COST_DESCRIPTION'));
  // T Levels are government-funded for 16 to 19 year olds, so they are never "unknown" unless a
  // provider states a fee.
  const tLevel = type === '2';
  const funded = FUNDED_TYPES.has(type) || (tLevel && !(cost > 0));
  const costKind: NonNullable<OpportunityInput['cost']> = funded
    ? {
        kind: 'funded',
        amount: null,
        note: truncate(
          costNote ||
            (tLevel
              ? 'Free for 16 to 19 year olds: T Levels are funded by the government.'
              : 'Free if you are eligible: check with the provider.'),
          280,
        ),
      }
    : costText === '' || !Number.isFinite(cost)
      ? { kind: 'unknown', amount: null, note: costNote ? truncate(costNote, 280) : null }
      : cost === 0
        ? { kind: 'free', amount: null, note: costNote ? truncate(costNote, 280) : null }
        : { kind: 'paid', amount: cost, note: costNote ? truncate(costNote, 280) : null };

  // --- link: the provider's page, else the official page for this exact run ---
  const own = websiteUrl(field(row, 'COURSE_URL'));
  const official = `${DETAILS_URL}?courseId=${encodeURIComponent(courseId)}&r=${encodeURIComponent(runId)}`;

  // --- the words ---
  const providerName = tidyTitle(provider.name) || 'Learning provider';
  const who = repairText(rich(row.WHO_THIS_COURSE_IS_FOR));
  const entry = repairText(rich(row.ENTRY_REQUIREMENTS));
  const assessed = repairText(rich(row.HOW_YOU_WILL_BE_ASSESSED));
  const how = [STUDY[study], ATTENDANCE[attendance], DELIVER[deliver]].filter(Boolean).join(', ');
  const facts = [
    `Provider: ${providerName}`,
    online
      ? 'Where: online'
      : `Where: ${[venueName, town, postcode].filter(Boolean).join(', ') || label}`,
    how ? `How you study: ${how}` : '',
    durationText(row) ? `How long: ${durationText(row)}` : '',
    startsAt
      ? `Starts: ${dateText(startsAt)}`
      : flexibleStart
        ? 'Starts: flexible, ask the provider'
        : '',
    COURSE_TYPE[type] ? `Type: ${COURSE_TYPE[type]}` : '',
    field(row, 'AWARDING_BODY') && !/no awarding body/i.test(field(row, 'AWARDING_BODY'))
      ? `Awarded by: ${field(row, 'AWARDING_BODY')}`
      : '',
  ].filter(Boolean);
  const parts = [
    who || `${tidyTitle(name)} at ${providerName}.`,
    ...(entry ? ['Entry requirements:', entry] : []),
    ...(assessed ? ['How you will be assessed:', assessed] : []),
    'Key details:',
    bullets(facts),
  ];

  const tags = new Set<OpportunityTag>();
  if (field(row, 'LEARN_AIM_REF')) tags.add('accredited');
  if (funded) tags.add('government-funded');
  if (online) tags.add('online');
  if (study === '2') tags.add('part-time');
  if (study === '3' || flexibleStart) tags.add('flexible');
  if (attendance === '2' || attendance === '3') tags.add('evening-weekend');

  const level = levelFromTitle(name, field(row, 'EDUCATION_LEVEL')) ?? levelFromUrl(own);
  // The provider's code when it gives one; otherwise the TITLE only. The description is marketing
  // copy ("our teachers and students…") that drags every school course towards teaching.
  const sector =
    SECTOR_BY_CODE[field(row, 'SECTOR').toUpperCase()] ?? classifySector(tidyTitle(name)).sector;

  const input: OpportunityInput = {
    // Stable across runs: the same course at the same venue stays ONE listing as its dates change.
    externalId: courseKey(row),
    type: type === '2' ? 't-level' : type === '6' ? 'bootcamp' : 'course',
    title: tidyTitle(name),
    description: truncate(parts.join('\n\n'), MAX_DESCRIPTION),
    organisation: {
      name: providerName,
      url: websiteUrl(field(row, 'LOCATION_WEBSITE')) ?? websiteUrl(provider.website),
    },
    applyUrl: own ?? official,
    sector,
    level,
    location: {
      label,
      workMode,
      country: 'england',
      ...(geo?.region ? { region: geo.region } : {}),
      ...(!online && !national && postcode ? { postcode } : {}),
      ...(!online && !national && point ? point : {}),
    },
    pay: null,
    cost: costKind,
    duration: durationText(row),
    postedAt: null,
    startsAt,
    closesAt: null,
    tags: [...tags],
  };
  return { ok: true, input };
}

/** One listing per course, venue and delivery mode. */
export function courseKey(row: CsvRow): string {
  const venue =
    normalisePostcode(field(row, 'LOCATION_POSTCODE')) ?? field(row, 'LOCATION_NAME').toLowerCase();
  return `${field(row, 'COURSE_ID')}|${venue || 'no-venue'}|${field(row, 'DELIVER_MODE')}`;
}

// --- the adapter --------------------------------------------------------------------------------

const startOfDay = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** When can you start? Flexible counts as "now"; a dated run counts from its date; the past never. */
function startMs(row: CsvRow, today: number): number | null {
  if (field(row, 'FLEXIBLE_STARTDATE').toUpperCase() === 'TRUE') return today;
  const iso = parseUkDate(field(row, 'STARTDATE'));
  if (!iso) return null;
  const ms = Date.parse(iso);
  return ms >= today ? ms : null;
}

export const courseDirectoryAdapter: ProviderAdapter = {
  meta: COURSE_DIRECTORY_PROVIDER,
  fullFeed: true,
  isConfigured: () => true,
  async *fetch(ctx: AdapterContext) {
    const index = await ctx.http.getJson<{ details?: { attachments?: Attachment[] } }>(
      PUBLICATION_API,
    );
    const files = pickLatestFiles(index.details?.attachments ?? []);
    if (!files)
      throw new Error('Course directory: no matching pair of CSV files on the GOV.UK page');
    ctx.logger.info('course directory files', { month: files.stamp });

    const providers = new Map<string, { name: string; website: string | null }>();
    for (const r of parseCsvRecords(
      await ctx.http.getText(files.providersUrl, { timeoutMs: 120_000 }),
    )) {
      const id = clean(r.PROVIDER_UKPRN);
      const name = clean(r.TRADING_NAME) || clean(r.PROVIDER_NAME);
      if (id && name) providers.set(id, { name, website: clean(r.CONTACT_WEBSITE) || null });
    }

    const text = await ctx.http.getText(files.coursesUrl, { timeoutMs: 900_000, retries: 2 });
    const today = startOfDay(ctx.now);
    const best = new Map<string, { row: CsvRow; start: number }>();
    let rows = 0;
    for (const row of parseCsvRecords(text)) {
      if (rows === 0) {
        const missing = REQUIRED_COLUMNS.filter((c) => !(c in row));
        if (missing.length > 0)
          throw new Error(`Course directory: unexpected columns (missing ${missing.join(', ')})`);
      }
      rows += 1;
      const start = startMs(row, today);
      if (start === null) continue; // already started, or no usable date
      const key = courseKey(row);
      const prior = best.get(key);
      if (!prior || start < prior.start) best.set(key, { row, start });
    }
    if (rows < MIN_ROWS) {
      throw new Error(
        `Course directory: only ${rows} rows read (expected 20,000+): file looks incomplete`,
      );
    }
    ctx.logger.info('course directory read', { rows, listings: best.size });

    const entries = [...best.values()].map((e) => e.row);
    for (let i = 0; i < entries.length; i += GEOCODE_CHUNK) {
      const chunk = entries.slice(i, i + GEOCODE_CHUNK);
      // The file has coordinates but no region; one bulk postcode lookup per chunk adds it.
      const geo = await ctx.geocoder.postcodes(
        chunk.map((r) => field(r, 'LOCATION_POSTCODE')).filter(Boolean),
      );
      for (const row of chunk) {
        const provider = providers.get(field(row, 'PROVIDER_UKPRN')) ?? { name: '', website: null };
        const point = geo.get(normalisePostcode(field(row, 'LOCATION_POSTCODE')) ?? '');
        const record: CdRecord = {
          row,
          provider,
          ...(point
            ? {
                _geo: {
                  lat: point.lat,
                  lon: point.lon,
                  region: point.region,
                  district: point.district,
                },
              }
            : {}),
        };
        yield record;
      }
    }
  },
  map: (raw) => mapCourseRecord(raw),
};
