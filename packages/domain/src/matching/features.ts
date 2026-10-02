import { haversineMiles } from '../lib/geo';
import { clamp, distanceDecay, shapeSimilarity } from '../lib/math';
import { annualRange, formatCost, formatGBP } from '../lib/money';
import type { Profile } from '../schemas/profile';
import { LOW_BUDGET_GBP } from '../schemas/profile';
import { levelLabel } from '../taxonomy/levels';
import type { Goal } from '../taxonomy/misc';
import { getSector, RIASEC_TYPES, type RiasecType } from '../taxonomy/sectors';
import type { Stage } from '../taxonomy/stages';
import { VALUE_AFFINITY, WORK_VALUES } from '../taxonomy/values';
import { DEFAULT_MAX_TRAVEL_MILES, GOAL_REASON, GOAL_TYPE_AFFINITY } from './config';
import type { Eligibility, MatchCandidate, Reason } from './types';

/** A scored feature: 0–1 plus an optional explanation. `null` = no data, skip the feature. */
export interface FeatureResult {
  score: number;
  reason?: Reason;
}

export const INTEREST_FLOOR = 0.25;

const SKILL_LEVEL_WEIGHT = { 1: 0.6, 2: 0.85, 3: 1 } as const;

const RIASEC_PHRASE: Readonly<Record<RiasecType, string>> = {
  R: 'practical, hands-on work',
  I: 'working things out and solving problems',
  A: 'creative work',
  S: 'helping and working with people',
  E: 'leading, selling and persuading',
  C: 'organised, detail-focused work',
};

const STAGE_DEFAULT_GOAL: Readonly<Record<Stage, Goal>> = {
  'year-11': 'explore',
  'year-12': 'explore',
  'year-13': 'earn-and-learn',
  college: 'earn-and-learn',
  apprentice: 'experience',
  'uni-year-1': 'experience',
  'uni-year-2': 'experience',
  'uni-final-year': 'earn-now',
  graduate: 'earn-now',
  working: 'earn-and-learn',
  'between-things': 'explore',
};

/** The goal to use: what they said, else a sensible default for their stage. */
export function effectiveGoal(profile: Profile): Goal | undefined {
  return profile.goal ?? (profile.stage ? STAGE_DEFAULT_GOAL[profile.stage] : undefined);
}

export function skillsFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  if (profile.skills.length === 0 || c.skills.length === 0) return null;
  const mine = new Map(profile.skills.map((s) => [s.id, s.level]));
  const considered = c.skills.slice(0, 5);
  const denominator = considered.length;
  let weighted = 0;
  const matchedLabels: string[] = [];
  for (const skill of c.skills) {
    const level = mine.get(skill.id);
    if (level === undefined) continue;
    matchedLabels.push(skill.label);
    if (considered.includes(skill)) weighted += SKILL_LEVEL_WEIGHT[level];
  }
  const score = clamp(weighted / denominator);
  if (matchedLabels.length === 0) return { score };
  const shown = matchedLabels.slice(0, 3).join(', ');
  const more = matchedLabels.length > 3 ? ` and ${matchedLabels.length - 3} more` : '';
  return {
    score,
    reason: {
      feature: 'skills',
      tone: 'positive',
      text: `Uses ${matchedLabels.length === 1 ? 'a skill' : `${matchedLabels.length} skills`} you have: ${shown}${more}`,
    },
  };
}

export function interestFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  if (!c.sector) return null;
  const explicit = profile.sectorsInterested.includes(c.sector);
  if (!profile.riasec && profile.sectorsInterested.length === 0) return null;
  const sector = getSector(c.sector);

  let score: number;
  let bestType: RiasecType | undefined;
  if (profile.riasec) {
    const riasec = profile.riasec;
    const user = RIASEC_TYPES.map((t) => riasec[t]);
    const prior = RIASEC_TYPES.map((t) => sector.riasec[t]);
    score = INTEREST_FLOOR + (1 - INTEREST_FLOOR) * shapeSimilarity(user, prior);
    bestType = [...RIASEC_TYPES].sort(
      (a, b) => riasec[b] * sector.riasec[b] - riasec[a] * sector.riasec[a],
    )[0];
  } else {
    score = explicit ? 0.9 : 0.35;
  }
  if (explicit) score = Math.max(score, 0.9);

  if (explicit) {
    return {
      score,
      reason: {
        feature: 'interest',
        tone: 'positive',
        text: `You said you’re interested in ${sector.name.toLowerCase()}`,
      },
    };
  }
  if (score >= 0.7 && bestType) {
    return {
      score,
      reason: {
        feature: 'interest',
        tone: 'positive',
        text: `Fits your interest in ${RIASEC_PHRASE[bestType]}`,
      },
    };
  }
  return { score };
}

function payScore(c: MatchCandidate): number | undefined {
  const { max, min } = annualRange(c.pay);
  const top = max ?? min;
  if (top === null || top === undefined) return undefined;
  // £20k → 0, £40k → 1
  return clamp((top - 20_000) / 20_000);
}

function flexibilityScore(c: MatchCandidate): number {
  const mode = c.location.workMode;
  if (mode === 'remote') return 1;
  if (mode === 'hybrid') return 0.8;
  if (c.tags.includes('flexible') || c.tags.includes('part-time')) return 0.8;
  return 0.2;
}

export function valuesFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  if (profile.values.length === 0) return null;
  let total = 0;
  let best: { label: string; score: number } | undefined;
  for (const key of profile.values) {
    const affinity = VALUE_AFFINITY[key];
    const signals: number[] = [];
    if (c.sector && affinity.sectors?.[c.sector] !== undefined)
      signals.push(affinity.sectors[c.sector] as number);
    if (affinity.types?.[c.type] !== undefined) signals.push(affinity.types[c.type] as number);
    if (affinity.highPay) {
      const p = payScore(c);
      if (p !== undefined) signals.push(p);
    }
    if (affinity.flexibleWork) signals.push(flexibilityScore(c));
    const score = signals.length ? Math.max(...signals) : 0.3;
    total += score;
    const label = WORK_VALUES.find((v) => v.key === key)?.label ?? key;
    if (!best || score > best.score) best = { label, score };
  }
  const score = total / profile.values.length;
  if (best && best.score >= 0.7) {
    return {
      score,
      reason: {
        feature: 'values',
        tone: 'positive',
        text: `Fits what matters to you: ${best.label.toLowerCase()}`,
      },
    };
  }
  return { score };
}

export function levelFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  const need = c.minEntryLevel;
  const have = profile.highestLevel;
  if (need === null) return { score: 0.7 };

  let score: number;
  let reason: Reason | undefined;
  if (need === 0) {
    score = 1;
    reason = { feature: 'level', tone: 'positive', text: 'No qualifications needed to start' };
  } else if (have >= need) {
    score = 1;
    reason = {
      feature: 'level',
      tone: 'positive',
      text: `You meet the entry requirement (${levelLabel(need)})`,
    };
  } else if (need === have + 1) {
    score = 0.55;
    reason = {
      feature: 'level',
      tone: 'caution',
      text: `A stretch: asks for ${levelLabel(need)} and you have ${levelLabel(have)}. Worth a look`,
    };
  } else {
    score = 0.15;
    reason = {
      feature: 'level',
      tone: 'caution',
      text: `Asks for ${levelLabel(need)}, a few levels above where you are now`,
    };
  }

  const reference = c.level ?? need;
  if (have - reference >= 3 && score > 0.5) {
    score = 0.5;
    reason = {
      feature: 'level',
      tone: 'caution',
      text: 'May be below the level you’ve already reached',
    };
  }
  return { score, ...(reason ? { reason } : {}) };
}

export function locationFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  if (!profile.location) return null;
  const mode = c.location.workMode;
  if (mode === 'remote') {
    return {
      score: 0.9,
      reason: { feature: 'location', tone: 'positive', text: 'Can be done online or from home' },
    };
  }
  if (mode === 'nationwide') {
    return {
      score: 0.9,
      reason: { feature: 'location', tone: 'positive', text: 'Available anywhere in the UK' },
    };
  }
  const { lat, lon } = c.location;
  if (lat === null || lat === undefined || lon === null || lon === undefined) return { score: 0.5 };

  const miles = haversineMiles(
    { lat: profile.location.lat, lon: profile.location.lon },
    { lat, lon },
  );
  const limit = profile.maxTravelMiles ?? DEFAULT_MAX_TRAVEL_MILES;
  let score = distanceDecay(miles, limit);
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  if (miles > limit * 2) score *= 0.3;
  if (miles <= limit) {
    return {
      score,
      reason: {
        feature: 'location',
        tone: 'positive',
        text: `${rounded} miles from ${profile.location.label}`,
      },
    };
  }
  return {
    score,
    reason: {
      feature: 'location',
      tone: 'caution',
      text: `${rounded} miles away, further than your ${limit}-mile limit`,
    },
  };
}

export function budgetFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  const kind = c.cost.kind;
  // Jobs & apprenticeships don't cost the person anything, so "budget" doesn't apply.
  const earns = ['job', 'internship', 'apprenticeship', 'volunteering'].includes(c.type);
  if (kind === 'unknown' && earns) return null;
  if (kind === 'free' || kind === 'funded') {
    return {
      score: 1,
      reason: {
        feature: 'budget',
        tone: 'positive',
        text: kind === 'free' ? 'Free to you' : 'Free if you qualify for funding',
      },
    };
  }
  if (kind === 'unknown') return { score: profile.budget === 'free-only' ? 0.3 : 0.5 };

  const amount = c.cost.amount;
  if (profile.budget === 'free-only') {
    return {
      score: 0,
      reason: {
        feature: 'budget',
        tone: 'caution',
        text: `Costs ${formatCost(c.cost)}, and you’re looking for free options`,
      },
    };
  }
  if (profile.budget === 'low') {
    if (amount !== null && amount <= LOW_BUDGET_GBP) return { score: 0.7 };
    return {
      score: 0.1,
      reason: {
        feature: 'budget',
        tone: 'caution',
        text: `Costs ${amount === null ? 'a fee' : formatGBP(amount)}, above your budget`,
      },
    };
  }
  return { score: 0.75 };
}

export function goalFeature(profile: Profile, c: MatchCandidate): FeatureResult | null {
  const goal = effectiveGoal(profile);
  if (!goal) return null;
  const score = GOAL_TYPE_AFFINITY[goal][c.type];
  const text = GOAL_REASON[goal][c.type];
  return score >= 0.8 && text
    ? { score, reason: { feature: 'goal', tone: 'positive', text } }
    : { score };
}

const MS_PER_DAY = 86_400_000;

export function freshnessFeature(
  _profile: Profile,
  c: MatchCandidate,
  now: Date,
): FeatureResult | null {
  if (!c.postedAt) return null;
  const ageDays = Math.max(0, (now.getTime() - new Date(c.postedAt).getTime()) / MS_PER_DAY);
  const score = 1 - Math.min(1, ageDays / 60);
  if (c.closesAt) {
    const daysLeft = Math.ceil((new Date(c.closesAt).getTime() - now.getTime()) / MS_PER_DAY);
    if (daysLeft >= 0 && daysLeft <= 7) {
      return {
        score,
        reason: {
          feature: 'freshness',
          tone: 'neutral',
          text:
            daysLeft === 0
              ? 'Closes today'
              : `Closes in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`,
        },
      };
    }
  }
  return { score };
}

const AGE_BAND_BOUNDS = {
  '16-17': [16, 17],
  '18-21': [18, 21],
  '22-24': [22, 24],
  '25+': [25, 99],
} as const;

/** Hard gates. Anything here is *eligibility*, not preference, so it filters rather than down-ranks. */
export function eligibility(profile: Profile, c: MatchCandidate, now: Date): Eligibility {
  const blockers: string[] = [];
  if (profile.ageBand) {
    const [lo, hi] = AGE_BAND_BOUNDS[profile.ageBand];
    if (c.minAge !== null && c.minAge > hi) blockers.push(`For ages ${c.minAge}+`);
    if (c.maxAge !== null && c.maxAge < lo) blockers.push(`For ages up to ${c.maxAge}`);
  }
  if (c.closesAt && new Date(c.closesAt).getTime() < now.getTime())
    blockers.push('Applications have closed');
  return { eligible: blockers.length === 0, blockers };
}
