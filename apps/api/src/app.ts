import { Scalar } from '@scalar/hono-api-reference';
import { ZodError } from 'zod';
import { ApiError, issuesToErrors, problemResponse } from './errors';
import { newRouter } from './lib/openapi';
import { MemoryRateLimitStore, type RateLimitStore } from './lib/rate-limiter';
import { emailKey, rateLimit } from './middleware/rate-limit';
import { accessLog, requestId } from './middleware/request';
import {
  apiSecurityHeaders,
  bodyLimits,
  pathCors,
  sameOriginForUnsafe,
} from './middleware/security';
import { loadSession, requireInternalToken, requirePartner } from './middleware/session';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { internalRoutes } from './routes/internal';
import { locationRoutes } from './routes/locations';
import { matchRoutes } from './routes/match';
import { meRoutes } from './routes/me';
import { opportunityRoutes } from './routes/opportunities';
import { partnerRoutes } from './routes/partner';
import { pathwayRoutes } from './routes/pathways';
import { profileRoutes } from './routes/profile';
import { quizRoutes } from './routes/quizzes';
import { statsRoutes } from './routes/stats';
import { taxonomyRoutes } from './routes/taxonomy';
import { timelineRoutes } from './routes/timeline';
import type { Deps } from './types';

export const API_INFO = {
  title: 'UnNEET API',
  version: '0.1.0',
  description:
    'Search jobs, apprenticeships, courses, training and support across the UK, get explainable matches, take interest quizzes and see a personalised timeline of what to do when. Public endpoints need no key. Errors are RFC 9457 problem+json.',
} as const;

export interface AppOptions {
  rateLimitStore?: RateLimitStore;
}

const MIN = 60_000;

/**
 * Build the app from its dependencies. Nothing in here reads the environment, the clock or the
 * network directly: that is what lets the test-suite run the whole API against an in-memory
 * Postgres with fake e-mail, fake geocoding and a fixed clock.
 */
export function createApp(deps: Deps, options: AppOptions = {}) {
  const { env, logger } = deps;
  const app = newRouter();
  const store = options.rateLimitStore ?? new MemoryRateLimitStore();
  const limit = (name: string, max: number, windowMs: number) =>
    rateLimit(store, env.trustProxy, { name, limit: max, windowMs });

  // --- cross-cutting, in order ---------------------------------------------------------------
  app.use('*', requestId());
  app.use('*', accessLog(logger));
  app.use('*', apiSecurityHeaders());
  app.use('*', pathCors(env.webOrigin));
  app.use('*', bodyLimits());

  // --- rate limits: generous for reading, strict where it is expensive or abusable -------------
  app.use('/v1/*', limit('v1', 300, MIN));
  app.use('/v1/locations/*', limit('locations', 60, MIN));
  app.use('/v1/match', limit('match', 30, MIN));
  app.use('/v1/profile/extract', limit('cv', 10, 10 * MIN));
  app.use('/v1/opportunities/*/reports', limit('reports', 10, 60 * MIN));
  app.use('/v1/auth/otp', limit('otp-ip', 10, 10 * MIN));
  app.use(
    '/v1/auth/otp',
    rateLimit(store, env.trustProxy, {
      name: 'otp-email',
      limit: 3,
      windowMs: 10 * MIN,
      key: async (c) => {
        const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
        return emailKey(typeof body.email === 'string' ? body.email : '');
      },
    }),
  );
  app.use('/api/auth/*', limit('better-auth', 120, MIN));
  app.use('/v1/partner/*', limit('partner', 60, MIN));

  // --- access control ----------------------------------------------------------------------------
  app.use('/v1/me/*', sameOriginForUnsafe(env.webOrigin));
  app.use('/v1/me', sameOriginForUnsafe(env.webOrigin));
  app.use('/v1/auth/*', sameOriginForUnsafe(env.webOrigin));
  // Better Auth only checks Origin when cookies are present, which leaves LOGIN CSRF open (a
  // foreign page signing a visitor in to the attacker's own account). Close it for every method
  // that changes state.
  app.use('/api/auth/*', sameOriginForUnsafe(env.webOrigin));
  app.use('/v1/me/*', loadSession(deps));
  app.use('/v1/me', loadSession(deps));
  app.use('/v1/partner/*', requirePartner(deps));
  app.use('/internal/*', requireInternalToken(env.internalToken));

  // --- routes --------------------------------------------------------------------------------
  app.route('/', healthRoutes(deps));
  app.route('/', taxonomyRoutes());
  app.route('/', statsRoutes(deps));
  app.route('/', opportunityRoutes(deps));
  app.route('/', locationRoutes(deps));
  app.route('/', quizRoutes());
  app.route('/', pathwayRoutes(deps));
  app.route('/', timelineRoutes(deps));
  app.route('/', matchRoutes(deps));
  app.route('/', profileRoutes(deps));
  app.route('/', authRoutes(deps));
  app.route('/', meRoutes(deps));
  app.route('/', partnerRoutes(deps));
  app.route('/', internalRoutes(deps));

  // --- docs ----------------------------------------------------------------------------------
  app.openAPIRegistry.registerComponent('securitySchemes', 'ApiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
  });
  app.openAPIRegistry.registerComponent('securitySchemes', 'InternalToken', {
    type: 'apiKey',
    in: 'header',
    name: 'X-Internal-Token',
  });
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: API_INFO,
    servers: [{ url: env.webOrigin, description: 'Via the website (same origin)' }],
    tags: [
      {
        name: 'Opportunities',
        description: 'Search and read jobs, apprenticeships, courses and more.',
      },
      { name: 'Matching', description: 'Explainable, personalised ranking.' },
      { name: 'Quizzes' },
      { name: 'Timeline', description: 'What to do, and when.' },
      { name: 'Pathways' },
      { name: 'Profile', description: 'CV extraction and skills.' },
      { name: 'Locations' },
      { name: 'Account', description: 'Sign-in, saved items, data export and deletion.' },
      { name: 'Partners', description: 'For colleges, training providers and employers.' },
      { name: 'Reference' },
      { name: 'Operations' },
    ],
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'UnNEET API' }));

  // --- errors --------------------------------------------------------------------------------
  app.notFound((c) => problemResponse(c, 404, 'There is nothing at that address.'));
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return problemResponse(
        c,
        error.status,
        error.detail,
        error.options.errors ? { errors: error.options.errors } : {},
        error.options.headers,
      );
    }
    if (error instanceof ZodError) {
      return problemResponse(c, 422, 'Some of the details you sent are not valid.', {
        errors: issuesToErrors(error),
      });
    }
    // Malformed bodies (bad JSON, bad multipart) are the caller's fault, not ours.
    const status = (error as { status?: number }).status;
    if (error instanceof SyntaxError) return problemResponse(c, 400, 'That is not valid JSON.');
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return problemResponse(c, status as 400, error.message);
    }
    // Everything else is OUR bug: log it fully, tell the client nothing about the internals.
    logger.error(
      {
        err:
          error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        requestId: c.get('requestId'),
      },
      'unhandled error',
    );
    return problemResponse(c, 500, 'Something went wrong on our side. Please try again.');
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
