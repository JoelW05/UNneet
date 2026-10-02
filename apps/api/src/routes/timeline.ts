import { createRoute, z } from '@hono/zod-openapi';
import { CALENDAR_EVENTS, TIMELINE_RULES } from '@unneet/content';
import {
  buildIcs,
  buildTimeline,
  isSectorSlug,
  type SectorSlug,
  StageSchema,
  TimelineSchema,
} from '@unneet/domain';
import { ApiError } from '../errors';
import { commonErrors, json, newRouter } from '../lib/openapi';
import type { Deps } from '../types';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const QuerySchema = z.object({
  stage: StageSchema.describe('Where you are now. See /v1/taxonomy for the list.'),
  sectors: z.string().max(400).optional().describe('Comma-separated sector slugs you care about.'),
  done: z
    .string()
    .max(4000)
    .optional()
    .describe('Comma-separated ids of items you have ticked off.'),
  startedOn: IsoDate.optional().describe('The day you started, for "first 30 days" items.'),
  asOf: IsoDate.optional().describe(
    'Pretend today is this date: "what will I be told in September?". Defaults to today.',
  ),
});

const list = (v: string | undefined, max: number): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);

function parse(raw: z.infer<typeof QuerySchema>, now: Date) {
  const asOf = raw.asOf ? new Date(`${raw.asOf}T12:00:00Z`) : now;
  if (
    Number.isNaN(asOf.getTime()) ||
    asOf.getUTCFullYear() < 2000 ||
    asOf.getUTCFullYear() > 2100
  ) {
    throw new ApiError(422, 'That date is out of range.');
  }
  const sectors = list(raw.sectors, 15).filter((s): s is SectorSlug => isSectorSlug(s));
  return {
    stage: raw.stage,
    now: asOf,
    sectors,
    doneIds: list(raw.done, 300),
    ...(raw.startedOn ? { startedOn: raw.startedOn } : {}),
  };
}

export function timelineRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/timeline',
      tags: ['Timeline'],
      summary: 'What to do, and when, for where you are now',
      description:
        'A personalised, date-aware plan: what to do now, soon, later, what you may have missed, and the three most useful next steps. Exact dates (UCAS deadlines and so on) come from a sourced, verified calendar; everything else is a typical window and says so. Stateless: nothing is stored.',
      request: { query: QuerySchema },
      responses: { 200: json(TimelineSchema, 'The timeline.'), ...commonErrors },
    }),
    (c) => {
      const input = parse(c.req.valid('query'), deps.now());
      c.header('cache-control', 'no-store');
      return c.json(buildTimeline(input, TIMELINE_RULES, CALENDAR_EVENTS), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/timeline.ics',
      tags: ['Timeline'],
      summary: 'The timeline as a calendar you can subscribe to',
      description:
        'iCalendar (.ics) of the "now", "soon" and "later" items as all-day events with a 9am reminder. Subscribe in Google, Apple or Outlook calendar and get nudged without UnNEET holding any personal data.',
      request: { query: QuerySchema },
      responses: {
        200: {
          description: 'An iCalendar document.',
          content: { 'text/calendar': { schema: z.string() } },
        },
        ...commonErrors,
      },
    }),
    (c) => {
      const now = deps.now();
      const timeline = buildTimeline(
        parse(c.req.valid('query'), now),
        TIMELINE_RULES,
        CALENDAR_EVENTS,
      );
      const ics = buildIcs([...timeline.now, ...timeline.soon, ...timeline.later], {
        calendarName: 'UnNEET: your next steps',
        uidDomain: new URL(deps.env.webOrigin).hostname,
        siteOrigin: deps.env.webOrigin,
        now,
      });
      c.header('cache-control', 'public, max-age=3600');
      c.header('content-disposition', 'inline; filename="unneet-timeline.ics"');
      return c.body(ics, 200, { 'content-type': 'text/calendar; charset=utf-8' });
    },
  );

  return app;
}
