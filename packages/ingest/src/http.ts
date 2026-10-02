export const USER_AGENT = 'UnNEET/0.1 (+https://unneet.example/about/data; data@unneet.example)';

export interface HttpOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Retries on 429/5xx/network errors. */
  retries?: number;
  signal?: AbortSignal;
}

export interface Http {
  getJson<T = unknown>(url: string, options?: HttpOptions): Promise<T>;
  getText(url: string, options?: HttpOptions): Promise<string>;
  postJson<T = unknown>(url: string, body: unknown, options?: HttpOptions): Promise<T>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface CreateHttpOptions {
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Minimum gap between requests: a polite per-provider rate limit. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Added to every request (e.g. an API key header). */
  defaultHeaders?: Record<string, string>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polite HTTP client: honours Retry-After, retries 429/5xx with exponential backoff and jitter,
 * enforces a minimum interval between calls, times out every request, and identifies itself.
 */
export function createHttp(options: CreateHttpOptions = {}): Http {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const minInterval = options.minIntervalMs ?? 0;
  let lastCall = 0;

  async function send(
    url: string,
    init: { method: 'GET' | 'POST'; body?: string; accept: string },
    opts: HttpOptions,
  ): Promise<Response> {
    const retries = opts.retries ?? 3;
    let attempt = 0;
    for (;;) {
      const wait = lastCall + minInterval - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      try {
        const res = await doFetch(url, {
          method: init.method,
          ...(init.body !== undefined ? { body: init.body } : {}),
          headers: {
            accept: init.accept,
            ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
            'user-agent': USER_AGENT,
            ...options.defaultHeaders,
            ...opts.headers,
          },
          signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        });
        if (res.ok) return res;
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= retries) {
          throw new HttpError(`HTTP ${res.status} for ${redact(url)}`, res.status, url);
        }
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt),
        );
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (attempt >= retries) throw error;
        await sleep(backoff(attempt));
      }
      attempt += 1;
    }
  }

  return {
    async getJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
      const res = await send(url, { method: 'GET', accept: 'application/json' }, opts);
      return (await res.json()) as T;
    },
    async getText(url: string, opts: HttpOptions = {}): Promise<string> {
      const res = await send(url, { method: 'GET', accept: '*/*' }, opts);
      return res.text();
    },
    async postJson<T>(url: string, body: unknown, opts: HttpOptions = {}): Promise<T> {
      const res = await send(
        url,
        { method: 'POST', body: JSON.stringify(body), accept: 'application/json' },
        opts,
      );
      return (await res.json()) as T;
    },
  };
}

const backoff = (attempt: number): number =>
  Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);

/** Never put API keys in logs or error messages. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ['app_key', 'api_key', 'apikey', 'key', 'token']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '***');
    }
    return u.toString();
  } catch {
    return url;
  }
}
