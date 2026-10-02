import { shapeSimilarity } from '../lib/math';
import type { Profile } from '../schemas/profile';
import { RIASEC_TYPES, SECTORS, type SectorSlug } from '../taxonomy/sectors';
import { VALUE_AFFINITY } from '../taxonomy/values';
import { INTEREST_FLOOR } from './features';

export interface SectorScore {
  sector: SectorSlug;
  /** 0–1. */
  score: number;
  /** Which signals contributed, for explanations. */
  signals: Array<'interest' | 'chosen' | 'values'>;
}

/**
 * Which sectors fit this person best, from interests (RIASEC), sectors they picked, and work
 * values. Used on the results page ("Areas that fit you") and by the explore logic. Returns all
 * 15 sectors ranked, never an empty list, so there's always a "show me everything" path.
 */
export function rankSectors(profile: Profile): SectorScore[] {
  const user = profile.riasec
    ? RIASEC_TYPES.map((t) => (profile.riasec as NonNullable<Profile['riasec']>)[t])
    : null;

  const scored = SECTORS.map((sector): SectorScore => {
    const signals: SectorScore['signals'] = [];
    let weight = 0;
    let total = 0;

    if (user) {
      const sim = shapeSimilarity(
        user,
        RIASEC_TYPES.map((t) => sector.riasec[t]),
      );
      total += 0.6 * (INTEREST_FLOOR + (1 - INTEREST_FLOOR) * sim);
      weight += 0.6;
      signals.push('interest');
    }
    if (profile.sectorsInterested.length > 0) {
      const chosen = profile.sectorsInterested.includes(sector.slug);
      total += 0.25 * (chosen ? 1 : 0.2);
      weight += 0.25;
      if (chosen) signals.push('chosen');
    }
    if (profile.values.length > 0) {
      const avg =
        profile.values.reduce(
          (sum, v) => sum + (VALUE_AFFINITY[v].sectors?.[sector.slug] ?? 0.3),
          0,
        ) / profile.values.length;
      total += 0.15 * avg;
      weight += 0.15;
      if (avg >= 0.7) signals.push('values');
    }
    return {
      sector: sector.slug,
      score: weight === 0 ? 0.5 : Math.round((total / weight) * 1000) / 1000,
      signals,
    };
  });

  return scored.sort((a, b) => b.score - a.score || a.sector.localeCompare(b.sector));
}
