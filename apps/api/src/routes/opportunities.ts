import { createRoute, z } from '@hono/zod-openapi';
import { createReport, getOpportunityBySlug, similarOpportunities } from '@unneet/db';
import {
  MAX_PAGE_SIZE,
  OpportunityCardSchema,
  OpportunityDetailSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  SORTS,
} from '@unneet/domain';
import { notFound } from '../errors';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';
import { runExternalSearch, runSearch } from '../lib/search';
import type { Deps } from '../types';

/**
 * Query parameters as DOCUMENTED (strings). The real parsing is `SearchQuerySchema`, which is
 * deliberately lenient (a bad value in a shared URL is ignored rather than breaking the page), so
 * the OpenAPI document lists the plain wire format and the handler applies the lenient schema.
 */
const text = (description: string) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(description);

const SearchParamsDoc = z.object({
  q: text('Free-text search. Handles phrases and small typos.'),
  pillar: text('Comma-separated: employment, education, training, support.'),
  type: text('Comma-separated opportunity types, e.g. apprenticeship,course. See /v1/taxonomy.'),
  sector: text('Comma-separated sector slugs (Skills England routes). See /v1/taxonomy.'),
  levelMin: text('Lowest qualification level (RQF 0–8) of the opportunity.'),
  levelMax: text('Highest qualification level (RQF 0–8) of the opportunity.'),
  qualified: text('Your highest level (0–8): only show things you can start now.'),
  free: text('1 = only things that cost the learner nothing.'),
  costMax: text('Maximum cost to the learner in GBP.'),
  payMin: text('Minimum pay, annual full-time-equivalent GBP.'),
  workMode: text('Comma-separated: onsite, hybrid, remote, nationwide.'),
  near: text('A postcode, outcode (M1) or place name.'),
  radius: text('Miles from `near` (1–200, default 20).'),
  age: text('Only opportunities a person of this age can take up.'),
  noExperience: text('1 = no previous experience required.'),
  openOnly: text('0 = include listings past their closing date.'),
  sort: text(`One of: ${SORTS.join(', ')}.`),
  page: text('Page number, from 1.'),
  pageSize: text(`Results per page (max ${MAX_PAGE_SIZE}, default 20).`),
  external: text(
    '0 = skip partner job boards (faster); fetch them separately from /v1/opportunities/external.',
  ),
});

const SlugParam = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,199}$/)
    .describe('The listing slug.'),
});

const ExternalResponseSchema = z.object({
  items: z.array(OpportunityCardSchema),
  attributions: z.array(
    z.object({ providerName: z.string(), text: z.string(), url: z.string().nullable() }),
  ),
  locationError: z.string().nullable(),
});

const ReportBodySchema = z.object({
  reason: z.enum(['closed', 'scam', 'misleading', 'offensive', 'other']),
  note: z.string().trim().max(1000).optional(),
});

/** Parse with the lenient domain schema; `external` is an API-only switch, not a search filter. */
function parseQuery(raw: Record<string, unknown>) {
  const { external, ...rest } = raw;
  return {
    query: SearchQuerySchema.parse(rest),
    external: external !== '0' && external !== 'false',
  };
}

export function opportunityRoutes(deps: Deps) {
  const app = newRouter();
  const services = {
    db: deps.db,
    locations: deps.locations,
    federated: deps.federated,
    now: deps.now,
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/opportunities',
      tags: ['Opportunities'],
      summary: 'Search jobs, apprenticeships, courses, training and support',
      description:
        'One search across every kind of opportunity, with disjunctive facet counts (selecting a sector still shows how many results exist in the others). `external` holds extra jobs from partner boards, fetched live and never stored; each links straight out.',
      request: { query: SearchParamsDoc },
      responses: { 200: json(SearchResponseSchema, 'A page of results.'), ...commonErrors },
    }),
    async (c) => {
      const { query, external } = parseQuery(c.req.valid('query'));
      const body = await runSearch(services, query, { external });
      c.header('cache-control', 'no-store');
      return c.json(body, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/opportunities/external',
      tags: ['Opportunities'],
      summary: 'Partner job-board results only',
      description:
        'The same filters as the search. Split out so a page can show first-party results immediately and stream these in. Returns an empty list when no partner is configured or the search is not a good fit for them.',
      request: { query: SearchParamsDoc },
      responses: { 200: json(ExternalResponseSchema, 'Partner results.'), ...commonErrors },
    }),
    async (c) => {
      const { query } = parseQuery(c.req.valid('query'));
      const body = await runExternalSearch(services, query);
      c.header('cache-control', 'no-store');
      return c.json(body, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/opportunities/{slug}',
      tags: ['Opportunities'],
      summary: 'One opportunity in full',
      description:
        'Includes the full description and the official `applyUrl`. A listing its provider has stopped publishing still loads, with `status: "expired"`.',
      request: { params: SlugParam },
      responses: {
        200: json(OpportunityDetailSchema, 'The opportunity.'),
        404: problem('No such opportunity.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const found = await getOpportunityBySlug(deps.db, slug);
      if (!found) throw notFound('We could not find that opportunity.');
      return c.json(found, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/opportunities/{slug}/similar',
      tags: ['Opportunities'],
      summary: 'Similar open opportunities',
      request: {
        params: SlugParam,
        query: z.object({ limit: text('How many (1–12, default 6).') }),
      },
      responses: {
        200: json(z.object({ items: z.array(OpportunityCardSchema) }), 'Similar listings.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const raw = Number(c.req.valid('query').limit);
      const limit = Number.isFinite(raw) ? Math.min(12, Math.max(1, Math.trunc(raw))) : 6;
      const items = await similarOpportunities(deps.db, slug, limit, deps.now());
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/opportunities/{slug}/reports',
      tags: ['Opportunities'],
      summary: 'Report a listing',
      description:
        'Anonymous. Tell us a listing is closed, a scam, misleading or offensive. No reporter identity is stored.',
      request: {
        params: SlugParam,
        body: { content: { 'application/json': { schema: ReportBodySchema } }, required: true },
      },
      responses: {
        201: json(z.object({ ok: z.literal(true) }), 'Thanks: the report was recorded.'),
        404: problem('No such opportunity.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const body = c.req.valid('json');
      const ok = await createReport(deps.db, { slug, reason: body.reason, note: body.note });
      if (!ok) throw notFound('We could not find that opportunity.');
      return c.json({ ok: true as const }, 201);
    },
  );

  return app;
}
