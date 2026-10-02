import {
  htmlToText,
  type OpportunityInput,
  type OpportunityTag,
  type Pay,
  type ProviderMeta,
  ProviderMetaSchema,
  truncate,
  type WorkMode,
} from '@unneet/domain';
import type { GeoPoint } from '../../geo';
import { websiteUrl } from '../../lib/url';

export type AtsKind = 'greenhouse' | 'lever' | 'ashby';

/** One employer's public careers board on one applicant-tracking system. */
export interface AtsEmployer {
  ats: AtsKind;
  /** The board's identifier in the ATS URL (e.g. "monzo"). */
  token: string;
  /** Display name. */
  name: string;
  website?: string;
}

/** The common shape every ATS fetcher produces. */
export interface AtsJob {
  employer: AtsEmployer;
  id: string;
  title: string;
  /** HTML (or plain text) description. */
  description: string;
  url: string;
  /** Free-text location(s) as the employer wrote them, e.g. "Cardiff, London or Remote (UK)". */
  locationText: string;
  /** ISO 3166 alpha-2 when the ATS states it (Lever, Ashby), else null. */
  countryCode: string | null;
  workplaceType: WorkMode | null;
  postedAt: string | null;
  employmentType: string | null;
  pay: Pay | null;
}

/** A job plus the coordinates the adapter looked up for it. */
export interface AtsRecord extends AtsJob {
  _geo?: GeoPoint | undefined;
  _place?: string | undefined;
}

const PROVIDER_BASE = {
  licence:
    "Published by each employer on its own public careers site. The listing text belongs to the employer; UnNEET links to the employer's own application page.",
  storagePolicy: 'store',
  isSample: false,
  requiresKey: false,
} as const;

export const ATS_PROVIDERS: Readonly<Record<AtsKind, ProviderMeta>> = {
  greenhouse: ProviderMetaSchema.parse({
    ...PROVIDER_BASE,
    id: 'employer-greenhouse',
    name: 'Employer careers sites (Greenhouse)',
    attribution:
      "Listings published by employers on their own careers sites (via Greenhouse). Always apply on the employer's page.",
    attributionUrl: null,
  }),
  lever: ProviderMetaSchema.parse({
    ...PROVIDER_BASE,
    id: 'employer-lever',
    name: 'Employer careers sites (Lever)',
    attribution:
      "Listings published by employers on their own careers sites (via Lever). Always apply on the employer's page.",
    attributionUrl: null,
  }),
  ashby: ProviderMetaSchema.parse({
    ...PROVIDER_BASE,
    id: 'employer-ashby',
    name: 'Employer careers sites (Ashby)',
    attribution:
      "Listings published by employers on their own careers sites (via Ashby). Always apply on the employer's page.",
    attributionUrl: null,
  }),
};

// --- UK detection ---------------------------------------------------------------------------

const UK_WORDS =
  /\b(united kingdom|great britain|uk|u\.k\.|gb|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|liverpool|bristol|sheffield|newcastle|nottingham|leicester|edinburgh|glasgow|cardiff|belfast|cambridge|oxford|brighton|southampton|portsmouth|reading|milton keynes|coventry|bradford|norwich|exeter|bath|york|aberdeen|dundee|swansea|plymouth|derby|hull|stoke|sunderland|wolverhampton|luton|slough|guildford|woking|watford|swindon|cheltenham|gloucester|bournemouth|ipswich|colchester|chelmsford|crawley|basingstoke|maidstone|canterbury|peterborough|northampton|lincoln|preston|blackburn|bolton|stockport|salford|warrington|chester|worcester|hereford|shrewsbury|telford|durham|middlesbrough|carlisle|inverness|stirling|newport|wrexham|bangor|derry|londonderry|croydon|richmond|kingston|bromley|harrow|ealing)\b/i;

/** Places that look British but are not, or that name a UK city in another country. */
const NOT_UK =
  /\b(new england|ontario|canada|australia|new south wales|south wales,? (australia|nsw)|ny|new york|massachusetts|pennsylvania|kentucky|indiana|ohio|california|virginia|usa|united states|u\.s\.|bristol,? (tn|ct|va|pa)|richmond,? (va|ca|bc)|newcastle,? (nsw|australia)|perth|london,? (on|ontario|canada))\b/i;

/**
 * Is this job in the UK (or remote-eligible from the UK)? Prefer the ATS's structured country
 * code; fall back to the location text. Deliberately a little strict: a wrong "UK" label on an
 * overseas job is worse than missing a borderline one.
 */
export function isUkJob(locationText: string, countryCode: string | null): boolean {
  if (countryCode) return countryCode.toUpperCase() === 'GB' || countryCode.toUpperCase() === 'UK';
  const text = locationText.trim();
  if (!text) return false;
  return text.split(SEGMENT_SPLIT).some(segmentIsUk);
}

const SEGMENT_SPLIT = /\s*(?:;|\||\/| or | and |–|—|\s-\s)\s*/i;

/** A two-letter US/Canada-style region at the end ("Newport, RI"), which is not UK/GB. */
const FOREIGN_REGION_SUFFIX = /,\s*(?!UK\b|GB\b)[A-Z]{2}\s*$/;

function segmentIsUk(segment: string): boolean {
  if (NOT_UK.test(segment) || FOREIGN_REGION_SUFFIX.test(segment)) return false;
  return UK_WORDS.test(segment);
}

const NOT_A_PLACE =
  /\b(remote|anywhere|hybrid|emea|europe|global|worldwide|multiple|various|flexible|home[- ]?based|nationwide|uk-wide|work from home|wfh)\b/i;

const COUNTRY_ONLY =
  /^(uk|u\.k\.|united kingdom|great britain|gb|england|scotland|wales|northern ireland)$/i;

/** The first real UK place name in a location string, or null ("Remote (UK)" has none). */
export function placeFromLocation(locationText: string): string | null {
  const segments = locationText
    .split(SEGMENT_SPLIT)
    .map((s) =>
      s
        .replace(/\(.*?\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  for (const seg of segments) {
    if (NOT_A_PLACE.test(seg) || !segmentIsUk(seg)) continue;
    // "London, UK" / "Leeds, England, United Kingdom" → "London" / "Leeds"
    const first = seg.split(',')[0]?.trim();
    if (!first || COUNTRY_ONLY.test(first)) continue;
    return first;
  }
  return null;
}

// --- what kind of role is it ----------------------------------------------------------------

const APPRENTICE = /\b(apprentice|apprenticeship|degree apprentice)\b/i;
const INTERNSHIP =
  /\b(intern|internship|placement year|industrial placement|summer placement|spring week|insight (week|day|programme|program)|summer analyst|work experience)\b/i;
const GRADUATE_SCHEME =
  /\b(graduate (scheme|programme|program|analyst|engineer|developer|trainee|role|software|associate)|grad scheme|early careers? (programme|program|scheme|analyst)|rotational (programme|program))\b/i;
// "Junior" and "Associate" are NOT here on purpose: a "Junior Planning Manager" or an "Associate,
// Investment Specialist" usually wants a few years' experience. `normalise` reads the advert itself.
const ENTRY_LEVEL = /\b(entry[- ]level|school leaver|trainee|early careers?|graduate)\b/i;

export interface RoleSignals {
  type: 'job' | 'apprenticeship' | 'internship';
  minEntryLevel: number | null;
  experienceRequired: boolean | null;
  tags: OpportunityTag[];
}

export function roleSignals(title: string): RoleSignals {
  const tags: OpportunityTag[] = [];
  let type: RoleSignals['type'] = 'job';
  if (APPRENTICE.test(title)) {
    type = 'apprenticeship';
    tags.push('accredited', 'government-funded');
  } else if (INTERNSHIP.test(title)) {
    type = 'internship';
  }
  return {
    type,
    minEntryLevel: GRADUATE_SCHEME.test(title) ? 6 : null,
    experienceRequired: ENTRY_LEVEL.test(title) || type !== 'job' ? false : null,
    tags,
  };
}

// --- text -----------------------------------------------------------------------------------

const ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&amp;': '&',
  '&nbsp;': ' ',
};

/** Greenhouse returns its HTML entity-escaped ("&lt;p&gt;"), so unescape once before stripping tags. */
export function unescapeHtml(s: string): string {
  return s.replace(/&(lt|gt|quot|amp|nbsp|#39|#x27);/g, (m) => ENTITIES[m] ?? m);
}

export const MAX_DESCRIPTION = 19_500;

export function describe(html: string, title: string): string {
  const text = htmlToText(html);
  return truncate(text || title, MAX_DESCRIPTION);
}

const asIso = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Shared mapping from the common job shape to our canonical input. Pure. */
export function atsJobToInput(job: AtsRecord): OpportunityInput | { reject: string } {
  const title = job.title.trim();
  if (title.length < 3) return { reject: `${job.id}: missing title` };
  if (!job.url.startsWith('https://')) return { reject: `${job.id}: non-https url` };

  const geo = job._geo;
  const place = job._place ?? placeFromLocation(job.locationText);
  const remoteOnly =
    !place && /remote|anywhere|work from home|home[- ]?based/i.test(job.locationText);
  const workMode: WorkMode = job.workplaceType ?? (remoteOnly ? 'remote' : 'onsite');
  const signals = roleSignals(title);

  return {
    externalId: `${job.employer.token}:${job.id}`.slice(0, 200),
    type: signals.type,
    title,
    description: describe(job.description, title),
    organisation: { name: job.employer.name, url: websiteUrl(job.employer.website) },
    applyUrl: job.url,
    level: null,
    minEntryLevel: signals.minEntryLevel,
    experienceRequired: signals.experienceRequired,
    location: {
      label: place ?? (remoteOnly ? 'Remote (UK)' : 'UK'),
      workMode,
      country: geo?.country ?? 'uk',
      ...(geo?.region ? { region: geo.region } : {}),
      ...(geo ? { lat: geo.lat, lon: geo.lon } : {}),
    },
    pay: job.pay,
    cost:
      signals.type === 'apprenticeship'
        ? { kind: 'free', amount: null, note: 'Apprenticeship training is free to you.' }
        : { kind: 'unknown', amount: null },
    postedAt: asIso(job.postedAt),
    minAge: signals.type === 'apprenticeship' ? 16 : null,
    tags: signals.tags,
  };
}
