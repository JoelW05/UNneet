import { createRoute, z } from '@hono/zod-openapi';
import { normalisePostcode, type OpportunityInput, OpportunityInputSchema } from '@unneet/domain';
import { type ProviderAdapter, runProvider } from '@unneet/ingest';
import { ApiError } from '../errors';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';
import type { Deps } from '../types';

const MAX_BATCH = 200;
const MAX_GEOCODES = 100;

const BodySchema = z.object({
  opportunities: z.array(OpportunityInputSchema).min(1).max(MAX_BATCH),
});

const ReportSchema = z.object({
  received: z.number().int(),
  valid: z.number().int(),
  rejected: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  /** The first few reasons something was rejected, so you can fix your feed. */
  rejectionSamples: z.array(z.string()),
});

/**
 * Colleges, training providers and employers can push their own listings. Each key belongs to one
 * provider; everything it submits is stored under that provider, validated by exactly the same
 * schema as every other source, and linked back to the applyUrl they gave us. Pushing is an
 * upsert by `externalId`, so re-sending a feed is safe; listings are never expired by a push
 * (a push is a delta, not "the complete list").
 */
export function partnerRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/partner/opportunities',
      tags: ['Partners'],
      summary: 'Publish your opportunities (partners only)',
      description:
        'Send up to 200 listings in the same format as every other source. Authenticate with `X-API-Key`. Idempotent: the same `externalId` updates the existing listing.',
      security: [{ ApiKey: [] }],
      request: {
        body: { content: { 'application/json': { schema: BodySchema } }, required: true },
      },
      responses: {
        200: json(ReportSchema, 'What was stored.'),
        401: problem('Missing or invalid API key.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const partner = c.get('partner');
      if (!partner) throw new ApiError(401, 'An API key is required.');
      const { opportunities } = c.req.valid('json');

      // Give listings with only a postcode coordinates, so they can be found by distance.
      const needing = [
        ...new Set(
          opportunities
            .filter((o) => o.location.lat == null && o.location.postcode)
            .map((o) => normalisePostcode(o.location.postcode ?? ''))
            .filter((p): p is string => p !== null),
        ),
      ].slice(0, MAX_GEOCODES);
      const points = new Map<string, { lat: number; lon: number }>();
      await Promise.all(
        needing.map(async (postcode) => {
          const r = await deps.locations.resolve(postcode);
          if (r.ok) points.set(postcode, { lat: r.location.lat, lon: r.location.lon });
        }),
      );
      const prepared: OpportunityInput[] = opportunities.map((o) => {
        const point = o.location.postcode
          ? points.get(normalisePostcode(o.location.postcode) ?? '')
          : undefined;
        return point && o.location.lat == null
          ? { ...o, location: { ...o.location, lat: point.lat, lon: point.lon } }
          : o;
      });

      const adapter: ProviderAdapter = {
        meta: partner.provider,
        fullFeed: false,
        isConfigured: () => true,
        async *fetch() {
          for (const o of prepared) yield o;
        },
        map: (raw) => ({ ok: true, input: raw as OpportunityInput }),
      };

      const report = await runProvider(deps.db, adapter, {
        env: {},
        now: deps.now(),
      });
      if (report.status === 'failed') {
        deps.logger.error({ partner: partner.id, error: report.error }, 'partner push failed');
        throw new ApiError(500, 'We could not store that batch. Please try again.');
      }
      return c.json(
        {
          received: report.seen,
          valid: report.valid,
          rejected: report.rejected,
          created: report.stats?.created ?? 0,
          updated: report.stats?.updated ?? 0,
          unchanged: report.stats?.unchanged ?? 0,
          rejectionSamples: report.rejectionSamples,
        },
        200,
      );
    },
  );

  return app;
}
