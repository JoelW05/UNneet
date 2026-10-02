import type { Profile } from '../schemas/profile';
import { getSector, type SectorSlug } from '../taxonomy/sectors';
import {
  DEFAULT_EXPLORE_SHARE,
  DEFAULT_LIMIT,
  DEFAULT_RELEVANCE_WEIGHT,
  DEFAULT_WEIGHTS,
} from './config';
import {
  budgetFeature,
  eligibility,
  type FeatureResult,
  freshnessFeature,
  goalFeature,
  interestFeature,
  levelFeature,
  locationFeature,
  skillsFeature,
  valuesFeature,
} from './features';
import { rankSectors } from './sectors';
import {
  FEATURES,
  type FeatureKey,
  type Match,
  type MatchCandidate,
  type MatchOptions,
  type Reason,
  type Weights,
} from './types';

/** Sector + type similarity used by the diversifier. Same sector is "more alike" than same type. */
function similarity(a: MatchCandidate, b: MatchCandidate): number {
  return (a.sector !== null && a.sector === b.sector ? 0.6 : 0) + (a.type === b.type ? 0.4 : 0);
}

/**
 * Score one candidate. Features with no data are dropped and the remaining weights renormalised,
 * so sparse profiles still give meaningful, comparable scores.
 */
export function scoreCandidate<T extends MatchCandidate>(
  profile: Profile,
  candidate: T,
  now: Date,
  weights: Weights = DEFAULT_WEIGHTS,
): Match<T> {
  const results: Record<FeatureKey, FeatureResult | null> = {
    skills: skillsFeature(profile, candidate),
    interest: interestFeature(profile, candidate),
    values: valuesFeature(profile, candidate),
    level: levelFeature(profile, candidate),
    location: locationFeature(profile, candidate),
    budget: budgetFeature(profile, candidate),
    goal: goalFeature(profile, candidate),
    freshness: freshnessFeature(profile, candidate, now),
  };

  let weightSum = 0;
  let weighted = 0;
  const parts: Partial<Record<FeatureKey, number>> = {};
  const scored: Array<{ key: FeatureKey; contribution: number; reason?: Reason }> = [];

  for (const key of FEATURES) {
    const result = results[key];
    if (!result) continue;
    const weight = weights[key];
    weightSum += weight;
    weighted += weight * result.score;
    parts[key] = Math.round(result.score * 1000) / 1000;
    scored.push({
      key,
      contribution: weight * result.score,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  }

  const totalWeight = FEATURES.reduce((sum, key) => sum + weights[key], 0);
  const score = weightSum === 0 ? 0 : Math.round((weighted / weightSum) * 100);

  // Positive reasons first (biggest contributors first), then cautions, then neutral notes.
  const toneOrder = { positive: 0, caution: 1, neutral: 2 } as const;
  const reasons = scored
    .filter((s): s is typeof s & { reason: Reason } => s.reason !== undefined)
    .sort(
      (a, b) =>
        toneOrder[a.reason.tone] - toneOrder[b.reason.tone] || b.contribution - a.contribution,
    )
    .map((s) => s.reason);

  const elig = eligibility(profile, candidate, now);
  const stretch = results.level?.reason?.tone === 'caution' && (results.level.score ?? 0) >= 0.5;

  return {
    item: candidate,
    score,
    parts,
    confidence: totalWeight === 0 ? 0 : Math.round((weightSum / totalWeight) * 100) / 100,
    reasons,
    eligibility: elig,
    stretch,
    explore: false,
  };
}

/** Maximal Marginal Relevance: pick items that are relevant AND different from what is already picked. */
function diversify<T extends MatchCandidate>(
  sorted: readonly Match<T>[],
  count: number,
  relevanceWeight: number,
): Match<T>[] {
  const pool = sorted.slice(0, 250);
  const picked: Match<T>[] = [];
  const remaining = [...pool];
  while (picked.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i] as Match<T>;
      const maxSim = picked.reduce((acc, p) => Math.max(acc, similarity(m.item, p.item)), 0);
      const value = relevanceWeight * (m.score / 100) - (1 - relevanceWeight) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    picked.push(remaining.splice(bestIndex, 1)[0] as Match<T>);
  }
  return picked;
}

/**
 * Rank candidates for a person. Steps: score → drop ineligible → diversify (MMR) → add a few
 * deliberately-different "explore" picks so results don't lock people into a stereotype.
 */
export function rankMatches<T extends MatchCandidate>(
  profile: Profile,
  candidates: readonly T[],
  options: MatchOptions = {},
): Match<T>[] {
  const now = options.now ?? new Date();
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const limit = options.limit ?? DEFAULT_LIMIT;
  const exploreShare = options.exploreShare ?? DEFAULT_EXPLORE_SHARE;
  const lambda = options.relevanceWeight ?? DEFAULT_RELEVANCE_WEIGHT;

  const scored = candidates
    .map((c) => scoreCandidate(profile, c, now, weights))
    .filter((m) => options.includeIneligible || m.eligibility.eligible)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  const exploreCount = limit >= 6 ? Math.round(limit * exploreShare) : 0;
  const mainCount = Math.max(0, limit - exploreCount);
  const main = diversify(scored, mainCount, lambda);

  if (exploreCount === 0) return main;

  // "Explore" = good-enough matches in sectors the person hasn't leaned towards.
  const familiar = new Set<SectorSlug>(profile.sectorsInterested);
  for (const s of rankSectors(profile).slice(0, 3)) familiar.add(s.sector);
  for (const m of main.slice(0, 8)) if (m.item.sector) familiar.add(m.item.sector);

  const chosen = new Set(main.map((m) => m.item.id));
  const floor = (main[0]?.score ?? 0) * 0.6;
  const explore: Match<T>[] = [];
  const seenSectors = new Set<SectorSlug>();
  for (const m of scored) {
    if (explore.length >= exploreCount) break;
    const sector = m.item.sector;
    if (chosen.has(m.item.id) || !sector || familiar.has(sector) || seenSectors.has(sector))
      continue;
    if (m.score < floor) continue;
    seenSectors.add(sector);
    explore.push({
      ...m,
      explore: true,
      reasons: [
        {
          feature: 'explore',
          tone: 'neutral',
          text: `Something different to try: ${getSector(sector).name.toLowerCase()}`,
        },
        ...m.reasons,
      ],
    });
  }
  return [...main, ...explore];
}
