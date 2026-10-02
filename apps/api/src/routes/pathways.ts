import { createRoute, z } from '@hono/zod-openapi';
import { PATHWAYS, PATHWAYS_BY_SLUG } from '@unneet/content';
import { searchOpportunities } from '@unneet/db';
import { PathwaySchema, resolveDefaults, SearchQuerySchema } from '@unneet/domain';
import { notFound } from '../errors';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';
import type { Deps } from '../types';

const SummarySchema = z.object({
  slug: z.string(),
  sector: z.string(),
  title: z.string(),
  blurb: z.string(),
  forWho: z.string(),
  startingPoint: z.string(),
  steps: z.number().int(),
});

const DetailSchema = PathwaySchema.extend({
  /** Open listings right now for each step's search: "142 open today". Keyed by step id. */
  openNow: z.record(z.string(), z.number().int()),
});

const SlugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,80}$/) });

export function pathwayRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/pathways',
      tags: ['Pathways'],
      summary: 'Career pathways',
      description:
        'Curated routes into a career, from "no experience needed" to "established". Each step is a search, so it always resolves to live opportunities.',
      responses: { 200: json(z.object({ items: z.array(SummarySchema) }), 'All pathways.') },
    }),
    (c) => {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(
        {
          items: PATHWAYS.map((p) => ({
            slug: p.slug,
            sector: p.sector,
            title: p.title,
            blurb: p.blurb,
            forWho: p.forWho,
            startingPoint: p.startingPoint,
            steps: p.steps.length,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/pathways/{slug}',
      tags: ['Pathways'],
      summary: 'One pathway, with live counts for each step',
      request: { params: SlugParam },
      responses: {
        200: json(DetailSchema, 'The pathway.'),
        404: problem('No such pathway.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const pathway = PATHWAYS_BY_SLUG.get(c.req.valid('param').slug);
      if (!pathway) throw notFound('We could not find that pathway.');
      const now = deps.now();
      const counts = await Promise.all(
        pathway.steps.map(async (step) => {
          const query = resolveDefaults({
            ...SearchQuerySchema.parse(step.search),
            pageSize: 1,
          });
          const { total } = await searchOpportunities(deps.db, query, { facets: false, now });
          return [step.id, total] as const;
        }),
      );
      return c.json({ ...pathway, openNow: Object.fromEntries(counts) }, 200);
    },
  );

  return app;
}
