import { createRoute, z } from '@hono/zod-openapi';
import { type CatalogueStats, catalogueStats } from '@unneet/db';
import { json, newRouter } from '../lib/openapi';
import type { Deps } from '../types';

const Count = z.object({ value: z.string(), count: z.number().int() });

const StatsSchema = z.object({
  open: z.number().int().describe('Opportunities you can act on right now.'),
  locatable: z.number().int().describe('Of those, how many can be found by distance.'),
  byPillar: z.array(Count),
  byType: z.array(Count),
  bySector: z.array(Count),
  byRegion: z.array(Count),
  sources: z.array(z.object({ name: z.string(), open: z.number().int(), isSample: z.boolean() })),
  /** True when any open listing is labelled sample/demo data, so the website can say so. */
  sampleData: z.boolean(),
  generatedAt: z.string(),
});

const TTL_MS = 5 * 60 * 1000;

export function statsRoutes(deps: Deps) {
  const app = newRouter();
  let cached: { at: number; value: CatalogueStats } | null = null;

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stats',
      tags: ['Reference'],
      summary: 'What is in the catalogue',
      description:
        'Counts by kind, sector, region and source. Cached for five minutes. `sampleData` is true when any listing is labelled demo data.',
      responses: { 200: json(StatsSchema, 'Catalogue statistics.') },
    }),
    async (c) => {
      const now = deps.now();
      if (!cached || now.getTime() - cached.at > TTL_MS) {
        cached = { at: now.getTime(), value: await catalogueStats(deps.db, now) };
      }
      const s = cached.value;
      c.header('cache-control', 'public, max-age=300');
      return c.json(
        {
          open: s.open,
          locatable: s.locatable,
          byPillar: s.byPillar,
          byType: s.byType,
          bySector: s.bySector,
          byRegion: s.byRegion,
          sources: s.byProvider
            .filter((p) => p.open > 0)
            .map((p) => ({ name: p.name, open: p.open, isSample: p.isSample })),
          sampleData: s.byProvider.some((p) => p.isSample && p.open > 0),
          generatedAt: new Date(cached.at).toISOString(),
        },
        200,
      );
    },
  );

  return app;
}
