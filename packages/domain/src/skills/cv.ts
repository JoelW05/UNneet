import { tidyTitle } from '../lib/text';
import type { ExtractedSkill, SkillMatcher } from './matcher';

export interface FoundQualification {
  label: string;
  level: number;
}

export interface QualificationResult {
  /** Highest RQF level found, 0 when none recognised. */
  highestLevel: number;
  found: FoundQualification[];
}

interface QualRule {
  re: RegExp;
  level: number;
  label: string;
}

// Ordered by specificity; every rule is tested, then we take the maximum. Patterns are
// intentionally conservative: a missed qualification is fixed by the user's review step, a
// phantom degree is not.
const QUAL_RULES: readonly QualRule[] = [
  { re: /\b(ph\.?d|doctorate|dphil)\b/i, level: 8, label: 'Doctorate' },
  {
    re: /\b(master'?s|msc|m\.sc|mba|meng|mres|pgce|postgraduate (certificate|diploma))\b/i,
    level: 7,
    label: "Master's / postgraduate",
  },
  {
    re: /\b(bachelor'?s?|bsc|b\.sc|beng|llb|ba \(?hons|degree apprenticeship|honours degree)\b/i,
    level: 6,
    label: "Bachelor's degree",
  },
  {
    re: /\b(foundation degree|hnd|higher national diploma|dip ?he)\b/i,
    level: 5,
    label: 'Foundation degree / HND',
  },
  {
    re: /\b(hnc|higher national certificate|cert ?he|higher apprenticeship)\b/i,
    level: 4,
    label: 'HNC / Level 4',
  },
  {
    re: /\b(a[ -]?levels?|as[ -]levels?|t[ -]levels?|ib diploma|access to he|advanced apprenticeship|btec (national|extended)|(nvq|btec|diploma|certificate)[^.\n]{0,20}level 3)\b/i,
    level: 3,
    label: 'A levels / Level 3',
  },
  {
    re: /\b(gcses?|o[ -]levels?|intermediate apprenticeship|btec first|(nvq|btec|diploma|certificate|functional skills)[^.\n]{0,20}level 2)\b/i,
    level: 2,
    label: 'GCSEs / Level 2',
  },
  {
    re: /\b((nvq|btec|diploma|certificate|functional skills)[^.\n]{0,20}level 1)\b/i,
    level: 1,
    label: 'Level 1',
  },
  {
    re: /\bentry level (certificate|diploma|award|functional skills)\b/i,
    level: 0,
    label: 'Entry level',
  },
];

export function extractQualifications(text: string): QualificationResult {
  const found: FoundQualification[] = [];
  for (const rule of QUAL_RULES) {
    if (rule.re.test(text)) found.push({ label: rule.label, level: rule.level });
  }
  // A "bachelor's" mention alongside "foundation degree" must not be double-counted upward
  // unless it is really there; the max rule handles that fine since both are explicit matches.
  const highestLevel = found.reduce((max, q) => Math.max(max, q.level), 0);
  return { highestLevel, found: found.sort((a, b) => b.level - a.level) };
}

export const TITLE_WORDS =
  /\b(assistant|advis[eo]r|operative|driver|technician|apprentice|worker|officer|coordinator|co-ordinator|administrator|receptionist|cashier|waiter|waitress|chef|cook|carer|engineer|developer|mechanic|labourer|cleaner|barista|server|supervisor|manager|intern|volunteer|tutor|trainee|steward|picker|packer|handler|installer|electrician|plumber|joiner|bricklayer|welder|stylist|barber|therapist|nurse|clerk|associate|team member|crew member|sales)\b/i;

/** Heuristic job-title spotting. Output is shown to the user to confirm or edit. */
export function extractJobTitles(text: string, limit = 8): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.replace(/^[\s•*\-–—·]+/, '').trim();
    if (line.length < 4 || line.length > 60) continue;
    if (/[@:]|https?:|www\./i.test(line) || /\d{5,}/.test(line)) continue; // skip contact lines
    if (line.split(/\s+/).length > 7) continue; // sentences are not titles
    if (!TITLE_WORDS.test(line)) continue;
    const title = tidyTitle(line.replace(/[|,–—-].*$/, '').trim());
    const key = title.toLowerCase();
    if (title.length >= 4 && !seen.has(key)) {
      seen.add(key);
      titles.push(title);
    }
    if (titles.length >= limit) break;
  }
  return titles;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Estimate total years of work from date ranges ("Sep 2019 – Mar 2022", "2021 - present").
 * Overlapping ranges are merged so concurrent jobs aren't double counted. Returns null when no
 * ranges are found. Capped at 50 so an odd regex hit can't produce nonsense.
 */
export function estimateYearsExperience(text: string, now: Date = new Date()): number | null {
  const range =
    /(?:(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to|until)\s*(?:(?:(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})|(present|current|now|ongoing|date))/gi;
  const spans: Array<[number, number]> = [];
  for (const m of text.matchAll(range)) {
    const startMonth =
      MONTHS[(m[1] ?? 'jan').toLowerCase().slice(0, 4)] ??
      MONTHS[(m[1] ?? 'jan').toLowerCase().slice(0, 3)] ??
      0;
    const start = Number(m[2]) + startMonth / 12;
    let end: number;
    if (m[5]) end = now.getFullYear() + now.getMonth() / 12;
    else {
      const endMonth = m[3]
        ? (MONTHS[m[3].toLowerCase().slice(0, 4)] ?? MONTHS[m[3].toLowerCase().slice(0, 3)] ?? 11)
        : 11;
      end = Number(m[4]) + endMonth / 12;
    }
    if (end >= start && end - start <= 50 && start >= 1950) spans.push([start, end]);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = spans[0] as [number, number];
  for (const [s, e] of spans.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      total += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  total += curEnd - curStart;
  return Math.min(50, Math.round(total * 2) / 2);
}

export interface CvExtraction {
  skills: ExtractedSkill[];
  qualifications: QualificationResult;
  jobTitles: string[];
  yearsExperience: number | null;
  wordCount: number;
}

/**
 * Turn CV text into a draft profile. Pure and deterministic. It deliberately returns NO
 * name, e-mail, phone or address, because we never need them and shouldn't touch them.
 */
export function extractFromCv(
  text: string,
  matcher: SkillMatcher,
  now: Date = new Date(),
): CvExtraction {
  const trimmed = text.slice(0, 200_000);
  return {
    skills: matcher.extract(trimmed),
    qualifications: extractQualifications(trimmed),
    jobTitles: extractJobTitles(trimmed),
    yearsExperience: estimateYearsExperience(trimmed, now),
    wordCount: trimmed.split(/\s+/).filter(Boolean).length,
  };
}
