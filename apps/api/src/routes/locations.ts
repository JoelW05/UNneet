import { createRoute, z } from '@hono/zod-openapi';
import { ApiError } from '../errors';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';
import type { Deps } from '../types';

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(80).describe('A postcode, outcode (e.g. M1) or place name.'),
});

const ResolvedSchema = z.object({
  kind: z.enum(['postcode', 'outcode', 'place']),
  label: z.string(),
  outcode: z.string().nullable(),
  /** The point used for a search. For a full postcode this is exact and is NOT meant to be stored. */
  lat: z.number(),
  lon: z.number(),
  /** Outcode-level point: what a profile should keep. */
  coarse: z.object({ lat: z.number(), lon: z.number(), label: z.string() }),
});

const SuggestionsSchema = z.object({
  items: z.array(
    z.object({
      label: z.string(),
      outcode: z.string().nullable(),
      lat: z.number(),
      lon: z.number(),
    }),
  ),
});

export function locationRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/locations/resolve',
      tags: ['Locations'],
      summary: 'Turn a postcode, outcode or place name into coordinates',
      description:
        'Backed by postcodes.io. Ambiguous names resolve to the largest settlement ("Newcastle" is Newcastle upon Tyne). Save `coarse`, not the exact point, in a profile.',
      request: { query: QuerySchema },
      responses: {
        200: json(ResolvedSchema, 'The resolved location.'),
        404: problem('We could not find that place.'),
        503: problem('The location service is unavailable.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const { q } = c.req.valid('query');
      const result = await deps.locations.resolve(q);
      if (!result.ok) {
        if (result.reason === 'unavailable')
          throw new ApiError(503, 'Location search is not working right now.');
        if (result.reason === 'outside-uk')
          throw new ApiError(422, 'That place is outside the UK.');
        throw new ApiError(404, 'We could not find that place. Try a town, city or postcode.');
      }
      const { location } = result;
      const coarse = await deps.locations.coarsen(location);
      return c.json(
        {
          kind: location.kind,
          label: location.label,
          outcode: location.outcode,
          lat: location.lat,
          lon: location.lon,
          coarse,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/locations/suggest',
      tags: ['Locations'],
      summary: 'Place-name suggestions for an autocomplete',
      request: { query: QuerySchema },
      responses: { 200: json(SuggestionsSchema, 'Up to six suggestions.'), ...commonErrors },
    }),
    async (c) => {
      const items = await deps.locations.suggest(c.req.valid('query').q);
      return c.json({ items }, 200);
    },
  );

  return app;
}
