import { createRoute, z } from '@hono/zod-openapi';
import { liveCountsByProvider } from '@unneet/db';
import { sql } from 'drizzle-orm';
import { json, newRouter, problem } from '../lib/openapi';
import type { Deps } from '../types';

const HealthSchema = z.object({ status: z.literal('ok') });
const ReadySchema = z.object({
  status: z.enum(['ready', 'degraded']),
  database: z.enum(['ok', 'down']),
  /** Live listings per provider: a quick staleness signal for operators. */
  liveByProvider: z.array(z.object({ providerId: z.string(), live: z.number().int() })),
});

export function healthRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      tags: ['Operations'],
      summary: 'Liveness probe',
      description: 'Returns 200 while the process is up. Does not touch the database.',
      responses: { 200: json(HealthSchema, 'The process is alive.') },
    }),
    (c) => c.json({ status: 'ok' as const }, 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/ready',
      tags: ['Operations'],
      summary: 'Readiness probe',
      description: 'Checks the database. Use this for load-balancer health checks.',
      responses: {
        200: json(ReadySchema, 'Ready to serve traffic.'),
        503: problem('The database is unreachable.'),
      },
    }),
    async (c) => {
      try {
        await deps.db.execute(sql`select 1`);
        const liveByProvider = await liveCountsByProvider(deps.db);
        return c.json({ status: 'ready' as const, database: 'ok' as const, liveByProvider }, 200);
      } catch (error) {
        deps.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'readiness check failed',
        );
        return c.json(
          {
            type: 'https://httpstatuses.io/503',
            title: 'Service unavailable',
            status: 503,
            detail: 'The database is not reachable.',
          },
          503,
        );
      }
    },
  );

  return app;
}
