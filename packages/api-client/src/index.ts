import createClient, { type Client, type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './schema';

export type { components, paths } from './schema';
export type Schemas = components['schemas'];

export type ApiClient = Client<paths>;

/**
 * A fully typed client: paths, query parameters, request bodies and responses all come from the
 * API's OpenAPI document, so a change to the API that would break the website is a compile error.
 *
 *   const api = createApiClient({ baseUrl: 'https://unneet.example' });
 *   const { data, error } = await api.GET('/v1/opportunities', { params: { query: { q: 'care' } } });
 */
export function createApiClient(options: ClientOptions = {}): ApiClient {
  return createClient<paths>(options);
}

/** The RFC 9457 problem body every API error carries. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  requestId?: string;
  errors?: Array<{ path: string; message: string }>;
}

/** A thrown API failure, for code that prefers exceptions to `{ data, error }` pairs. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
    message?: string,
  ) {
    super(message ?? problem?.detail ?? problem?.title ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }

  /** Field-level problems keyed by path, ready to show next to form fields. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem?.errors ?? []).map((e) => [e.path, e.message]));
  }
}

/** Unwrap an openapi-fetch result: return the data or throw an `ApiError`. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  const error = result.error;
  const problem =
    error && typeof error === 'object' && 'status' in error ? (error as Problem) : null;
  throw new ApiError(result.response.status, problem);
}
