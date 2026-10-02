import { createHash, timingSafeEqual } from 'node:crypto';
import { findPartnerByKey } from '@unneet/db';
import type { MiddlewareHandler } from 'hono';
import { problemResponse, unauthorised } from '../errors';
import type { AppEnv, Deps } from '../types';

/** Resolve the Better Auth session (if any) into `c.get('user')`. Never throws: no session = anonymous. */
export function loadSession(deps: Pick<Deps, 'auth' | 'logger'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
      if (session?.user) {
        c.set('user', {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        });
      }
    } catch (error) {
      deps.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'session lookup failed; treating request as anonymous',
      );
    }
    return next();
  };
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw unauthorised();
  return next();
};

/** Constant-time string comparison that also hides the length difference. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** `X-Internal-Token` for scheduler-triggered jobs. If no token is configured the routes do not exist. */
export function requireInternalToken(token: string | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!token) return problemResponse(c, 404, 'Not found');
    const given = c.req.header('x-internal-token');
    if (!given || !safeEqual(given, token)) return problemResponse(c, 401, 'Invalid token.');
    return next();
  };
}

/** `X-API-Key` for partner (e.g. college) feeds. Only a SHA-256 of each key is stored. */
export function requirePartner(deps: Pick<Deps, 'db'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header('x-api-key');
    if (!key) return problemResponse(c, 401, 'An API key is required.');
    const partner = await findPartnerByKey(deps.db, key);
    if (!partner) return problemResponse(c, 401, 'That API key is not valid.');
    c.set('partner', {
      id: partner.id,
      providerId: partner.providerId,
      provider: { ...partner.provider, requiresKey: false },
    });
    return next();
  };
}
