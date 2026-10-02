import { tidyTitle } from '../lib/text';
import type {
  EducationEntry,
  EducationKind,
  ExperienceEntry,
  ExperienceKind,
} from '../schemas/history';
import { TITLE_WORDS } from '../skills/cv';
import type { SkillMatcher } from '../skills/matcher';

/**
 * Read a CV's text and draft the person's education and experience history from it.
 *
 * This is HEURISTIC and says so everywhere it is shown: the output is a draft for the person to
 * tick, edit or throw away. Two design rules follow from that:
 *   - prefer missing something to inventing something (a phantom degree is worse than a gap);
 *   - never return names, e-mail addresses, phone numbers or addresses (we do not need them).
 */
export interface CvHistory {
  education: EducationEntry[];
  experience: ExperienceEntry[];
  /** Which standard sections the CV has, e.g. ["profile","education","experience","skills"]. */
  sections: CvSection[];
}

export type CvSection =
  | 'profile'
  | 'education'
  | 'experience'
  | 'volunteering'
  | 'skills'
  | 'interests'
  | 'achievements'
  | 'references'
  | 'languages'
  | 'other';

const HEADINGS: ReadonlyArray<readonly [CvSection, readonly string[]]> = [
  [
    'education',
    [
      'education',
      'education and training',
      'education training',
      'qualifications',
      'academic qualifications',
      'academic background',
      'academic history',
      'education and qualifications',
      'schooling',
    ],
  ],
  [
    'experience',
    [
      'work experience',
      'employment history',
      'employment',
      'experience',
      'professional experience',
      'work history',
      'career history',
      'relevant experience',
      'employment experience',
      'work and experience',
    ],
  ],
  [
    'volunteering',
    [
      'volunteering',
      'voluntary work',
      'volunteer experience',
      'voluntary experience',
      'community involvement',
      'extracurricular activities',
      'extra curricular activities',
    ],
  ],
  [
    'skills',
    [
      'skills',
      'key skills',
      'core skills',
      'technical skills',
      'transferable skills',
      'personal skills',
      'skills and abilities',
      'competencies',
    ],
  ],
  [
    'profile',
    [
      'profile',
      'personal statement',
      'personal profile',
      'summary',
      'professional summary',
      'career objective',
      'about me',
      'objective',
    ],
  ],
  ['interests', ['interests', 'hobbies', 'hobbies and interests', 'interests and hobbies']],
  [
    'achievements',
    [
      'achievements',
      'awards',
      'accomplishments',
      'certificates',
      'certifications',
      'courses',
      'training',
      'awards and achievements',
    ],
  ],
  ['references', ['references', 'referees']],
  ['languages', ['languages']],
  [
    'other',
    ['additional information', 'personal details', 'other information', 'additional details'],
  ],
];

const normaliseHeading = (line: string): string =>
  line
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Is this line a section heading ("Work Experience", "EDUCATION:")? */
export function headingSection(line: string): CvSection | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 45) return null;
  if (/\d{4}/.test(trimmed) || /[.!?]$/.test(trimmed)) return null;
  const n = normaliseHeading(trimmed);
  if (!n || n.split(' ').length > 6) return null;
  for (const [section, phrases] of HEADINGS) {
    for (const phrase of phrases) {
      if (n === phrase) return section;
      // "Skills and interests", "Education & Training": a known phrase plus a few extra words.
      if (n.startsWith(`${phrase} `) && n.split(' ').length - phrase.split(' ').length <= 3) {
        return section;
      }
    }
  }
  return null;
}

// --- dates ----------------------------------------------------------------------------------

const MONTH_NAMES =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const YEAR = '(?:19|20)\\d{2}';
const DATE = `(?:(?:${MONTH_NAMES})\\.?,?\\s+)?${YEAR}|(?:0?[1-9]|1[0-2])\\/${YEAR}`;
const RANGE = new RegExp(
  `(?<start>${DATE})\\s*(?:-|–|—|to|until)\\s*(?<end>${DATE}|present|current(?:ly)?|now|ongoing|today|date)`,
  'i',
);

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

interface Ym {
  year: number;
  month: number | null;
}

function parseDate(text: string): Ym | null {
  const numeric = /^(\d{1,2})\/((?:19|20)\d{2})$/.exec(text.trim());
  if (numeric) return { year: Number(numeric[2]), month: Number(numeric[1]) };
  const year = /((?:19|20)\d{2})/.exec(text);
  if (!year) return null;
  const month = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.exec(text);
  return {
    year: Number(year[1]),
    month: month ? (MONTH_INDEX[(month[1] as string).toLowerCase()] as number) : null,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface DateRange {
  /** "YYYY-MM" */
  from: string;
  /** "YYYY-MM", or null when it runs to the present. */
  to: string | null;
  /** The matched text, so callers can remove it from the line. */
  text: string;
  endYear: number | null;
}

export function parseDateRange(line: string, now: Date): DateRange | null {
  const m = RANGE.exec(line);
  const start = m?.groups?.start;
  const end = m?.groups?.end;
  if (!m || !start || !end) return null;
  const s = parseDate(start);
  if (!s) return null;
  const from = `${s.year}-${pad(s.month ?? 1)}`;
  if (/^(present|current|currently|now|ongoing|today|date)$/i.test(end.trim())) {
    return { from, to: null, text: m[0], endYear: null };
  }
  const e = parseDate(end);
  if (!e) return null;
  if (e.year < s.year) return null;
  let to = `${e.year}-${pad(e.month ?? 12)}`;
  const today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  if (to > today && e.month === null) to = today; // "2019 – 2026" with no month: never past today
  return { from, to, text: m[0], endYear: e.year };
}

// --- education ------------------------------------------------------------------------------

const EDU_RULES: ReadonlyArray<readonly [EducationKind, RegExp]> = [
  ['doctorate', /\b(ph\.?d|doctorate|dphil)\b/i],
  [
    'masters',
    /\b(master'?s|msc|m\.sc|mba|meng|mres|mphil|pgce|postgraduate (certificate|diploma))\b/i,
  ],
  [
    'degree',
    /\b(bachelor'?s?|bsc|b\.sc|beng|llb|ba\s*\(?hons|honours degree|degree in|undergraduate degree|bed)\b/i,
  ],
  [
    'foundation',
    /\b(foundation degree|hnd|higher national diploma|hnc|higher national certificate|dip ?he|cert ?he)\b/i,
  ],
  ['t-level', /\bt[ -]levels?\b/i],
  ['access', /\baccess to (he|higher education)\b/i],
  ['a-level', /\b(a[ -]?levels?|as[ -]levels?)\b/i],
  ['btec', /\bbtecs?\b/i],
  ['apprenticeship', /\bapprenticeship\b/i],
  ['nvq', /\b(nvq|svq|city (and|&) guilds|level [1-8]\s+(diploma|certificate|award))\b/i],
  ['gcse', /\b(gcses?|national 5s?|o[ -]levels?)\b/i],
];

const PROVIDER =
  /\b((?:[A-Z][\w'’&.-]*\s+){0,4}(?:College|School|University|Academy|Institute|Sixth Form|Polytechnic))\b(?:\s+of\s+[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)?/;
const UNIVERSITY_OF = /\b(University of [A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)/;

const GRADE =
  /\b(?:grades?|predicted|achieved|result)\s*:?\s*((?:[A-G]\*?(?:\s*[-–,/]\s*[A-G]\*?)*)|[1-9](?:\s*[-–]\s*[1-9])?|distinction\*?|merit|pass)\b/i;
const DEGREE_CLASS = /\b(first[- ]class|2:1|2:2|upper second|lower second|third[- ]class)\b/i;

const STUDYING = /\b(present|current(?:ly)?|ongoing|studying|expected|predicted|in progress)\b/i;
const LEFT_EARLY =
  /\b(left early|withdrew|incomplete|not completed|did not (?:finish|complete)|dropped out)\b/i;

const stripBullet = (s: string): string => s.replace(/^[\s•*·\-–—▪●○◦\d.)]+(?=\S)/, '').trim();

function cleanTitle(s: string, rangeText?: string): string {
  let t = s;
  if (rangeText) t = t.replace(rangeText, ' ');
  t = t
    .replace(/\(?\s*(?:19|20)\d{2}\s*\)?/g, ' ')
    .replace(/[|–—]/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;·-]+|[\s,.:;·-]+$/g, '');
  return t.slice(0, 120);
}

function educationFromLine(
  line: string,
  now: Date,
  inheritedProvider: string | undefined,
): Omit<EducationEntry, 'id'> | null {
  const kind = EDU_RULES.find(([, re]) => re.test(line))?.[0];
  if (!kind) return null;
  const range = parseDateRange(line, now);
  const years = [...line.matchAll(/(?:19|20)\d{2}/g)].map((m) => Number(m[0]));
  const lastYear = range?.endYear ?? years.at(-1);
  const grade = GRADE.exec(line)?.[1] ?? DEGREE_CLASS.exec(line)?.[1];
  const provider = (
    UNIVERSITY_OF.exec(line)?.[1] ??
    PROVIDER.exec(line)?.[1] ??
    inheritedProvider
  )?.trim();
  const year =
    lastYear !== undefined && lastYear >= 1950 && lastYear <= 2100 ? lastYear : undefined;
  const todayYear = now.getUTCFullYear();
  const studying =
    STUDYING.test(line) || range?.to === null || (year !== undefined && year > todayYear);
  const status = LEFT_EARLY.test(line) ? 'left-early' : studying ? 'studying' : 'completed';
  const title = cleanTitle(stripBullet(line), range?.text);
  if (title.length < 2) return null;
  return {
    kind,
    title,
    status,
    ...(provider ? { provider: provider.slice(0, 120) } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(grade ? { grade: grade.slice(0, 40) } : {}),
  };
}

// --- experience -----------------------------------------------------------------------------

const BULLET_START = /^\s*[•*·▪●○◦\-–—]\s+/;

/** Split "Care Assistant – Sunrise, Bradford" / "Tesco | Cashier" / "Barista at Costa" into title and organisation. */
export function splitTitleAndOrganisation(text: string): { title: string; organisation?: string } {
  const cleaned = text.replace(/^[\s,|–—-]+|[\s,|–—-]+$/g, '').replace(/\s{2,}/g, ' ');
  const at = / (?:at|@) /i.exec(cleaned);
  if (at && at.index > 1) {
    const title = cleaned.slice(0, at.index).trim();
    const organisation = cleaned
      .slice(at.index + at[0].length)
      .split(/[,|–—]/)[0]
      ?.trim();
    return { title, ...(organisation ? { organisation } : {}) };
  }
  const parts = cleaned
    .split(/\s*[|–—·]\s*|\s+-\s+|,\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length <= 1) return { title: cleaned };
  const titleIndex = Math.max(
    0,
    parts.findIndex((p) => TITLE_WORDS.test(p)),
  );
  const organisation = parts.find((_, i) => i !== titleIndex);
  return { title: parts[titleIndex] as string, ...(organisation ? { organisation } : {}) };
}

function experienceKind(heading: string, section: CvSection): ExperienceKind {
  if (section === 'volunteering' || /\bvolunteer/i.test(heading)) return 'volunteering';
  if (/work experience|work placement|placement|work shadowing|intern(?:ship)?\b/i.test(heading))
    return 'work-experience';
  if (/\b(carer|caring for|young carer)\b/i.test(heading)) return 'caring';
  if (/\b(freelance|self[- ]employed|own business)\b/i.test(heading)) return 'self-employed';
  return 'job';
}

const SKIP_SECTIONS: ReadonlySet<CvSection> = new Set([
  'education',
  'skills',
  'interests',
  'references',
  'languages',
  'profile',
  'achievements',
]);

const looksLikeProse = (s: string, maxWords = 14): boolean => s.split(/\s+/).length > maxWords;

/**
 * Draft education and experience from CV text. `matcher` (optional) attaches the skills each
 * experience entry's description mentions.
 */
export function extractHistory(text: string, now: Date, matcher?: SkillMatcher): CvHistory {
  const lines = text
    .slice(0, 200_000)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());

  const education: EducationEntry[] = [];
  const experience: ExperienceEntry[] = [];
  const sections: CvSection[] = [];
  let section: CvSection | null = null;
  let provider: string | undefined;

  const dedupeEdu = new Set<string>();
  const addEducation = (e: Omit<EducationEntry, 'id'>) => {
    const key = `${e.kind}:${e.title.toLowerCase()}`;
    if (dedupeEdu.has(key) || education.length >= 12) return;
    dedupeEdu.add(key);
    education.push({ id: `edu-${education.length + 1}`, ...e });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (!line) continue;

    const heading = headingSection(line);
    if (heading) {
      section = heading;
      provider = undefined;
      if (!sections.includes(heading)) sections.push(heading);
      continue;
    }

    // Education: a qualification mentioned in an education-ish part of the CV.
    if (section === 'education' || section === 'achievements' || section === null) {
      const entry = educationFromLine(line, now, provider);
      // A qualification line can legitimately be long ("A levels: Maths (A), Physics (B), …").
      if (entry && !looksLikeProse(line, 28)) {
        addEducation(entry);
        continue;
      }
      if (section === 'education') {
        const p = UNIVERSITY_OF.exec(line)?.[1] ?? PROVIDER.exec(line)?.[1];
        if (p && line.length < 90) provider = p.trim();
      }
    }

    // Experience: a line (or the line above it) with a date range.
    const range = parseDateRange(line, now);
    if (!range || (section !== null && SKIP_SECTIONS.has(section))) continue;
    if (EDU_RULES.some(([, re]) => re.test(line)) && section !== 'experience') continue;

    let headingText = cleanTitle(stripBullet(line), range.text);
    if (headingText.length < 3) {
      // The dates sit on their own line; the role is on the line above.
      for (let back = i - 1; back >= Math.max(0, i - 2); back--) {
        const prev = lines[back] as string;
        if (
          prev &&
          !BULLET_START.test(prev) &&
          !headingSection(prev) &&
          !parseDateRange(prev, now)
        ) {
          headingText = cleanTitle(prev);
          break;
        }
      }
    }
    if (headingText.length < 3 || looksLikeProse(headingText)) continue;

    const { title, organisation } = splitTitleAndOrganisation(headingText);
    const cleanedTitle = tidyTitle(title).slice(0, 100);
    if (cleanedTitle.length < 2) continue;

    // Bullets under the heading describe what they did, until the next entry or heading.
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && body.length < 6; j++) {
      const next = lines[j] as string;
      if (!next) {
        if (body.length > 0) break;
        continue;
      }
      if (headingSection(next) || parseDateRange(next, now)) break;
      if (
        !BULLET_START.test(next) &&
        body.length === 0 &&
        next.split(/\s+/).length <= 6 &&
        !/[.!?]$/.test(next)
      ) {
        // A short non-bullet line right under the heading is usually the employer or location.
        continue;
      }
      body.push(stripBullet(next));
    }
    const description = body.join(' ').slice(0, 600) || undefined;

    experience.push({
      id: `exp-${experience.length + 1}`,
      kind: experienceKind(headingText, section ?? 'experience'),
      title: cleanedTitle,
      ...(organisation ? { organisation: organisation.slice(0, 120) } : {}),
      from: range.from,
      to: range.to,
      ...(description ? { description } : {}),
      skills:
        matcher && description
          ? matcher
              .extract(description)
              .slice(0, 5)
              .map((s) => ({ id: s.id, label: s.label }))
          : [],
    });
    if (experience.length >= 12) break;
  }

  return { education, experience, sections };
}
