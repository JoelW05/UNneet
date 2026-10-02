import { createRoute, z } from '@hono/zod-openapi';
import { latestRunPerProvider } from '@unneet/db';
import { ApiError } from '../errors';
import { json, newRouter, problem } from '../lib/openapi';
import type { Deps } from '../types';

const ParamSchema = z.object({ provider: z.string().regex(/^[a-z0-9-]{2,60}$/) });
const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100_000).optional(),
  dryRun: z.enum(['1', 'true']).optional(),
});

/**
 * Operator endpoints for a scheduler (cron, GitHub Actions). Protected by `X-Internal-Token`, with
 * no CORS, and absent entirely unless INTERNAL_TOKEN is set. Not part of the public contract.
 */
export function internalRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/internal/ingest/{provider}',
      tags: ['Operations'],
      summary: 'Start an ingest for one provider',
      description:
        'Returns 202 immediately and runs in the background. One run per provider at a time. Check progress with GET /internal/ingest/runs.',
      security: [{ InternalToken: [] }],
      request: { params: ParamSchema, query: QuerySchema },
      responses: {
        202: json(z.object({ status: z.literal('started') }), 'The ingest was started.'),
        404: problem('Unknown provider.'),
        409: problem('That provider is already being ingested.'),
        401: problem('Missing or invalid token.'),
      },
    }),
    (c) => {
      if (!deps.startIngest) throw new ApiError(404, 'Ingest is not available here.');
      const { provider } = c.req.valid('param');
      const { limit, dryRun } = c.req.valid('query');
      const result = deps.startIngest(provider, {
        ...(limit !== undefined ? { limit } : {}),
        ...(dryRun ? { dryRun: true } : {}),
      });
      if (result.status === 'unknown-provider')
        throw new ApiError(404, `Unknown provider "${provider}".`);
      if (result.status === 'already-running')
        throw new ApiError(409, 'That provider is already being ingested.');
      return c.json({ status: 'started' as const }, 202);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/internal/ingest/runs',
      tags: ['Operations'],
      summary: 'Recent ingest runs',
      security: [{ InternalToken: [] }],
      responses: {
        200: json(
          z.object({
            runs: z.array(
              z.object({
                providerId: z.string(),
                status: z.string(),
                startedAt: z.string(),
                finishedAt: z.string().nullable(),
                seen: z.number().int().nullable(),
                created: z.number().int().nullable(),
                updated: z.number().int().nullable(),
                expired: z.number().int().nullable(),
                rejected: z.number().int().nullable(),
                error: z.string().nullable(),
              }),
            ),
          }),
          'Newest first.',
        ),
        401: problem('Missing or invalid token.'),
      },
    }),
    async (c) => {
      const rows = await latestRunPerProvider(deps.db);
      return c.json(
        {
          runs: rows.map((r) => ({
            providerId: r.providerId,
            status: r.status,
            startedAt: r.startedAt.toISOString(),
            finishedAt: r.finishedAt?.toISOString() ?? null,
            seen: r.seen ?? null,
            created: r.created ?? null,
            updated: r.updated ?? null,
            expired: r.expired ?? null,
            rejected: r.rejected ?? null,
            error: r.error ?? null,
          })),
        },
        200,
      );
    },
  );

  return app;
}
