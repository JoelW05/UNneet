import { randomUUID } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';
import type { Logger } from '../logger';
import type { AppEnv } from '../types';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Accept a caller's request id only if it is boring (no log-injection), else mint one. */
export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    c.set('requestId', id);
    c.set('user', null);
    c.set('partner', null);
    await next();
    c.header('x-request-id', id);
  };
}

/**
 * One structured line per request. The query string is deliberately NOT logged: search terms and
 * locations can be personal, and URLs end up in log aggregators with long retention.
 */
export function accessLog(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const status = c.res.status;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    logger[level](
      {
        requestId: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
        status,
        ms: Math.round(performance.now() - start),
      },
      'request',
    );
  };
}

/**
 * The client IP, for rate limiting only. Behind exactly ONE trusted reverse proxy (TRUST_PROXY=true)
 * the proxy appends the address it saw to X-Forwarded-For, so the RIGHT-most entry is the real
 * client and anything to its left is attacker-controlled. Never trust the left-most.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const parts = c.req
      .header('x-forwarded-for')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts?.at(-1);
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
