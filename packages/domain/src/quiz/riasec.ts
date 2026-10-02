import { z } from 'zod';
import { shapeSimilarity } from '../lib/math';
import {
  RIASEC_TYPES,
  type RiasecType,
  type RiasecVector,
  SECTORS,
  type SectorSlug,
} from '../taxonomy/sectors';

/**
 * Interest quiz based on the O*NET Mini Interest Profiler (Rounds et al., 2016; USDOL/ETA,
 * licensed CC BY 4.0). 30 items, 5 per Holland type, each rated 0 (strongly dislike) to
 * 4 (strongly like); a type's score is the sum of its five items, range 0–20.
 * https://www.onetcenter.org/dl_files/Mini-IP.pdf
 */
export const LIKERT_VALUES = [0, 1, 2, 3, 4] as const;
export const LikertSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type Likert = z.infer<typeof LikertSchema>;

export const LIKERT_LABEL: Readonly<Record<Likert, string>> = {
  0: 'Strongly dislike',
  1: 'Dislike',
  2: 'Not sure',
  3: 'Like',
  4: 'Strongly like',
};

export interface RiasecItem {
  id: string;
  text: string;
  type: RiasecType;
}

export const RIASEC_INFO: Readonly<
  Record<
    RiasecType,
    { name: string; nickname: string; description: string; likes: readonly string[] }
  >
> = {
  R: {
    name: 'Realistic',
    nickname: 'The Doer',
    description: 'You like practical, hands-on work with tools, machines, animals or the outdoors.',
    likes: ['Building and fixing things', 'Working outside', 'Using tools and equipment'],
  },
  I: {
    name: 'Investigative',
    nickname: 'The Thinker',
    description: 'You like working things out, finding answers and understanding how things work.',
    likes: ['Solving problems', 'Science and technology', 'Researching and analysing'],
  },
  A: {
    name: 'Artistic',
    nickname: 'The Creator',
    description: 'You like making things and coming up with original ideas.',
    likes: ['Design, writing, music or film', 'Expressing ideas', 'Work with no fixed rules'],
  },
  S: {
    name: 'Social',
    nickname: 'The Helper',
    description: 'You like helping, teaching, caring for and working with people.',
    likes: ['Supporting others', 'Teaching and explaining', 'Working as part of a team'],
  },
  E: {
    name: 'Enterprising',
    nickname: 'The Persuader',
    description: 'You like leading, persuading, selling and making things happen.',
    likes: ['Taking charge', 'Selling and promoting', 'Starting new projects'],
  },
  C: {
    name: 'Conventional',
    nickname: 'The Organiser',
    description: 'You like order, detail and clear systems: keeping things accurate and on track.',
    likes: ['Working with data and records', 'Following clear processes', 'Being organised'],
  },
};

export interface RiasecResult {
  /** Raw scores per type, 0–20 (scaled up if some items were skipped). */
  raw: RiasecVector;
  /** Raw / 20, 0–1. This is what the profile stores. */
  normalised: RiasecVector;
  /** Types ordered high → low (ties keep R-I-A-S-E-C order, so results are deterministic). */
  ranking: RiasecType[];
  /** Three-letter Holland code, e.g. "SIA". */
  code: string;
  /** How many items were answered out of the total. */
  answered: number;
  total: number;
  /** Gap between highest and lowest score ÷ 20. Low = "interested in everything / nothing". */
  differentiation: number;
  /** False when fewer than 3 items per type were answered, i.e. too thin to interpret. */
  reliable: boolean;
}

const MAX_PER_TYPE = 20;

export function scoreRiasec(
  items: readonly RiasecItem[],
  answers: Readonly<Record<string, Likert | undefined>>,
): RiasecResult {
  const sums: RiasecVector = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  const counts: Record<RiasecType, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  const totals: Record<RiasecType, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  let answered = 0;

  for (const item of items) {
    totals[item.type]++;
    const answer = answers[item.id];
    if (answer === undefined) continue;
    sums[item.type] += answer;
    counts[item.type]++;
    answered++;
  }

  // Scale to the 0–20 range using only answered items, so skipping an item doesn't penalise
  // its type. With all 5 items answered this equals the plain sum used by O*NET.
  const raw: RiasecVector = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  for (const type of RIASEC_TYPES) {
    raw[type] = counts[type] > 0 ? (sums[type] / (counts[type] * 4)) * MAX_PER_TYPE : 0;
  }

  const normalised = Object.fromEntries(
    RIASEC_TYPES.map((t) => [t, Math.round((raw[t] / MAX_PER_TYPE) * 1000) / 1000]),
  ) as RiasecVector;

  const ranking = [...RIASEC_TYPES].sort(
    (a, b) => raw[b] - raw[a] || RIASEC_TYPES.indexOf(a) - RIASEC_TYPES.indexOf(b),
  );
  const scores = RIASEC_TYPES.map((t) => raw[t]);
  const differentiation = (Math.max(...scores) - Math.min(...scores)) / MAX_PER_TYPE;
  const reliable = RIASEC_TYPES.every((t) => counts[t] >= Math.min(3, totals[t]));

  return {
    raw,
    normalised,
    ranking,
    code: ranking.slice(0, 3).join(''),
    answered,
    total: items.length,
    differentiation: Math.round(differentiation * 1000) / 1000,
    reliable,
  };
}

export interface SectorFit {
  sector: SectorSlug;
  /** 0–1, 0.5 = neutral. */
  fit: number;
}

/** Rank all sectors by how well their interest profile matches the person's. */
export function rankSectorsByInterest(riasec: RiasecVector): SectorFit[] {
  const user = RIASEC_TYPES.map((t) => riasec[t]);
  return SECTORS.map((s) => ({
    sector: s.slug,
    fit:
      Math.round(
        shapeSimilarity(
          user,
          RIASEC_TYPES.map((t) => s.riasec[t]),
        ) * 1000,
      ) / 1000,
  })).sort((a, b) => b.fit - a.fit || a.sector.localeCompare(b.sector));
}
