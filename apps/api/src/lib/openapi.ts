import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { issuesToErrors, ProblemSchema, problemResponse } from '../errors';
import type { AppEnv } from '../types';

/** JSON success response. */
export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

/** RFC 9457 error response. */
export const problem = (description: string) => ({
  content: { 'application/problem+json': { schema: ProblemSchema } },
  description,
});

/** Every route can answer these. */
export const commonErrors = {
  422: problem('The request did not pass validation.'),
  429: problem('Too many requests. See the Retry-After header.'),
} as const;

/**
 * A router whose validation failures use our problem+json shape. Query/param/body validation
 * errors are the caller's mistake (422), never a 500.
 */
export function newRouter(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problemResponse(c, 422, 'Some of the details you sent are not valid.', {
          errors: issuesToErrors(result.error),
        });
      }
      return undefined;
    },
  });
}
