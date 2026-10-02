import { createRoute, z } from '@hono/zod-openapi';
import {
  AGE_BANDS,
  GOAL_INFO,
  OPPORTUNITY_TYPE_INFO,
  PILLAR_INFO,
  PILLARS,
  type Pillar,
  QUALIFICATION_LEVELS,
  SECTORS,
  SORT_LABEL,
  STAGE_INFO,
  STAGES,
  WORK_MODE_LABEL,
  WORK_VALUES,
} from '@unneet/domain';
import { json, newRouter } from '../lib/openapi';

const TaxonomySchema = z.object({
  sectors: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      blurb: z.string(),
      exampleRoles: z.array(z.string()),
    }),
  ),
  levels: z.array(
    z.object({
      value: z.number().int(),
      label: z.string(),
      haveLabel: z.string(),
      examples: z.array(z.string()),
    }),
  ),
  pillars: z.array(z.object({ slug: z.string(), label: z.string(), help: z.string() })),
  types: z.array(
    z.object({
      slug: z.string(),
      pillar: z.string(),
      label: z.string(),
      plural: z.string(),
      help: z.string(),
      paid: z.boolean(),
    }),
  ),
  workModes: z.array(z.object({ slug: z.string(), label: z.string() })),
  stages: z.array(
    z.object({ slug: z.string(), label: z.string(), hint: z.string(), academic: z.boolean() }),
  ),
  goals: z.array(z.object({ slug: z.string(), label: z.string(), help: z.string() })),
  ageBands: z.array(z.string()),
  values: z.array(z.object({ key: z.string(), label: z.string(), description: z.string() })),
  sorts: z.array(z.object({ slug: z.string(), label: z.string() })),
});

/** Built once: the taxonomy is static, so it is also safe to cache hard. */
const TAXONOMY = {
  sectors: SECTORS.map((s) => ({
    slug: s.slug,
    name: s.name,
    blurb: s.blurb,
    exampleRoles: [...s.exampleRoles],
  })),
  levels: QUALIFICATION_LEVELS.map((l) => ({
    value: l.value,
    label: l.label,
    haveLabel: l.haveLabel,
    examples: [...l.examples],
  })),
  pillars: PILLARS.map((slug: Pillar) => ({ slug, ...PILLAR_INFO[slug] })),
  types: Object.values(OPPORTUNITY_TYPE_INFO).map((t) => ({
    slug: t.type,
    pillar: t.pillar,
    label: t.label,
    plural: t.plural,
    help: t.help,
    paid: t.paid,
  })),
  workModes: Object.entries(WORK_MODE_LABEL).map(([slug, label]) => ({ slug, label })),
  stages: STAGES.map((slug) => {
    const s = STAGE_INFO[slug];
    return { slug, label: s.label, hint: s.hint, academic: s.academic };
  }),
  goals: Object.entries(GOAL_INFO).map(([slug, g]) => ({ slug, ...g })),
  ageBands: [...AGE_BANDS],
  values: WORK_VALUES.map((v) => ({ key: v.key, label: v.label, description: v.description })),
  sorts: Object.entries(SORT_LABEL).map(([slug, label]) => ({ slug, label })),
};

export function taxonomyRoutes() {
  const app = newRouter();
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/taxonomy',
      tags: ['Reference'],
      summary: 'Sectors, levels, types, stages and other filter values',
      description:
        'Everything the filters and pickers are built from. Sectors follow the 15 Skills England occupational routes; levels are RQF 0–8.',
      responses: { 200: json(TaxonomySchema, 'The taxonomy.') },
    }),
    (c) => {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(TAXONOMY, 200);
    },
  );
  return app;
}
