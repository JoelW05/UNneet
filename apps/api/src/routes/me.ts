import { createRoute, z } from '@hono/zod-openapi';
import {
  deleteUserData,
  exportUserData,
  getProfile,
  listSaved,
  putProfile,
  saveOpportunity,
  saveQuizResult,
  unsaveOpportunity,
} from '@unneet/db';
import { OpportunityCardSchema, ProfileSchema } from '@unneet/domain';
import type { Context } from 'hono';
import { notFound } from '../errors';
import { commonErrors, json, newRouter, problem } from '../lib/openapi';
import { requireUser } from '../middleware/session';
import type { AppEnv, Deps, SessionUser } from '../types';

const ProfileOrNull = z.object({ profile: ProfileSchema.nullable() });
const IdParam = z.object({ id: z.uuid() });

const AuthErrors = { 401: problem('You need to sign in.'), ...commonErrors } as const;

/** Expire every Better Auth cookie the browser sent, so a deleted account is signed out too. */
function clearAuthCookies(c: Context<AppEnv>): void {
  const names = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter((name) => /(^|__Secure-|__Host-)better-auth\./.test(name));
  for (const name of names) {
    const secure = name.startsWith('__Secure-') || name.startsWith('__Host-');
    c.header(
      'set-cookie',
      `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
      { append: true },
    );
  }
}

/**
 * Everything about the signed-in person. Each handler works on `c.get('user')` ONLY: ids are never
 * taken from the URL or body, so one user can never reach another's data (no IDOR by design).
 */
export function meRoutes(deps: Deps) {
  const app = newRouter();
  // Scoped to /v1/me: a sub-router's `*` would otherwise apply to the WHOLE app once mounted.
  app.use('/v1/me', requireUser);
  app.use('/v1/me/*', requireUser);
  const current = (c: Context<AppEnv>): SessionUser => c.get('user') as SessionUser;
  const userId = (c: Context<AppEnv>): string => current(c).id;

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me',
      tags: ['Account'],
      summary: 'Who am I',
      responses: {
        200: json(
          z.object({ user: z.object({ id: z.string(), email: z.string(), name: z.string() }) }),
          'The signed-in user.',
        ),
        ...AuthErrors,
      },
    }),
    (c) => c.json({ user: current(c) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me/profile',
      tags: ['Account'],
      summary: 'My saved profile',
      responses: {
        200: json(ProfileOrNull, 'The profile, or null if none saved yet.'),
        ...AuthErrors,
      },
    }),
    async (c) => c.json({ profile: await getProfile(deps.db, userId(c)) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/me/profile',
      tags: ['Account'],
      summary: 'Save my profile',
      request: {
        body: { content: { 'application/json': { schema: ProfileSchema } }, required: true },
      },
      responses: { 200: json(ProfileOrNull, 'The saved profile.'), ...AuthErrors },
    }),
    async (c) => {
      const profile = c.req.valid('json');
      await putProfile(deps.db, userId(c), profile);
      return c.json({ profile }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me/saved',
      tags: ['Account'],
      summary: 'Opportunities I have saved',
      responses: {
        200: json(
          z.object({ items: z.array(OpportunityCardSchema) }),
          'Saved items, newest first.',
        ),
        ...AuthErrors,
      },
    }),
    async (c) => c.json({ items: await listSaved(deps.db, userId(c)) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/me/saved/{id}',
      tags: ['Account'],
      summary: 'Save an opportunity',
      request: { params: IdParam },
      responses: {
        204: { description: 'Saved (or already saved).' },
        404: problem('No such opportunity.'),
        ...AuthErrors,
      },
    }),
    async (c) => {
      const ok = await saveOpportunity(deps.db, userId(c), c.req.valid('param').id);
      if (!ok) throw notFound('We could not find that opportunity.');
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/me/saved/{id}',
      tags: ['Account'],
      summary: 'Unsave an opportunity',
      request: { params: IdParam },
      responses: { 204: { description: 'Removed (or was not saved).' }, ...AuthErrors },
    }),
    async (c) => {
      await unsaveOpportunity(deps.db, userId(c), c.req.valid('param').id);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/me/quiz-results',
      tags: ['Account'],
      summary: 'Keep a quiz result on my account',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z.object({
                quizId: z.enum(['interests']),
                result: z
                  .record(z.string(), z.unknown())
                  .refine((r) => JSON.stringify(r).length <= 8000, 'Too large'),
              }),
            },
          },
        },
      },
      responses: { 204: { description: 'Saved.' }, ...AuthErrors },
    }),
    async (c) => {
      const { quizId, result } = c.req.valid('json');
      await saveQuizResult(deps.db, userId(c), quizId, result);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me/export',
      tags: ['Account'],
      summary: 'Download everything we hold about me',
      description:
        'UK GDPR Article 20 (data portability): your account, profile, saved items and quiz results as JSON.',
      responses: {
        200: {
          description: 'A JSON file.',
          content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
        },
        ...AuthErrors,
      },
    }),
    async (c) => {
      const data = await exportUserData(deps.db, userId(c));
      if (!data) throw notFound();
      c.header('content-disposition', 'attachment; filename="unneet-my-data.json"');
      c.header('cache-control', 'no-store');
      return c.json(data as unknown as Record<string, unknown>, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/me',
      tags: ['Account'],
      summary: 'Delete my account and everything attached to it',
      description:
        'UK GDPR Article 17 (erasure). Permanent: profile, saved items, quiz results, sessions and sign-in records are all removed.',
      responses: { 204: { description: 'Deleted.' }, ...AuthErrors },
    }),
    async (c) => {
      await deleteUserData(deps.db, userId(c));
      clearAuthCookies(c);
      return c.body(null, 204);
    },
  );

  return app;
}
