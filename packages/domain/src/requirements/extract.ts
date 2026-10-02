import { truncate } from '../lib/text';
import {
  type ExperienceBasis,
  NO_REQUIREMENTS,
  type RequirementItem,
  type Requirements,
  type Seniority,
} from '../schemas/requirements';
import { extractQualifications } from '../skills/cv';
import type { Level } from '../taxonomy/levels';

/**
 * Reads what an advert asks of an applicant: qualifications, experience, checks, age and skills.
 *
 * It is deliberately conservative and explainable:
 *  - every item is the advert's own wording (trimmed), or a standard label for statutory checks;
 *  - a line only counts as a requirement when it sits under a "requirements"-style heading or
 *    carries a cue such as "must", "essential" or "you will need";
 *  - "desirable" and "helpful" lines are kept but marked as not essential;
 *  - "no experience needed" is only believed when the advert says so explicitly, never inferred
 *    from something like "full training provided";
 *  - a senior title ("Assistant Head", "Senior Associate") is evidence that experience is needed,
 *    even when the advert also says something encouraging.
 * A listing that says nothing comes back as `stated: false`: unknown, not "no requirements".
 */

export interface RequirementsInput {
  title: string;
  description: string;
  /** The opportunity type ("job", "apprenticeship", "course" …). Entry routes default to no experience. */
  type?: string;
}

/** `skip` is for blocks that describe the course or the process rather than what you must have. */
type Section = 'required' | 'desirable' | 'other' | 'skip';
interface Row {
  text: string;
  section: Section;
  bullet: boolean;
}

const BULLET = /^\s*(?:[•*·▪●○◦–—-]|\d+[.)])\s+/;
const MAX_LINE = 240;

const REQUIRED_HEAD =
  /\b(requirements?|essential|you will need|you need|what you(?: will)? need|what we(?: are)? looking for|who we(?: are)? looking for|we are looking for|you will have|you(?: will)? bring|person specification|about you|who you are|skills (?:and|&) (?:experience|qualifications|qualities)|experience (?:and|&) (?:skills|qualifications)|qualifications?|must[- ]haves?|your profile|candidate profile|the successful candidate|entry requirements|skills they are looking for|ideal candidate|minimum)\b/i;
const DESIRABLE_HEAD =
  /\b(desirable|nice to have|preferred|bonus|advantageous|beneficial|helpful, but not required|it would be (?:great|a plus)|would be an advantage)\b/i;

/** Headings whose block is facts about the course or the hiring process, never a requirement. */
const SKIP_HEAD =
  /^\s*(?:key details|course details|at a glance|how you(?:'ll| will| are) be assessed|assessment(?: process)?)\s*:?\s*$/i;

const DESIRABLE_CUE =
  /\b(desirable|preferred|preferably|ideally|advantageous|an advantage|beneficial|bonus|nice to have|would be (?:great|helpful|useful|an? (?:plus|advantage|bonus))|helpful|not essential|not required|not necessary)\b/i;
const ESSENTIAL_CUE =
  /\b(essential|must|required|requirement|need(?:s|ed)? to|you will need|you need|minimum|at least|should have|you have|you will have|proven|demonstrable|mandatory|necessary)\b/i;

/** "No experience needed" in its common spellings. Anything looser ("full training provided") is not enough. */
const NO_EXPERIENCE: readonly RegExp[] = [
  // "No previous experience is necessary" and "No previous experience of invigilation is necessary".
  /\bno (?:previous |prior |relevant |formal |specific |particular )?(?:work |working |industry )?experience(?: (?:of|in|with) [^.\n]{1,60}?)? (?:is |will be |are )?(?:needed|necessary|required|essential)\b/i,
  /\bno (?:previous|prior) (?:work |working |industry )?experience\b/i,
  /\bexperience (?:is |will be )?(?:not|n't) (?:be )?(?:needed|necessary|required|essential|a requirement)\b/i,
  /\b(?:do not|don't|does not|doesn't) (?:need|require)(?: any)?(?: (?:previous|prior|relevant))? experience\b/i,
  // "applicants with no experience are welcome", but not "with no experience of night shifts".
  /\bwith no (?:previous |prior )?experience\b(?! (?:of|in|with)\b)/i,
  /\bcomplete beginners?\b/i,
  /^no (?:previous |prior )?experience[.!]*$/i,
];

const SENIOR_TITLE =
  /\b(senior|snr|lead|leader|principal|head|deputy|director|manager|chief|2ic|architect|expert|chair|second in (?:charge|command))\b|\bhead ?teacher\b/i;
const ENTRY_TITLE =
  /\b(apprentice(?:ship)?s?|trainee|traineeship|intern(?:ship)?s?|graduate|junior|entry[- ]level|placement|volunteer|school leaver|work experience|cadet)\b/i;
/** Titles that really mean "no experience needed" (not just "junior"). */
const NO_EXPERIENCE_TITLE =
  /\b(apprentice(?:ship)?s?|trainee|traineeship|intern(?:ship)?s?|graduate|entry[- ]level|placement|volunteer|school leaver|work experience|cadet)\b/i;

const ENTRY_TYPES = new Set([
  'apprenticeship',
  'traineeship',
  'internship',
  'volunteering',
  'work-experience',
  'course',
  'degree',
  't-level',
  'bootcamp',
  'programme',
  'support',
]);

interface CheckRule {
  re: RegExp;
  label: string | ((line: string) => string);
  /** Statutory checks are stated in "about the school" boilerplate, so they count anywhere. */
  anywhere: boolean;
}
const CHECKS: readonly CheckRule[] = [
  {
    re: /\b(?:dbs|disclosure and barring)\b/i,
    label: (l) => (/\benhanced\b/i.test(l) ? 'Enhanced DBS check' : 'DBS check'),
    anywhere: true,
  },
  { re: /\bright to work\b/i, label: 'Right to work in the UK', anywhere: true },
  {
    re: /\b(?:security clearance|sc clearance|dv clearance|bpss|baseline personnel security)\b/i,
    label: 'Security clearance',
    anywhere: true,
  },
  {
    re: /\bdriving licen[cs]e\b/i,
    label: (l) => (/\bfull\b/i.test(l) ? 'Full driving licence' : 'Driving licence'),
    anywhere: false,
  },
  { re: /\bown (?:transport|car|vehicle)\b/i, label: 'Own transport', anywhere: false },
  { re: /\bfirst aid\b/i, label: 'First aid certificate', anywhere: false },
  { re: /\bfood (?:hygiene|safety)\b/i, label: 'Food hygiene certificate', anywhere: false },
  { re: /\bcscs\b/i, label: 'CSCS card', anywhere: false },
];

const QUAL_WORD =
  /\b(gcses?|a[ -]?levels?|as[ -]levels?|t[ -]levels?|btec|nvq|svq|diploma|certificate|degree|bachelor|masters?|msc|bsc|qts|qualified teacher|pgce|hnc|hnd|functional skills|maths and english|english and maths|level [2-7]|qualifications?)\b/i;
const DEGREE_ASKED =
  /\b(?:a|an|your|hold|have|with|bachelor'?s?|honours|first|university)\s+degree\b|\bdegree (?:in|level|or equivalent|qualified|from|holders?)\b|\bdegree-level\b/i;
const DEGREE_NOT_NEEDED =
  /\b(?:no degree|degree (?:is )?not (?:required|needed|essential)|without a degree)\b/i;
const QTS = /\b(?:qualified teacher status|qts)\b/i;
const QTS_NOT_NEEDED =
  /\b(?:unqualified|working towards|not (?:a )?required|welcome|no qts|without qts|or equivalent experience)\b/i;
const EXPLICIT_LEVEL = /\blevel ([2-7])\b/i;
/** "Entry Level 3", "Entry 2": the entry rungs below GCSE (level 1). The ESOL / functional skills ladder. */
const ENTRY_RUNG = /\bentry[- ]?level\s*[1-3]\b|\bentry\s*[1-3]\b/gi;
/** "The entry requirements for A Level are …": names the thing applied for, so it is not a requirement. */
const ENTRY_FOR_COURSE =
  /\b(?:(?:entry |admission |course )?(?:requirements?|criteria|prerequisites?)\s+(?:for|to|on|of)|(?:to|before you can) (?:study|take|start|begin|join|do|enrol (?:on|in|for)|apply for)|for entry (?:to|onto|on))\s+(?:(?:studying|taking|starting|beginning|joining|doing|entering|applying for|enrolling (?:on|in|for))\s+)?(?:the\s+|an?\s+)?(?:gce\s+)?(?:a[ -]?levels?|as[ -]levels?|btecs?|t[ -]levels?|degrees?|diplomas?|nvqs?|hn[cd]s?|qualification|course|programme)\b/gi;
/** "…and don't have a GCSE grade 4": an exclusion, so the qualification named is one you must LACK. */
const EXCLUSION =
  /\b(?:(?:do not|don\W?t|does not|doesn\W?t|did not|didn\W?t|have not|haven\W?t|has not|hasn\W?t)(?: yet| already)? (?:have|hold|possess|got|achieved|gained|passed|obtained)|not yet (?:achieved|gained|passed|got))\b[^.;]{0,25}\b(?:gcses?|a[ -]?levels?|grade|level|qualifications?|degree|diploma|nvq|btec)\b/i;
const EQUIVALENT = /\bor equivalent\b|\bequivalent (?:qualification|experience|level)\b/i;

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const YEARS =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:or more\s*)?years?\b/i;
const EXPERIENCE_WORD = /\b(?:experience|experienced|track record|worked|working)\b/i;

const AGE_PATTERNS: readonly RegExp[] = [
  /\b(?:must be|be at least|aged|age of|over the age of|applicants? (?:must be|are)|candidates? (?:must be|are))\s*(?:aged\s*)?(1[4-9]|2[0-5])\b(?!\s*(?:months?|weeks?|hours?|%|k\b|years? (?:of )?experience))/i,
  /\b(1[4-9]|2[0-5])\s*(?:\+|years? (?:old )?(?:or|and) (?:over|older|above)|(?:or|and) (?:over|older|above))/i,
];

/** "No formal entry requirements" in its common spellings (course providers write this a lot). */
const NO_QUALIFICATIONS: readonly RegExp[] = [
  /\bno (?:formal |specific |particular |prior |previous )?(?:qualifications?|entry requirements?)(?: (?:are |is )?(?:needed|necessary|required|essential))?\b/i,
  /\bthere are no (?:[a-z-]+ ){0,4}requirements?\b/i,
  /\bno (?:previous|prior) (?:learning|study)\b/i,
  /\bopen to (?:all|everyone|anyone)\b/i,
];

/**
 * "There are no NATIONAL entry requirements for a T Level" is followed by "these are set by the
 * college", and "no formal qualifications, but you need to pass an assessment" is not a free pass.
 */
const NOT_A_FREE_PASS =
  /\bno national\b|\b(?:but|however|although|though|except)\b|\bset (?:by|their own)\b|\b(?:their|its) own (?:entry )?(?:requirements|criteria)\b|\bvar(?:y|ies)\b/i;

/** Does this line say no qualifications are needed to start? */
export function saysNoQualifications(text: string): boolean {
  return NO_QUALIFICATIONS.some((re) => re.test(text)) && !NOT_A_FREE_PASS.test(text);
}

// --- reading the text -------------------------------------------------------------------------

const tidy = (s: string): string => s.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

function sentences(row: string): string[] {
  return row
    .split(/(?<=[.!?])\s+(?=[A-Z£•])/)
    .map(tidy)
    .filter((s) => s.length >= 8);
}

function looksLikeHeading(s: string): boolean {
  return (
    s.length >= 3 &&
    s.length <= 70 &&
    !BULLET.test(s) &&
    !/[.!?]$/.test(s) &&
    s.split(/\s+/).length <= 9
  );
}

function sectionOf(heading: string): Section {
  if (SKIP_HEAD.test(heading)) return 'skip';
  const desirable = DESIRABLE_HEAD.test(heading);
  const required = REQUIRED_HEAD.test(heading);
  if (desirable && !/\bessential\b/i.test(heading)) return 'desirable';
  if (required) return 'required';
  return desirable ? 'desirable' : 'other';
}

function readRows(description: string): Row[] {
  const paragraphs = description
    .replace(/\r\n?/g, '\n')
    .replace(/[’‘]/g, "'")
    .split(/\n{2,}/)
    .map((p) =>
      p
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean),
    )
    .filter((p) => p.length > 0);

  let section: Section = 'other';
  const rows: Row[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    let lines = paragraphs[i] as string[];
    const first = lines[0] as string;
    const nextStartsList = BULLET.test(paragraphs[i + 1]?.[0] ?? '');
    const listFollows = lines.length > 1 && BULLET.test(lines[1] as string);
    const isHeading =
      looksLikeHeading(first) &&
      (first.endsWith(':') ||
        REQUIRED_HEAD.test(first) ||
        DESIRABLE_HEAD.test(first) ||
        nextStartsList ||
        listFollows);
    if (isHeading) {
      section = sectionOf(first);
      lines = lines.slice(1);
    }
    if (section === 'skip') continue;
    for (const line of lines) {
      if (BULLET.test(line)) {
        rows.push({ text: tidy(line.replace(BULLET, '')), section, bullet: true });
      } else {
        for (const s of sentences(line)) rows.push({ text: s, section, bullet: false });
      }
    }
  }
  return rows.filter((r) => r.text.length >= 3);
}

// --- reading one line ---------------------------------------------------------------------------

function levelOfLine(line: string): Level | null {
  // "a Level 2 qualification" is the article "a" followed by "Level 2", not an A level.
  let text = line
    // ("such as a Level 2 NVQ" must not leave "as Level", which reads as an AS level either.)
    .replace(/\b(?:(?:a|an|as) ){1,2}level ([0-8])\b/gi, 'level $1')
    // "entry requirements for A Level are 5 GCSEs": the A level is what you are applying for.
    .replace(ENTRY_FOR_COURSE, ' ');
  // "don't have a GCSE grade 4" describes who the course is FOR (Multiply), not what you must hold.
  if (EXCLUSION.test(text)) return null;
  // "Entry Level 3 ESOL" is the lowest rung (level 0), whatever the number after it says.
  const withoutRung = text.replace(ENTRY_RUNG, ' ');
  const entryRung = withoutRung !== text;
  text = withoutRung;
  if (entryRung && !QUAL_WORD.test(text)) return 0;
  if (!QUAL_WORD.test(text)) return null;
  const levels: number[] = entryRung ? [0] : [];
  const found = extractQualifications(text);
  if (found.found.length > 0) levels.push(found.highestLevel);
  if (DEGREE_ASKED.test(text) && !DEGREE_NOT_NEEDED.test(text)) levels.push(6);
  if (QTS.test(text) && !QTS_NOT_NEEDED.test(text)) levels.push(6);
  const explicit = EXPLICIT_LEVEL.exec(text);
  if (explicit?.[1]) levels.push(Number(explicit[1]));
  // "Maths and English" on its own means GCSE-level, the usual ask.
  if (levels.length === 0 && /\b(?:maths and english|english and maths)\b/i.test(text))
    levels.push(2);
  return levels.length > 0 ? (Math.max(...levels) as Level) : null;
}

function yearsOfLine(text: string): number | null {
  const m = YEARS.exec(text);
  if (!m?.[1] || !EXPERIENCE_WORD.test(text)) return null;
  const n = WORD_NUMBERS[m[1].toLowerCase()] ?? Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
}

interface LineReading {
  items: RequirementItem[];
  equivalent: boolean;
  minAge: number | null;
}

function readLine(row: Row): LineReading {
  const t = row.text;
  const items: RequirementItem[] = [];
  const negated = NO_EXPERIENCE.some((re) => re.test(t));
  const desirable = row.section === 'desirable' || DESIRABLE_CUE.test(t);
  const cue = ESSENTIAL_CUE.test(t);
  const counts = row.section === 'required' || cue || desirable;
  const essential = !desirable && (row.section === 'required' || cue);
  const short = truncate(t, MAX_LINE);
  let equivalent = false;
  let minAge: number | null = null;
  let matched = false;

  for (const rule of CHECKS) {
    if (!rule.re.test(t)) continue;
    if (!rule.anywhere && !counts) continue;
    items.push({
      kind: 'check',
      text: typeof rule.label === 'function' ? rule.label(t) : rule.label,
      essential: rule.anywhere ? !desirable : essential,
    });
    matched = true;
  }

  for (const pattern of AGE_PATTERNS) {
    const m = pattern.exec(t);
    if (
      m?.[1] &&
      (counts || /\b(?:apply|applicants?|candidates?|learners?|students?)\b/i.test(t))
    ) {
      const age = Number(m[1]);
      minAge = age;
      items.push({ kind: 'age', text: `You must be ${age} or over`, essential: true });
      matched = true;
      break;
    }
  }

  if (
    saysNoQualifications(t) &&
    (row.section === 'required' || cue || /^(?:no |there are no |open to )/i.test(t))
  ) {
    items.push({ kind: 'qualification', text: short, essential: true, level: 0 });
    matched = true;
  }

  const level = counts ? levelOfLine(t) : null;
  if (level !== null) {
    items.push({ kind: 'qualification', text: short, essential, level });
    if (EQUIVALENT.test(t)) equivalent = true;
    matched = true;
  }

  if (
    counts &&
    !negated &&
    (/\bexperience\b|\bexperienced\b/i.test(t) || yearsOfLine(t) !== null)
  ) {
    // A qualification line that merely mentions "or equivalent experience" is not an experience ask.
    const onlyEquivalent =
      level !== null && !/\bexperience of\b|\byears\b/i.test(t.replace(EQUIVALENT, ''));
    if (!onlyEquivalent) {
      items.push({ kind: 'experience', text: short, essential, years: yearsOfLine(t) });
      matched = true;
    }
  }

  const isQualityLine =
    /\b(?:good|excellent|strong|great)\b[^.]{0,40}\bskills?\b|\bability to\b|\bable to\b/i.test(t);
  if (
    !matched &&
    !negated &&
    counts &&
    (row.bullet || isQualityLine) &&
    t.length <= 160 &&
    !/\bwe\b|\bour\b/i.test(t)
  ) {
    items.push({ kind: 'skill', text: short, essential });
  }
  return { items, equivalent, minAge };
}

// --- putting it together --------------------------------------------------------------------------

const KIND_LIMIT: Readonly<Record<RequirementItem['kind'], number>> = {
  qualification: 4,
  experience: 3,
  skill: 6,
  check: 5,
  age: 1,
};

export function titleSeniority(title: string): Seniority {
  // "Junior Planning Manager" is an entry-level manager role, so entry words win over "manager".
  if (ENTRY_TITLE.test(title)) return 'entry';
  if (SENIOR_TITLE.test(title)) return 'senior';
  return 'unknown';
}

export function extractRequirements(input: RequirementsInput): Requirements {
  const title = tidy(input.title);
  const rows = readRows(input.description);

  const readings = rows.map(readLine);
  const raw = readings.flatMap((r) => r.items);
  const equivalentAccepted = readings.some((r) => r.equivalent);
  const minAge = readings.map((r) => r.minAge).find((a): a is number => a !== null) ?? null;

  // Dedupe on text, essential first, then cap per kind so one rambling advert cannot flood the list.
  const seen = new Set<string>();
  const perKind = new Map<string, number>();
  const items: RequirementItem[] = [];
  const ordered = [...raw].sort((a, b) => Number(b.essential) - Number(a.essential));
  for (const item of ordered) {
    const key = `${item.kind}:${item.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    const used = perKind.get(item.kind) ?? 0;
    if (used >= KIND_LIMIT[item.kind]) continue;
    seen.add(key);
    perKind.set(item.kind, used + 1);
    items.push(item);
  }

  const essentialLevels = items
    .filter((i) => i.kind === 'qualification' && i.essential && typeof i.level === 'number')
    .map((i) => i.level as number);
  const minLevel = essentialLevels.length > 0 ? (Math.max(...essentialLevels) as Level) : null;

  const essentialExperience = items.filter((i) => i.kind === 'experience' && i.essential);
  const years = essentialExperience.reduce<number | null>(
    (max, i) => (typeof i.years === 'number' && (max === null || i.years > max) ? i.years : max),
    null,
  );
  const saysNone = rows.find((r) => NO_EXPERIENCE.some((re) => re.test(r.text)));

  const seniority = titleSeniority(title);
  const entryTitle = NO_EXPERIENCE_TITLE.test(title);
  let required: boolean | null = null;
  let basis: ExperienceBasis | null = null;
  let evidence: string | null = null;

  if (seniority === 'senior') {
    required = true;
    basis = 'title';
    evidence = `The job title (“${truncate(title, 80)}”) suggests a senior role.`;
  } else if (essentialExperience.length > 0) {
    required = true;
    basis = 'text';
    evidence = essentialExperience[0]?.text ?? null;
  } else if (saysNone) {
    required = false;
    basis = 'text';
    evidence = truncate(saysNone.text, MAX_LINE);
  } else if (entryTitle) {
    required = false;
    basis = 'title';
    evidence = `The job title (“${truncate(title, 80)}”) is an entry route.`;
  } else if (input.type && ENTRY_TYPES.has(input.type)) {
    required = false;
    basis = 'type';
    evidence = null;
  }

  const stated = items.length > 0 || basis === 'text' || basis === 'title';
  if (!stated && required === null && minLevel === null) return { ...NO_REQUIREMENTS, seniority };

  return {
    stated,
    seniority,
    experience: { required, years, basis, evidence },
    minLevel,
    equivalentAccepted,
    minAge,
    items,
  };
}
