import { createRoute, z } from '@hono/zod-openapi';
import { SKILL_CATEGORY_LABEL, SKILLS, SKILLS_BY_ID } from '@unneet/content';
import { extractFromCv } from '@unneet/domain';
import { getSkillMatcher } from '@unneet/ingest';
import { ApiError } from '../errors';
import { CV_LIMITS, CvError, extractCvText } from '../lib/cv';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';
import type { Deps } from '../types';

const MAX_PASTED_TEXT = 100_000;

/**
 * Both bodies are declared, and the framework runs BOTH validators on every request (each one
 * sees the other's empty body). So each field is optional here, and the handler requires the one
 * that matches the request's content type, with a clear message.
 */
const JsonBody = z.object({
  text: z
    .string()
    .min(20)
    .max(MAX_PASTED_TEXT)
    .optional()
    .describe('JSON requests: the text of your CV, pasted in (20–100,000 characters).'),
});
const FormBody = z.object({
  file: z.any().optional().openapi({
    type: 'string',
    format: 'binary',
    description: 'Multipart requests: a PDF or Word (.docx) file, up to 5 MB and 15 pages.',
  }),
});

const DraftSchema = z.object({
  draft: z.object({
    skills: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        category: z.string().nullable(),
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        evidence: z.string(),
      }),
    ),
    highestLevel: z.number().int(),
    qualifications: z.array(z.object({ label: z.string(), level: z.number().int() })),
    jobTitles: z.array(z.string()),
    yearsExperience: z.number().nullable(),
  }),
  meta: z.object({
    source: z.enum(['file', 'text']),
    format: z.enum(['pdf', 'docx', 'text']),
    pages: z.number().int().nullable(),
    wordCount: z.number().int(),
  }),
  privacy: z.string(),
});

const PRIVACY =
  'Your CV was read in memory to suggest the details above, and was not saved. We did not look for your name, contact details or address. Nothing here is final: check it and change anything before you use it.';

const CV_ERROR_STATUS = {
  'too-large': 413,
  unsupported: 415,
  unreadable: 422,
  'too-many-pages': 422,
  empty: 422,
} as const;

export function profileRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/profile/extract',
      tags: ['Profile'],
      summary: 'Turn a CV into a draft profile',
      description:
        'Upload a PDF or Word file (multipart, field `file`) or paste the text (JSON, field `text`). We suggest skills, your highest qualification, job titles and years of experience for you to review. The CV is processed in memory and never stored; we deliberately do not extract names, e-mail addresses, phone numbers or addresses.',
      request: {
        body: {
          required: true,
          content: {
            'multipart/form-data': { schema: FormBody },
            'application/json': { schema: JsonBody },
          },
        },
      },
      responses: {
        200: json(DraftSchema, 'A draft profile to review.'),
        413: problem('The file is too big.'),
        415: problem('That kind of file is not supported.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const isMultipart = (c.req.header('content-type') ?? '')
        .toLowerCase()
        .startsWith('multipart/form-data');
      let text: string;
      let source: 'file' | 'text';
      let format: 'pdf' | 'docx' | 'text';
      let pages: number | null = null;

      if (isMultipart) {
        const file = (c.req.valid('form') as { file?: unknown }).file;
        if (!(file instanceof File)) throw new ApiError(422, 'Please choose a file to upload.');
        if (file.size > CV_LIMITS.maxBytes)
          throw new ApiError(413, 'That file is too big. Please use one under 5 MB.');
        try {
          const result = await extractCvText(new Uint8Array(await file.arrayBuffer()));
          ({ text, format, pages } = result);
        } catch (error) {
          if (error instanceof CvError)
            throw new ApiError(CV_ERROR_STATUS[error.code], error.message);
          throw error;
        }
        source = 'file';
      } else {
        const pasted = (c.req.valid('json') as { text?: string }).text;
        if (!pasted) {
          throw new ApiError(422, 'Please upload a file, or paste the text of your CV.', {
            errors: [{ path: 'text', message: 'Required when no file is sent.' }],
          });
        }
        text = pasted;
        source = 'text';
        format = 'text';
      }

      const extraction = extractFromCv(text, getSkillMatcher(), deps.now());
      c.header('cache-control', 'no-store');
      return c.json(
        {
          draft: {
            skills: extraction.skills.slice(0, 40).map((s) => ({
              id: s.id,
              label: s.label,
              category: SKILLS_BY_ID.get(s.id)?.category ?? null,
              level: 2 as const,
              evidence: s.evidence,
            })),
            highestLevel: extraction.qualifications.highestLevel,
            qualifications: extraction.qualifications.found,
            jobTitles: extraction.jobTitles,
            yearsExperience: extraction.yearsExperience,
          },
          meta: { source, format, pages, wordCount: extraction.wordCount },
          privacy: PRIVACY,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/skills/suggest',
      tags: ['Profile'],
      summary: 'Skill suggestions for an autocomplete',
      request: { query: z.object({ q: z.string().trim().min(1).max(40) }) },
      responses: {
        200: json(
          z.object({
            items: z.array(z.object({ id: z.string(), label: z.string(), category: z.string() })),
          }),
          'Up to ten matching skills.',
        ),
        ...commonErrors,
      },
    }),
    (c) => {
      const q = c.req.valid('query').q.toLowerCase();
      const scored = SKILLS.flatMap((skill) => {
        const names = [skill.label, ...skill.aliases].map((n) => n.toLowerCase());
        const prefix = names.some((n) => n.startsWith(q));
        const word = names.some((n) => n.split(/[\s/-]+/).some((w) => w.startsWith(q)));
        const contains = names.some((n) => n.includes(q));
        const rank = prefix ? 0 : word ? 1 : contains ? 2 : null;
        return rank === null ? [] : [{ skill, rank }];
      })
        .sort((a, b) => a.rank - b.rank || a.skill.label.localeCompare(b.skill.label))
        .slice(0, 10);
      c.header('cache-control', 'public, max-age=3600');
      return c.json(
        {
          items: scored.map(({ skill }) => ({
            id: skill.id,
            label: skill.label,
            category: SKILL_CATEGORY_LABEL[skill.category] ?? skill.category,
          })),
        },
        200,
      );
    },
  );

  return app;
}
