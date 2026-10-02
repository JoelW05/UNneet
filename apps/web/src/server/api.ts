import 'server-only';
import { type ApiClient, createApiClient } from '@unneet/api-client';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

/** Where the API lives, from the server's point of view (never exposed to the browser). */
export const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * The visitor's address, forwarded so the API's rate limiter counts people, not this server.
 * Behind one trusted proxy the right-most X-Forwarded-For entry is the real client; the API
 * (TRUST_PROXY) reads the right-most entry we send, so we send exactly one: the visitor.
 */
function clientIp(h: Headers): string | undefined {
  const parts = h
    .get('x-forwarded-for')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts?.at(-1) ?? h.get('x-real-ip') ?? undefined;
}

/**
 * A server-side API client scoped to the current request: forwards the visitor's IP (for rate
 * limiting) and, when asked, their session cookie (for signed-in calls). Never cached by Next:
 * the API decides what is cacheable via its own headers.
 */
export const serverApi = cache(
  async (options: { withSession?: boolean } = {}): Promise<ApiClient> => {
    const h = await headers();
    const ip = clientIp(h);
    const cookie = options.withSession ? (await cookies()).toString() : '';
    return createApiClient({
      baseUrl: API_URL,
      headers: {
        ...(ip ? { 'x-forwarded-for': ip } : {}),
        ...(cookie ? { cookie } : {}),
        ...(h.get('x-request-id') ? { 'x-request-id': h.get('x-request-id') as string } : {}),
      },
      fetch: (request: Request) => fetch(request, { cache: 'no-store' }),
    });
  },
);
