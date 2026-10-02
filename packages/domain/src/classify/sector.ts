import { SECTORS, type SectorSlug } from '../taxonomy/sectors';

export interface SectorGuess {
  sector: SectorSlug | null;
  /** Raw keyword score. Title hits count 3, description hits 1 (max 3 per keyword). */
  score: number;
  runnerUp: SectorSlug | null;
}

const MIN_SCORE = 3;
const TITLE_WEIGHT = 3;

// Precompile: keyword -> word-start regex. Keywords are stems ("agricultur") so no trailing \b.
const COMPILED = SECTORS.map((sector) => ({
  slug: sector.slug,
  patterns: sector.keywords.map(
    (kw) => new RegExp(`(?<![a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
  ),
}));

function countHits(re: RegExp, text: string, cap: number): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null && n < cap) n++;
  return n;
}

/**
 * Keyword classifier mapping free text to one of the 15 sectors. Used where a provider gives no
 * usable category (e.g. Reed) or its own taxonomy needs a fallback. It abstains (returns null)
 * rather than guessing when evidence is weak. Pure & deterministic; ties resolve to taxonomy order.
 */
export function classifySector(title: string, description = ''): SectorGuess {
  const t = title.toLowerCase();
  const d = description.toLowerCase().slice(0, 4000);
  const scored = COMPILED.map(({ slug, patterns }) => {
    let score = 0;
    for (const re of patterns) {
      score += TITLE_WEIGHT * countHits(re, t, 1);
      score += countHits(re, d, 3);
    }
    return { slug, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < MIN_SCORE)
    return { sector: null, score: best?.score ?? 0, runnerUp: null };
  return {
    sector: best.slug,
    score: best.score,
    runnerUp: second && second.score >= MIN_SCORE ? second.slug : null,
  };
}
