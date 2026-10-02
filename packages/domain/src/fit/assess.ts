import { educationLevel } from '../schemas/history';
import { effectiveProfile, type Profile } from '../schemas/profile';
import type { Requirements } from '../schemas/requirements';
import { type Level, levelLabel } from '../taxonomy/levels';
import type { AgeBand } from '../taxonomy/misc';

/**
 * "How well do I fit what this advert asks for?" as a traffic light with reasons.
 *
 * What it IS: a comparison of the person's profile (education, work history, skills, age band)
 * with the requirements the advert states. What it is NOT: a prediction of being hired. Employers
 * choose between people; this only says whether the person meets what is written down. The
 * wording everywhere reflects that, and a red light always comes with a way forward.
 *
 * Hard checks (qualification level, experience, minimum age, driving licence) decide red or amber.
 * Skills overlap is a soft signal: it can nudge green to amber but never make a role red.
 */

export type FitLight = 'green' | 'amber' | 'red' | 'unknown';
export type CheckStatus = 'meets' | 'close' | 'gap' | 'unknown';
export type CheckId = 'level' | 'experience' | 'age' | 'skills' | 'licence';

export interface FitCheck {
  id: CheckId;
  label: string;
  status: CheckStatus;
  /** Plain-English reason, always about the advert and the person, never a judgement. */
  detail: string;
  /** Hard checks can make a role red; soft ones cannot. */
  hard: boolean;
}

export interface Fit {
  light: FitLight;
  /** 0–100 over the checks we could make, or null when there was nothing to check. */
  score: number | null;
  headline: string;
  checks: FitCheck[];
  /** Why there is no light, when there is none. */
  reason: 'no-profile' | 'no-requirements' | null;
}

/** The fields of a listing that fit needs. An `OpportunityCard` satisfies this. */
export interface FitListing {
  minEntryLevel: number | null;
  minAge: number | null;
  maxAge: number | null;
  experienceRequired: boolean | null;
  skills: ReadonlyArray<{ id: string; label: string }>;
  requirements?: Requirements | null | undefined;
}

/** Senior roles (by title) with no stated years: what "experience" is usually taken to mean. */
export const IMPLIED_SENIOR_YEARS = 3;
/** Having at least this share of the years asked for is "close", not a gap. */
const CLOSE_SHARE = 0.6;

const BAND_RANGE: Readonly<Record<AgeBand, readonly [number, number]>> = {
  '16-17': [16, 17],
  '18-21': [18, 21],
  '22-24': [22, 24],
  '25+': [25, 99],
};

const WEIGHT: Readonly<Record<CheckId, number>> = {
  level: 0.35,
  experience: 0.35,
  age: 0.1,
  skills: 0.15,
  licence: 0.05,
};
const VALUE: Readonly<Record<CheckStatus, number>> = { meets: 1, close: 0.6, gap: 0.1, unknown: 0 };

/** Has the person told us enough about themselves for a comparison to mean anything? */
export function hasProfileData(p: Profile): boolean {
  return (
    p.ageBand !== undefined ||
    p.education.length > 0 ||
    p.experience.length > 0 ||
    p.skills.length > 0 ||
    p.jobTitles.length > 0 ||
    p.highestLevel > 0 ||
    p.yearsExperience !== undefined ||
    p.achievements.length > 0
  );
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const yearsText = (n: number): string => plural(n, 'year');

function levelCheck(
  have: Level,
  required: number | null,
  req: Requirements | null | undefined,
  studyingTo: Level | null,
): FitCheck {
  const base = { id: 'level' as const, label: 'Qualifications', hard: true };
  if (required === null) {
    return req?.stated
      ? {
          ...base,
          status: 'meets',
          detail: 'The advert does not ask for any particular qualification.',
        }
      : {
          ...base,
          status: 'unknown',
          detail: 'The advert does not say what qualifications it needs.',
        };
  }
  if (required === 0) {
    return { ...base, status: 'meets', detail: 'No qualifications needed to apply.' };
  }
  const asks = levelLabel(required);
  if (have >= required) {
    return {
      ...base,
      status: 'meets',
      detail: `It asks for around ${asks}, and you have ${levelLabel(have)}.`,
    };
  }
  const equivalent = req?.equivalentAccepted ?? false;
  if (equivalent) {
    return {
      ...base,
      status: 'close',
      detail: `It asks for around ${asks}, but accepts equivalents. You have ${levelLabel(have)}, so describe any similar experience or training.`,
    };
  }
  if (have === required - 1 || (studyingTo !== null && studyingTo >= required)) {
    const towards =
      studyingTo !== null && studyingTo >= required
        ? ' You are working towards it, which employers often accept.'
        : '';
    return {
      ...base,
      status: 'close',
      detail: `It asks for around ${asks}; you have ${levelLabel(have)}.${towards} It is worth checking whether they accept something close.`,
    };
  }
  return {
    ...base,
    status: 'gap',
    detail: `It asks for around ${asks}; you have ${levelLabel(have)}. A course or an apprenticeship could get you there.`,
  };
}

function experienceCheck(
  haveYears: number,
  listing: FitListing,
  req: Requirements | null | undefined,
): FitCheck {
  const base = { id: 'experience' as const, label: 'Experience', hard: true };
  const required = listing.experienceRequired ?? req?.experience.required ?? null;
  if (required === false) {
    return { ...base, status: 'meets', detail: 'No previous experience needed.' };
  }
  if (required === null) {
    return {
      ...base,
      status: 'unknown',
      detail: 'The advert does not say how much experience it wants.',
    };
  }
  const stated = req?.experience.years ?? null;
  const implied =
    stated === null && req?.experience.basis === 'title' ? IMPLIED_SENIOR_YEARS : null;
  const need = stated ?? implied;
  const because =
    stated !== null
      ? `It asks for ${yearsText(stated)} of experience.`
      : implied !== null
        ? 'It is a senior role, and the advert does not say how much experience it wants. Roles like this usually expect several years.'
        : 'It asks for experience, without saying how much.';
  if (need === null) {
    if (haveYears >= 1) {
      return {
        ...base,
        status: 'meets',
        detail: `${because} You have about ${yearsText(haveYears)}.`,
      };
    }
    if (haveYears > 0) {
      return {
        ...base,
        status: 'close',
        detail: `${because} You have a little, and part-time work and volunteering count.`,
      };
    }
    return {
      ...base,
      status: 'gap',
      detail: `${because} You have not added any yet. Part-time work, volunteering and projects all count, so add them to your profile.`,
    };
  }
  if (haveYears >= need) {
    return {
      ...base,
      status: 'meets',
      detail: `${because} You have about ${yearsText(haveYears)}.`,
    };
  }
  if (haveYears >= need * CLOSE_SHARE) {
    return {
      ...base,
      status: 'close',
      detail: `${because} You have about ${yearsText(haveYears)}, which is close. Many people apply when they meet most of a list.`,
    };
  }
  return {
    ...base,
    status: 'gap',
    detail:
      haveYears > 0
        ? `${because} You have about ${yearsText(haveYears)}, so this is a stretch for now. A step towards it would help.`
        : `${because} You have not added any yet. This is a stretch for now, and an entry-level role in the same area would be a good first step.`,
  };
}

function ageCheck(
  band: AgeBand | undefined,
  minAge: number | null,
  maxAge: number | null,
): FitCheck | null {
  if (!band || (minAge === null && maxAge === null)) return null;
  const base = { id: 'age' as const, label: 'Age', hard: true };
  const [lo, hi] = BAND_RANGE[band];
  if (minAge !== null && hi < minAge) {
    return {
      ...base,
      status: 'gap',
      detail: `You need to be ${minAge} or over for this one. Look for ones open at ${lo}.`,
    };
  }
  if (minAge !== null && lo < minAge) {
    return {
      ...base,
      status: 'close',
      detail: `You need to be ${minAge} or over, so it depends on your exact age.`,
    };
  }
  if (maxAge !== null && lo > maxAge) {
    return { ...base, status: 'gap', detail: `This one is for people aged ${maxAge} or under.` };
  }
  if (maxAge !== null && hi > maxAge) {
    return {
      ...base,
      status: 'close',
      detail: `This one is for people aged ${maxAge} or under, so it depends on your exact age.`,
    };
  }
  return { ...base, status: 'meets', detail: 'Your age fits what the advert asks.' };
}

function skillsCheck(profile: Profile, listing: FitListing): FitCheck | null {
  const wanted = listing.skills;
  if (wanted.length < 3 || profile.skills.length === 0) return null;
  const mine = new Set(profile.skills.map((s) => s.id));
  const have = wanted.filter((s) => mine.has(s.id));
  const share = have.length / wanted.length;
  const names = have
    .slice(0, 3)
    .map((s) => s.label.toLowerCase())
    .join(', ');
  const base = { id: 'skills' as const, label: 'Skills', hard: false };
  if (share >= 0.5) {
    return {
      ...base,
      status: 'meets',
      detail: `You already have ${have.length} of the ${wanted.length} skills it mentions (${names}).`,
    };
  }
  if (share >= 0.2) {
    return {
      ...base,
      status: 'close',
      detail: `You have some of the skills it mentions (${names}). Show where you have used them.`,
    };
  }
  return {
    ...base,
    status: 'gap',
    detail: `It mentions skills you have not listed yet. Add any you have used, even outside work, or pick up the ones you want.`,
  };
}

function licenceCheck(profile: Profile, req: Requirements | null | undefined): FitCheck | null {
  const asks = req?.items.some(
    (i) => i.kind === 'check' && i.essential && /driving licen[cs]e/i.test(i.text),
  );
  if (!asks) return null;
  const base = { id: 'licence' as const, label: 'Driving licence', hard: true };
  if (profile.drivingLicence === true) {
    return { ...base, status: 'meets', detail: 'It asks for a driving licence, and you have one.' };
  }
  if (profile.drivingLicence === false) {
    return {
      ...base,
      status: 'gap',
      detail:
        'It asks for a driving licence. If you are learning, say so: some employers will wait.',
    };
  }
  return null;
}

const HEADLINE: Readonly<Record<Exclude<FitLight, 'unknown'>, string>> = {
  green: 'Good fit: you meet what this advert asks for.',
  amber: 'Possible fit: you are close, with a gap or two worth a look.',
  red: 'A stretch for now. Here is what is missing, and how to close the gap.',
};

/** The studying-towards level: the highest level among qualifications they are currently doing. */
function studyingTowards(profile: Profile): Level | null {
  let best: Level | null = null;
  for (const e of profile.education) {
    if (e.status !== 'studying') continue;
    const level = educationLevel(e);
    if (level !== null && (best === null || level > best)) best = level;
  }
  return best;
}

export function assessFit(profile: Profile, listing: FitListing, now: Date = new Date()): Fit {
  if (!hasProfileData(profile)) {
    return {
      light: 'unknown',
      score: null,
      headline: 'Add what you have done to see how well you fit this one.',
      checks: [],
      reason: 'no-profile',
    };
  }
  const me = effectiveProfile(profile, now);
  const req = listing.requirements ?? null;
  const requiredLevel = listing.minEntryLevel ?? req?.minLevel ?? null;
  const minAge = listing.minAge ?? req?.minAge ?? null;

  const checks: FitCheck[] = [
    levelCheck(me.highestLevel as Level, requiredLevel, req, studyingTowards(profile)),
    experienceCheck(me.yearsExperience ?? 0, listing, req),
  ];
  for (const extra of [
    ageCheck(me.ageBand, minAge, listing.maxAge),
    skillsCheck(me, listing),
    licenceCheck(me, req),
  ]) {
    if (extra) checks.push(extra);
  }

  const known = checks.filter((c) => c.status !== 'unknown');
  if (known.length === 0) {
    return {
      light: 'unknown',
      score: null,
      headline:
        'This advert does not say what it needs, so we cannot compare. Read it closely before you apply.',
      checks,
      reason: 'no-requirements',
    };
  }

  const weight = known.reduce((n, c) => n + WEIGHT[c.id], 0);
  const score = Math.round(
    (known.reduce((n, c) => n + WEIGHT[c.id] * VALUE[c.status], 0) / weight) * 100,
  );

  const hardGap = known.some((c) => c.hard && c.status === 'gap');
  const hardClose = known.some((c) => c.hard && c.status === 'close');
  const softShortfall = known.some((c) => !c.hard && c.status !== 'meets');
  let light: Exclude<FitLight, 'unknown'>;
  if (hardGap || score < 40) light = 'red';
  else if (hardClose || softShortfall) light = 'amber';
  else light = 'green';

  return { light, score, headline: HEADLINE[light], checks, reason: null };
}

export const FIT_LABEL: Readonly<Record<FitLight, string>> = {
  green: 'Good fit',
  amber: 'Possible fit',
  red: 'A stretch',
  unknown: 'Not sure yet',
};
