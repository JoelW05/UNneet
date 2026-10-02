import type { Cost, Pay } from '../lib/money';
import type { OpportunityTag } from '../schemas/opportunity';
import type { WorkMode } from '../taxonomy/misc';
import type { OpportunityType } from '../taxonomy/opportunity-types';
import type { SectorSlug } from '../taxonomy/sectors';

/** The minimum an opportunity must expose to be scored. `OpportunityCard` satisfies this. */
export interface MatchCandidate {
  id: string;
  type: OpportunityType;
  sector: SectorSlug | null;
  level: number | null;
  minEntryLevel: number | null;
  skills: ReadonlyArray<{ id: string; label: string }>;
  pay: Pay | null;
  cost: Cost;
  location: { lat?: number | null; lon?: number | null; workMode: WorkMode; label: string };
  minAge: number | null;
  maxAge: number | null;
  postedAt: string | null;
  closesAt: string | null;
  tags: readonly OpportunityTag[];
  experienceRequired: boolean | null;
}

export const FEATURES = [
  'skills',
  'interest',
  'values',
  'level',
  'location',
  'budget',
  'goal',
  'freshness',
] as const;
export type FeatureKey = (typeof FEATURES)[number];

export type Weights = Readonly<Record<FeatureKey, number>>;

export type ReasonTone = 'positive' | 'neutral' | 'caution';

/** A human-readable explanation of one factor in a match. Always shown to the user. */
export interface Reason {
  feature: FeatureKey | 'explore' | 'eligibility';
  tone: ReasonTone;
  text: string;
}

export interface Eligibility {
  eligible: boolean;
  /** Why not, in plain English. */
  blockers: string[];
}

export interface Match<T extends MatchCandidate = MatchCandidate> {
  item: T;
  /** 0–100 "how well this fits what you've told us". NOT a probability of being hired. */
  score: number;
  /** Per-feature scores 0–1 (only features that had enough data). */
  parts: Partial<Record<FeatureKey, number>>;
  /** 0–1: share of the total weight that had real data behind it. */
  confidence: number;
  reasons: Reason[];
  eligibility: Eligibility;
  /** Asks for a bit more than the person has now. Worth a look, not a rejection. */
  stretch: boolean;
  /** Included deliberately to broaden horizons (outside the user's top sectors). */
  explore: boolean;
}

export interface MatchOptions {
  now?: Date;
  weights?: Partial<Record<FeatureKey, number>>;
  /** Max results returned. */
  limit?: number;
  /** Share of the result list reserved for "explore" picks outside the user's usual sectors. */
  exploreShare?: number;
  /** MMR lambda: 1 = pure relevance, lower = more diverse. */
  relevanceWeight?: number;
  /** Keep age/closed-ineligible items (flagged) instead of dropping them. */
  includeIneligible?: boolean;
}
