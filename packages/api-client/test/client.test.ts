import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, unwrap } from '../src';

describe('createApiClient', () => {
  it('calls typed paths with query parameters and parses JSON', async () => {
    const seen: string[] = [];
    const api = createApiClient({
      baseUrl: 'https://api.test',
      fetch: async (request: Request) => {
        seen.push(request.url);
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const result = await api.GET('/health');
    expect(unwrap(result)).toEqual({ status: 'ok' });
    await api.GET('/v1/opportunities', { params: { query: { q: 'care', near: 'Leeds' } } });
    expect(seen[1]).toBe('https://api.test/v1/opportunities?q=care&near=Leeds');
  });
});

describe('unwrap', () => {
  it('turns a problem+json error into an ApiError with field errors', async () => {
    const api = createApiClient({
      baseUrl: 'https://api.test',
      fetch: async () =>
        new Response(
          JSON.stringify({
            type: 'https://httpstatuses.io/422',
            title: 'Validation failed',
            status: 422,
            detail: 'Some of the details you sent are not valid.',
            errors: [{ path: 'ageConfirmed', message: 'Please confirm you are 16 or over.' }],
          }),
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
    });
    const result = await api.POST('/v1/auth/otp', {
      body: { email: 'a@b.co', ageConfirmed: false },
    });
    try {
      unwrap(result);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const e = error as ApiError;
      expect(e.status).toBe(422);
      expect(e.message).toContain('not valid');
      expect(e.fieldErrors).toEqual({ ageConfirmed: 'Please confirm you are 16 or over.' });
    }
  });
});
