import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { problemResponse } from '../errors';
import type { AppEnv } from '../types';

/**
 * Response hardening. The API only ever returns JSON (and the docs page), so the CSP is
 * `default-src 'none'`: even if a response were ever rendered, it could load nothing.
 * The /docs page needs its own relaxed policy for the Scalar viewer.
 */
export function apiSecurityHeaders(): MiddlewareHandler<AppEnv> {
  const strict = secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    referrerPolicy: 'no-referrer',
    crossOriginResourcePolicy: 'cross-origin',
    xFrameOptions: 'DENY',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  });
  const docs = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
        'https://fonts.googleapis.com',
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    referrerPolicy: 'no-referrer',
    xFrameOptions: 'DENY',
  });
  return (c, next) => (c.req.path === '/docs' ? docs(c, next) : strict(c, next));
}

const ALLOWED_HEADERS = 'content-type, x-request-id';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/** Paths that carry the user's session cookie: only the website's own origin may call them. */
const isCredentialed = (path: string): boolean =>
  path.startsWith('/api/auth') || path.startsWith('/v1/me') || path.startsWith('/v1/auth');

/** Server-to-server paths: no CORS at all, so a browser can never call them. */
const isServerOnly = (path: string): boolean =>
  path.startsWith('/internal') || path.startsWith('/v1/partner');

/**
 * Path-based CORS.
 *  - public, read-mostly API (`/v1/*`): open to any origin, but WITHOUT credentials, so another
 *    site can build on our data yet can never act as a signed-in user;
 *  - credentialed paths: only WEB_ORIGIN, with credentials;
 *  - server-to-server paths: none.
 */
export function pathCors(webOrigin: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const path = c.req.path;
    const origin = c.req.header('origin');
    const preflight = c.req.method === 'OPTIONS' && c.req.header('access-control-request-method');

    if (isServerOnly(path)) return next();

    if (isCredentialed(path)) {
      c.header('vary', 'Origin', { append: true });
      if (origin === webOrigin) {
        c.header('access-control-allow-origin', webOrigin);
        c.header('access-control-allow-credentials', 'true');
        if (preflight) {
          c.header('access-control-allow-methods', ALLOWED_METHODS);
          c.header('access-control-allow-headers', ALLOWED_HEADERS);
          c.header('access-control-max-age', '600');
          return c.body(null, 204);
        }
      } else if (preflight) {
        return c.body(null, 204);
      }
      return next();
    }

    c.header('access-control-allow-origin', '*');
    c.header(
      'access-control-expose-headers',
      'x-request-id, ratelimit-limit, ratelimit-remaining, ratelimit-reset, retry-after',
    );
    if (preflight) {
      c.header('access-control-allow-methods', ALLOWED_METHODS);
      c.header('access-control-allow-headers', ALLOWED_HEADERS);
      c.header('access-control-max-age', '600');
      return c.body(null, 204);
    }
    return next();
  };
}

/**
 * CSRF defence for cookie-authenticated, state-changing calls (in addition to SameSite=Lax):
 * if the browser sent an Origin, it must be ours.
 */
export function sameOriginForUnsafe(webOrigin: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const origin = c.req.header('origin');
    if (origin && origin !== webOrigin) {
      return problemResponse(c, 403, 'Cross-site requests are not allowed here.');
    }
    return next();
  };
}

export const DEFAULT_BODY_LIMIT = 256 * 1024;
export const CV_BODY_LIMIT = 6 * 1024 * 1024;

/** 256 KB everywhere; the CV endpoint alone accepts a file (6 MB, covering multipart overhead). */
export function bodyLimits(): MiddlewareHandler<AppEnv> {
  const make = (maxSize: number) =>
    bodyLimit({
      maxSize,
      onError: (c) =>
        problemResponse(
          c,
          413,
          `The request body is too large (limit ${Math.round(maxSize / 1024)} KB).`,
        ),
    });
  const normal = make(DEFAULT_BODY_LIMIT);
  const cv = make(CV_BODY_LIMIT);
  return (c, next) => (c.req.path === '/v1/profile/extract' ? cv(c, next) : normal(c, next));
}
