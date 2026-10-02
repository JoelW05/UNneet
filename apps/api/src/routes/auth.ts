import { createRoute, z } from '@hono/zod-openapi';
import { ApiError } from '../errors';
import { OTP_EXPIRES_SECONDS } from '../lib/auth';
import { commonErrors, json, newRouter } from '../lib/openapi';
import type { Deps } from '../types';

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  /**
   * You must be 16 or over to have an account. This is a self-declaration (the UK Children's
   * Code accepts that for a low-risk service); everything except saving things works without one.
   */
  ageConfirmed: z.boolean(),
});

const SentSchema = z.object({
  ok: z.literal(true),
  expiresInSeconds: z.number().int(),
});

/**
 * The ONLY way to ask for a sign-in code. Better Auth's own "send code" endpoint is disabled, so
 * the age confirmation cannot be skipped. The response is identical whether or not the address
 * already has an account (no account enumeration), and does not wait for the email to send.
 */
export function authRoutes(deps: Deps) {
  const app = newRouter();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/otp',
      tags: ['Account'],
      summary: 'Email me a sign-in code',
      description:
        'Passwordless: we email a 6-digit code (valid for 10 minutes). Then POST it to `/api/auth/sign-in/email-otp` with `{ email, otp }` to sign in. The first sign-in creates your account.',
      request: {
        body: { content: { 'application/json': { schema: BodySchema } }, required: true },
      },
      responses: {
        200: json(SentSchema, 'If the address is valid, a code is on its way.'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const { email, ageConfirmed } = c.req.valid('json');
      if (!ageConfirmed) {
        throw new ApiError(
          422,
          'You need to be 16 or over to create an account. You can still search, take the quizzes and see your timeline without one.',
          { errors: [{ path: 'ageConfirmed', message: 'Please confirm you are 16 or over.' }] },
        );
      }
      try {
        await deps.auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
      } catch (error) {
        // Never tell the caller why: that would leak whether the address exists.
        deps.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'could not start sign-in',
        );
      }
      c.header('cache-control', 'no-store');
      return c.json({ ok: true as const, expiresInSeconds: OTP_EXPIRES_SECONDS }, 200);
    },
  );

  // Better Auth's own routes (session, sign-in with code, sign-out). Not part of the OpenAPI
  // document: they are documented by Better Auth, and the website uses its client.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw));

  return app;
}
