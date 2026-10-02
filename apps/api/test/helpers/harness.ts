import { createDb, type DbHandle, runMigrations, schema, upsertProvider } from '@unneet/db';
import { type DevDatabase, startDevDatabase } from '@unneet/db/dev-server';
import type { ProviderMeta } from '@unneet/domain';
import { curatedAdapter, runProvider, sampleAdapter } from '@unneet/ingest';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/env';
import { createAuth } from '../../src/lib/auth';
import { createCapturingEmailSender } from '../../src/lib/email';
import { type FederatedGateway, noopGateway } from '../../src/lib/federated-gateway';
import { createStaticResolver } from '../../src/lib/locations';
import { MemoryRateLimitStore } from '../../src/lib/rate-limiter';
import { createLogger } from '../../src/logger';
import type { Deps, IngestStart } from '../../src/types';

export const WEB_ORIGIN = 'https://unneet.example';
/** A fixed "today" so timeline output and closing dates are deterministic. */
export const NOW = new Date('2026-10-01T12:00:00Z');

export const PLACES = {
  leeds: { lat: 53.7965, lon: -1.5476, label: 'Leeds', outcode: 'LS1' },
  'ls1 4ap': { lat: 53.7957, lon: -1.5459, label: 'LS1 (Leeds)', outcode: 'LS1' },
  manchester: { lat: 53.4808, lon: -2.2426, label: 'Manchester', outcode: 'M1' },
  london: { lat: 51.5072, lon: -0.1276, label: 'London', outcode: 'EC1' },
};

export interface Harness {
  app: ReturnType<typeof createApp>;
  deps: Deps;
  handle: DbHandle;
  email: ReturnType<typeof createCapturingEmailSender>;
  ingestCalls: Array<{ providerId: string; options: object }>;
  setIngestResult(result: IngestStart): void;
  stop(): Promise<void>;
  /** Fetch helper: JSON in, parsed response out. */
  call(
    path: string,
    init?: RequestInit & { json?: unknown; cookie?: string; ip?: string },
  ): Promise<{ status: number; headers: Headers; body: any; text: string }>;
}

export interface HarnessOptions {
  env?: Record<string, string | undefined>;
  federated?: FederatedGateway;
  /** Load the curated programmes and the labelled sample listings. Default true. */
  seed?: boolean;
  rateLimitStore?: MemoryRateLimitStore;
}

/**
 * The whole API over a real (in-memory) PostgreSQL: real migrations, real search SQL, real
 * Better Auth. Only the outside world is faked: e-mail, geocoding, partner job boards, the clock.
 */
export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const dev: DevDatabase = await startDevDatabase({});
  const handle = createDb(dev.url, { max: 4 });
  await runMigrations(handle.db);

  if (options.seed !== false) {
    await runProvider(handle.db, curatedAdapter, { now: NOW });
    await runProvider(handle.db, sampleAdapter, { now: NOW, env: { ALLOW_SAMPLE_DATA: 'true' } });
  }

  // TRUST_PROXY lets tests pose as different clients with an X-Forwarded-For header.
  const env = loadEnv({ NODE_ENV: 'test', WEB_ORIGIN, TRUST_PROXY: 'true', ...options.env });
  const logger = createLogger({ level: 'silent' });
  const email = createCapturingEmailSender();
  const auth = createAuth({ db: handle.db, env, email, logger });

  const ingestCalls: Harness['ingestCalls'] = [];
  let ingestResult: IngestStart = { status: 'started' };

  const deps: Deps = {
    env,
    db: handle.db,
    logger,
    auth,
    email,
    locations: createStaticResolver(PLACES),
    federated: options.federated ?? noopGateway,
    now: () => NOW,
    startIngest: (providerId, opts) => {
      ingestCalls.push({ providerId, options: opts });
      return ingestResult;
    },
  };
  const app = createApp(deps, {
    rateLimitStore: options.rateLimitStore ?? new MemoryRateLimitStore(),
  });

  return {
    app,
    deps,
    handle,
    email,
    ingestCalls,
    setIngestResult: (r) => {
      ingestResult = r;
    },
    async stop() {
      await handle.close();
      await dev.stop();
    },
    async call(path, init = {}) {
      const { json, cookie, ip, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (json !== undefined) headers.set('content-type', 'application/json');
      if (cookie) headers.set('cookie', cookie);
      if (ip) headers.set('x-forwarded-for', ip);
      const res = await app.request(path, {
        ...rest,
        headers,
        ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // not JSON (e.g. an .ics file): leave as text
      }
      return { status: res.status, headers: res.headers, body, text };
    },
  };
}

/** Ensure a provider row exists and issue a partner key for it. */
export async function makePartner(
  handle: DbHandle,
  meta: Partial<ProviderMeta> & Pick<ProviderMeta, 'id' | 'name'>,
): Promise<string> {
  const { createPartner } = await import('@unneet/db');
  const provider: ProviderMeta = {
    licence: 'Partner agreement',
    attribution: `Listing supplied by ${meta.name}.`,
    attributionUrl: null,
    storagePolicy: 'store',
    isSample: false,
    requiresKey: false,
    ...meta,
  };
  await upsertProvider(handle.db, provider);
  const { apiKey } = await createPartner(handle.db, {
    providerId: provider.id,
    name: provider.name,
  });
  return apiKey;
}

/** Sign in through the real e-mail-code flow and return the session cookie header. */
export async function signIn(h: Harness, email: string): Promise<string> {
  const ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const sent = await h.call('/v1/auth/otp', {
    method: 'POST',
    json: { email, ageConfirmed: true },
    headers: { origin: WEB_ORIGIN },
    ip,
  });
  if (sent.status !== 200) throw new Error(`could not request a code: ${sent.status} ${sent.text}`);
  const otp = h.email.lastOtpFor(email);
  if (!otp) throw new Error('no sign-in code was emailed');
  const res = await h.app.request('/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, 'x-forwarded-for': ip },
    body: JSON.stringify({ email, otp }),
  });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

export { schema };
