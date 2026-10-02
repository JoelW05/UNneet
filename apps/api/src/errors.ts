import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

/**
 * Every error the API returns is RFC 9457 `application/problem+json`, so clients have exactly one
 * error shape to handle. https://www.rfc-editor.org/rfc/rfc9457
 */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  /** Correlates with the `x-request-id` header and the server log line. */
  requestId: z.string().optional(),
  /** Field-level validation problems. */
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad request',
  401: 'Sign in required',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Something went wrong',
  503: 'Service unavailable',
};

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly detail: string,
    readonly options: { errors?: Problem['errors']; headers?: Record<string, string> } = {},
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

export const notFound = (detail = 'We could not find that.') => new ApiError(404, detail);
export const badRequest = (detail: string) => new ApiError(400, detail);
export const unauthorised = (detail = 'Please sign in to do that.') => new ApiError(401, detail);
export const forbidden = (detail = 'You do not have access to that.') => new ApiError(403, detail);

export function problemBody(status: number, detail: string | undefined, c: Context): Problem {
  return {
    type: `https://httpstatuses.io/${status}`,
    title: TITLES[status] ?? 'Error',
    status,
    ...(detail ? { detail } : {}),
    requestId: c.get('requestId') as string | undefined,
  };
}

export function problemResponse(
  c: Context,
  status: ContentfulStatusCode,
  detail: string | undefined,
  extra: Partial<Problem> = {},
  headers: Record<string, string> = {},
): Response {
  const body = { ...problemBody(status, detail, c), ...extra };
  // Built through the context (not `new Response`) so headers other middleware already set, such
  // as CORS and rate-limit headers, are carried onto error responses too.
  return c.newResponse(JSON.stringify(body), status, {
    'content-type': 'application/problem+json; charset=utf-8',
    ...headers,
  });
}

/** Zod issues → a flat, client-friendly list. */
export function issuesToErrors(error: z.ZodError): NonNullable<Problem['errors']> {
  return error.issues.map((i) => ({
    path: i.path.map(String).join('.') || '(root)',
    message: i.message,
  }));
}
