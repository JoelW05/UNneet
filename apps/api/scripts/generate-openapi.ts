/**
 * `pnpm --filter @unneet/api openapi:generate` — write apps/api/openapi.json.
 *
 * The spec is built from the same route definitions that serve requests, so it cannot drift from
 * the code. CI regenerates it and fails if the committed file differs; the typed API client is
 * generated from it. No database or network is touched: handlers are never run.
 */
import { writeFileSync } from 'node:fs';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { createLogger } from '../src/logger';
import type { Deps } from '../src/types';

const env = loadEnv({ NODE_ENV: 'test', WEB_ORIGIN: 'https://unneet.example' });
const unused = new Proxy({}, { get: () => () => undefined }) as never;

const deps: Deps = {
  env,
  db: unused,
  logger: createLogger({ level: 'silent' }),
  auth: unused,
  email: unused,
  locations: unused,
  federated: unused,
  now: () => new Date('2026-01-01T00:00:00Z'),
};

const app = createApp(deps);
const res = await app.request('/openapi.json');
if (!res.ok) throw new Error(`Could not generate the OpenAPI document: HTTP ${res.status}`);
const doc = (await res.json()) as { paths?: Record<string, unknown> };

const target = new URL('../openapi.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`);
console.info(`Wrote openapi.json (${Object.keys(doc.paths ?? {}).length} paths)`);
