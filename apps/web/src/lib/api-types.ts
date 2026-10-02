import type { OpportunityCard, Pathway } from '@unneet/domain';

/**
 * Response shapes the website relies on that are not already domain types. They live here (not in
 * the server-only data layer) so client components can import them too. They mirror the Zod
 * schemas in apps/api; the generated client in @unneet/api-client is the contract of record.
 */
export interface Taxonomy {
  sectors: Array<{ slug: string; name: string; blurb: string; exampleRoles: string[] }>;
  levels: Array<{ value: number; label: string; haveLabel: string; examples: string[] }>;
  pillars: Array<{ slug: string; label: string; help: string }>;
  types: Array<{
    slug: string;
    pillar: string;
    label: string;
    plural: string;
    help: string;
    paid: boolean;
  }>;
  workModes: Array<{ slug: string; label: string }>;
  stages: Array<{ slug: string; label: string; hint: string; academic: boolean }>;
  goals: Array<{ slug: string; label: string; help: string }>;
  ageBands: string[];
  values: Array<{ key: string; label: string; description: string }>;
  sorts: Array<{ slug: string; label: string }>;
}

export interface Stats {
  open: number;
  locatable: number;
  sampleData: boolean;
  byPillar: Array<{ value: string; count: number }>;
  byType: Array<{ value: string; count: number }>;
  bySector: Array<{ value: string; count: number }>;
  byRegion: Array<{ value: string; count: number }>;
  sources: Array<{ name: string; open: number; isSample: boolean }>;
  generatedAt: string;
}

export interface PathwaySummary {
  slug: string;
  sector: string;
  title: string;
  blurb: string;
  forWho: string;
  startingPoint: string;
  steps: number;
}

export type PathwayDetail = Pathway & { openNow: Record<string, number> };

export interface ExternalResults {
  items: OpportunityCard[];
  attributions: Array<{ providerName: string; text: string; url: string | null }>;
  locationError: string | null;
}

export interface InterestsQuiz {
  id: string;
  title: string;
  intro: string;
  estimatedMinutes: number;
  scale: Array<{ value: number; label: string }>;
  items: Array<{ id: string; text: string }>;
  attribution: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export interface MatchResult {
  item: OpportunityCard;
  score: number;
  parts: Record<string, number>;
  confidence: number;
  reasons: Array<{ feature: string; tone: 'positive' | 'neutral' | 'caution'; text: string }>;
  eligibility: { eligible: boolean; blockers: string[] };
  stretch: boolean;
  explore: boolean;
}

export interface MatchResponse {
  matches: MatchResult[];
  sectors: Array<{
    sector: string;
    score: number;
    signals: Array<'interest' | 'chosen' | 'values'>;
  }>;
  considered: number;
  completeness: number;
}
