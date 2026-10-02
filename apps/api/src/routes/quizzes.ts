import { createRoute, z } from '@hono/zod-openapi';
import { ATTRIBUTIONS, RIASEC_ITEMS, RIASEC_QUIZ_META } from '@unneet/content';
import {
  LIKERT_LABEL,
  LikertSchema,
  RIASEC_INFO,
  RIASEC_TYPES,
  rankSectorsByInterest,
  scoreRiasec,
} from '@unneet/domain';
import { ApiError } from '../errors';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';

const QuizSchema = z.object({
  id: z.string(),
  title: z.string(),
  intro: z.string(),
  estimatedMinutes: z.number(),
  scale: z.array(z.object({ value: z.number().int(), label: z.string() })),
  items: z.array(z.object({ id: z.string(), text: z.string() })),
  attribution: z.string(),
});

const VectorSchema = z.object({
  R: z.number(),
  I: z.number(),
  A: z.number(),
  S: z.number(),
  E: z.number(),
  C: z.number(),
});

const ScoreBodySchema = z.object({
  answers: z
    .record(z.string().max(20), LikertSchema)
    .describe(
      'Item id → 0 (strongly dislike) … 4 (strongly like). Unanswered items may be omitted.',
    ),
});

const ScoreSchema = z.object({
  /** Normalised 0–1 per type: store this in the profile. */
  riasec: VectorSchema,
  code: z.string(),
  ranking: z.array(z.string()),
  answered: z.number().int(),
  total: z.number().int(),
  reliable: z.boolean(),
  differentiation: z.number(),
  types: z.array(
    z.object({ type: z.string(), name: z.string(), description: z.string(), score: z.number() }),
  ),
  /** Sectors ranked by interest fit (0–1, 0.5 = neutral). */
  sectors: z.array(z.object({ sector: z.string(), fit: z.number() })),
});

const ITEM_IDS = new Set(RIASEC_ITEMS.map((i) => i.id));
const ATTRIBUTION = ATTRIBUTIONS.find((a) => a.id === 'onet-mini-ip')?.text ?? '';

export function quizRoutes() {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/quizzes/interests',
      tags: ['Quizzes'],
      summary: 'The interests quiz (30 items)',
      description:
        'Based on the O*NET Mini Interest Profiler (CC BY 4.0). Item types are withheld; scoring is done by POST /v1/quizzes/interests/score.',
      responses: { 200: json(QuizSchema, 'The quiz.') },
    }),
    (c) => {
      c.header('cache-control', 'public, max-age=3600');
      return c.json(
        {
          ...RIASEC_QUIZ_META,
          scale: Object.entries(LIKERT_LABEL).map(([value, label]) => ({
            value: Number(value),
            label,
          })),
          items: RIASEC_ITEMS.map((i) => ({ id: i.id, text: i.text })),
          attribution: ATTRIBUTION,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/quizzes/interests/score',
      tags: ['Quizzes'],
      summary: 'Score the interests quiz',
      description:
        'Stateless: nothing is stored. Returns the RIASEC profile, a three-letter code, and the sectors that fit best.',
      request: {
        body: { content: { 'application/json': { schema: ScoreBodySchema } }, required: true },
      },
      responses: {
        200: json(ScoreSchema, 'The result.'),
        400: problem('No valid answers.'),
        ...commonErrors,
      },
    }),
    (c) => {
      const { answers } = c.req.valid('json');
      const known = Object.fromEntries(Object.entries(answers).filter(([id]) => ITEM_IDS.has(id)));
      if (Object.keys(known).length === 0) {
        throw new ApiError(400, 'No answers matched the quiz questions.');
      }
      const result = scoreRiasec(RIASEC_ITEMS, known);
      return c.json(
        {
          riasec: result.normalised,
          code: result.code,
          ranking: result.ranking,
          answered: result.answered,
          total: result.total,
          reliable: result.reliable,
          differentiation: result.differentiation,
          types: RIASEC_TYPES.map((type) => ({
            type,
            name: RIASEC_INFO[type].name,
            description: RIASEC_INFO[type].description,
            score: result.normalised[type],
          })),
          sectors: rankSectorsByInterest(result.normalised),
        },
        200,
      );
    },
  );

  return app;
}
