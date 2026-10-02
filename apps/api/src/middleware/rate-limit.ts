import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { problemResponse } from '../errors';
import type { RateLimitResult, RateLimitStore } from '../lib/rate-limiter';
import type { AppEnv } from '../types';
import { clientIp } from './request';

export interface RateLimitRule {
  /** Part of the bucket key, so different endpoints never share a budget. */
  name: string;
  limit: number;
  windowMs: number;
  /** What to count by. Default: client IP. */
  key?: (c: Context<AppEnv>) => string | Promise<string>;
}

/** draft-ietf-httpapi-ratelimit-headers (legacy field names, widely understood by clients). */
function setHeaders(c: Context, r: RateLimitResult): void {
  c.header('ratelimit-limit', String(r.limit));
  c.header('ratelimit-remaining', String(r.remaining));
  c.header('ratelimit-reset', String(r.resetSeconds));
}

export function rateLimit(
  store: RateLimitStore,
  trustProxy: boolean,
  rule: RateLimitRule,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const subject = rule.key ? await rule.key(c) : clientIp(c, trustProxy);
    const result = store.hit(`${rule.name}:${subject}`, rule.limit, rule.windowMs);
    setHeaders(c, result);
    if (!result.allowed) {
      return problemResponse(
        c,
        429,
        'You are doing that a lot. Please wait a moment and try again.',
        {},
        {
          'retry-after': String(result.resetSeconds),
          'ratelimit-limit': String(result.limit),
          'ratelimit-remaining': '0',
          'ratelimit-reset': String(result.resetSeconds),
        },
      );
    }
    return next();
  };
}

/** A short, non-reversible bucket key for an email address (never put raw emails in a key store/log). */
export const emailKey = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
