import { extractQualifications } from '../skills/cv';
import type { SkillMatcher } from '../skills/matcher';
import { type Level, levelLabel } from '../taxonomy/levels';

/**
 * "Does my CV fit this job?" Compare the skills, qualification level and experience a job
 * advert asks for with what the person has. It is guidance for tailoring a CV honestly: it never
 * suggests claiming a skill you do not have, and a poor match is framed as a stretch, not a no.
 */
export interface SkillRef {
  id: string;
  label: string;
}

export type FitStatus = 'meets' | 'below' | 'unknown';

export interface JobFit {
  /** Share of the job's recognised skills the person has (0–1), or null if none were recognised. */
  coverage: number | null;
  matched: SkillRef[];
  missing: SkillRef[];
  level: { required: Level | null; have: Level; status: FitStatus };
  experience: { requiredYears: number | null; haveYears: number | null; status: FitStatus };
  verdict: string;
  tips: string[];
}

const YEARS =
  /(\d{1,2})\s*\+?\s*(?:or more\s*)?years?[’']?\s*(?:of\s*)?(?:relevant\s*|previous\s*|proven\s*|work\s*|industry\s*|recent\s*|similar\s*)?(?:experience|working)/i;

export function requiredYearsOf(jobText: string): number | null {
  const m = YEARS.exec(jobText);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

const ASKS_FOR_DEGREE = /\bdegree\b(?! of)/i;
const NO_DEGREE_NEEDED = /\b(no degree|degree (is )?not (required|needed|essential))\b/i;

/**
 * The qualification level a job advert asks for, or null. A CV mentioning "degree" proves little,
 * but an ADVERT saying "you need a degree" is a clear signal, so adverts get one extra rule.
 */
export function requiredLevelOf(jobText: string): Level | null {
  const found = extractQualifications(jobText);
  let level: Level | null = found.found.length > 0 ? (found.highestLevel as Level) : null;
  if (ASKS_FOR_DEGREE.test(jobText) && !NO_DEGREE_NEEDED.test(jobText) && (level ?? 0) < 6) {
    level = 6;
  }
  return level;
}

export function compareToJob(input: {
  cvSkills: readonly SkillRef[];
  jobText: string;
  matcher: SkillMatcher;
  haveLevel: Level;
  haveYears: number | null;
}): JobFit {
  const { cvSkills, jobText, matcher, haveLevel, haveYears } = input;

  const wanted = matcher.extract(jobText.slice(0, 50_000));
  const mine = new Set(cvSkills.map((s) => s.id));
  const matched = wanted.filter((s) => mine.has(s.id)).map((s) => ({ id: s.id, label: s.label }));
  const missing = wanted.filter((s) => !mine.has(s.id)).map((s) => ({ id: s.id, label: s.label }));
  const coverage = wanted.length === 0 ? null : matched.length / wanted.length;

  const requiredLevel = requiredLevelOf(jobText);
  const levelStatus: FitStatus =
    requiredLevel === null ? 'unknown' : haveLevel >= requiredLevel ? 'meets' : 'below';

  const requiredYears = requiredYearsOf(jobText);
  const expStatus: FitStatus =
    requiredYears === null || haveYears === null
      ? 'unknown'
      : haveYears >= requiredYears
        ? 'meets'
        : 'below';

  const tips: string[] = [];
  for (const s of missing.slice(0, 4)) {
    tips.push(
      `The advert mentions ${s.label.toLowerCase()}. If you have really used it (even a little, even outside work), add a line saying where. If not, it may be worth learning: a short free course can be enough to mention.`,
    );
  }
  if (levelStatus === 'below' && requiredLevel !== null) {
    tips.push(
      `It asks for around ${levelLabel(requiredLevel)}, and you have ${levelLabel(haveLevel)}. Check whether it says “or equivalent”: many employers accept experience or an apprenticeship route instead. If not, look at apprenticeships that lead to this role.`,
    );
  }
  if (expStatus === 'below' && requiredYears !== null) {
    tips.push(
      `It mentions about ${requiredYears} year${requiredYears === 1 ? '' : 's'} of experience. Part-time work, volunteering and projects count towards that, so spell them out. Many people apply when they meet most, not all, of a list.`,
    );
  }
  if (matched.length > 0) {
    tips.push(
      `Put ${matched
        .slice(0, 3)
        .map((s) => s.label.toLowerCase())
        .join(', ')} near the top of your CV: they are exactly what this advert is looking for.`,
    );
  }

  const verdict =
    coverage === null
      ? 'We could not spot specific skills in that advert, so we cannot compare. Read it closely and mirror its wording where it is true.'
      : coverage >= 0.7
        ? 'A strong match on skills. Make sure the important ones are easy to spot.'
        : coverage >= 0.4
          ? 'A good match with a few gaps. Worth applying: tailor your CV to the gaps you can honestly fill.'
          : 'A stretch on skills, but not out of reach. Look for what you can show that is close, or consider a step that builds towards it.';

  return {
    coverage: coverage === null ? null : Math.round(coverage * 100) / 100,
    matched,
    missing,
    level: { required: requiredLevel, have: haveLevel, status: levelStatus },
    experience: { requiredYears, haveYears, status: expStatus },
    verdict,
    tips,
  };
}
