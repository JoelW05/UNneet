import { createRoute, z } from '@hono/zod-openapi';
import { searchOpportunities } from '@unneet/db';
import {
  AGE_BAND_REPRESENTATIVE,
  LOW_BUDGET_GBP,
  type OpportunityCard,
  OpportunityCardSchema,
  type Profile,
  ProfileSchema,
  profileCompleteness,
  type ResolvedSearch,
  rankMatches,
  rankSectors,
  resolveDefaults,
} from '@unneet/domain';
import { commonErrors, json, newRouter } from '../lib/openapi';
import type { Deps } from '../types';

const BodySchema = z.object({
  profile: ProfileSchema.describe(
    'What you have told us. Everything is optional: the more you add, the better the matches.',
  ),
  limit: z.number().int().min(1).max(50).default(20),
  includeIneligible: z
    .boolean()
    .default(false)
    .describe('Keep things you may not be eligible for (flagged) instead of hiding them.'),
});

const ReasonSchema = z.object({
  feature: z.string(),
  tone: z.enum(['positive', 'neutral', 'caution']),
  text: z.string(),
});

const MatchSchema = z.object({
  item: OpportunityCardSchema,
  /** 0–100: how well this fits what you told us. NOT a chance of being hired. */
  score: z.number(),
  parts: z.record(z.string(), z.number()),
  confidence: z.number(),
  reasons: z.array(ReasonSchema),
  eligibility: z.object({ eligible: z.boolean(), blockers: z.array(z.string()) }),
  stretch: z.boolean(),
  explore: z.boolean(),
});

const ResponseSchema = z.object({
  matches: z.array(MatchSchema),
  /** The sectors that fit best, with the signals behind each. */
  sectors: z.array(
    z.object({
      sector: z.string(),
      score: z.number(),
      signals: z.array(z.enum(['interest', 'chosen', 'values'])),
    }),
  ),
  considered: z.number().int(),
  completeness: z.number(),
});

const POOL_FOCUSED = 150;
const POOL_BROAD = 150;
const DEFAULT_RADIUS_MILES = 30;

/**
 * The pool of listings to score. Two cheap queries beat one: a pool aimed at the person's best
 * sectors (so good matches are not crowded out by sheer volume elsewhere), and a broad pool, so
 * the engine's deliberate "explore" picks outside their usual sectors have something to choose from.
 */
function poolQueries(profile: Profile): ResolvedSearch[] {
  const centre = profile.location
    ? { lat: profile.location.lat, lon: profile.location.lon, label: profile.location.label }
    : undefined;
  const base: Parameters<typeof resolveDefaults>[0] = {
    ...(profile.budget === 'free-only' ? { free: true } : {}),
    ...(profile.budget === 'low' ? { costMax: LOW_BUDGET_GBP } : {}),
    ...(profile.workModes?.length ? { workMode: [...profile.workModes] } : {}),
    ...(profile.ageBand ? { age: AGE_BAND_REPRESENTATIVE[profile.ageBand] } : {}),
    ...(centre ? { radius: profile.maxTravelMiles ?? DEFAULT_RADIUS_MILES } : {}),
  };
  const broad = {
    ...resolveDefaults(base, centre),
    pageSize: POOL_BROAD,
    sort: centre ? ('distance' as const) : ('newest' as const),
  };

  const hasSignal =
    profile.riasec !== undefined ||
    profile.sectorsInterested.length > 0 ||
    profile.values.length > 0;
  if (!hasSignal) return [broad];

  const top = rankSectors(profile)
    .slice(0, 4)
    .map((s) => s.sector);
  const focused = {
    ...resolveDefaults({ ...base, sector: top }, centre),
    pageSize: POOL_FOCUSED,
    sort: broad.sort,
  };
  return [focused, broad];
}

export function matchRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/match',
      tags: ['Matching'],
      summary: 'Personalised, explainable matches',
      description:
        'Send what you know about yourself and get opportunities ranked for you, each with plain-English reasons, whether you are eligible, and whether it is a stretch. Stateless: your profile is used for this request and not stored. A few picks outside your usual sectors are included on purpose (`explore`), so results do not lock you into a stereotype.',
      request: {
        body: { content: { 'application/json': { schema: BodySchema } }, required: true },
      },
      responses: { 200: json(ResponseSchema, 'Ranked matches.'), ...commonErrors },
    }),
    async (c) => {
      const { profile, limit, includeIneligible } = c.req.valid('json');
      const now = deps.now();

      const pools = await Promise.all(
        poolQueries(profile).map((q) => searchOpportunities(deps.db, q, { facets: false, now })),
      );
      const byId = new Map<string, OpportunityCard>();
      for (const pool of pools) for (const item of pool.items) byId.set(item.id, item);
      const candidates = [...byId.values()];

      const matches = rankMatches(profile, candidates, { now, limit, includeIneligible });
      c.header('cache-control', 'no-store');
      return c.json(
        {
          matches,
          sectors: rankSectors(profile).slice(0, 5),
          considered: candidates.length,
          completeness: profileCompleteness(profile),
        },
        200,
      );
    },
  );

  return app;
}
