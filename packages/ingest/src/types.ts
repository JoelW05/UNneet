import type { OpportunityInput, ProviderMeta } from '@unneet/domain';
import type { Geocoder } from './geo';
import type { Http } from './http';

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export type Env = Readonly<Record<string, string | undefined>>;

export interface AdapterContext {
  env: Env;
  http: Http;
  /** Postcode / place → coordinates. Best-effort: absent results mean 'unknown', never an error. */
  geocoder: Geocoder;
  now: Date;
  logger: Logger;
  /** Stop after this many raw records (for dry runs and tests). */
  limit?: number;
}

/** A mapped record, or the reason we couldn't map it (counted and sampled in the run report). */
export type Mapped = { ok: true; input: OpportunityInput } | { ok: false; reason: string };

/**
 * A source of listings we are allowed to STORE (policy `store`).
 * `cache`/`live` providers implement `FederatedProvider` instead and are never written to the DB.
 */
export interface ProviderAdapter {
  meta: ProviderMeta;
  /**
   * True when one run returns the provider's COMPLETE live catalogue, so listings not seen in a
   * successful run can be expired. False for incremental or partial feeds.
   */
  fullFeed: boolean;
  isConfigured(env: Env): boolean;
  /** Yield raw provider records (any shape). */
  fetch(ctx: AdapterContext): AsyncIterable<unknown>;
  /** Pure mapping to our canonical input. Unit-tested against recorded fixtures. */
  map(raw: unknown, ctx: AdapterContext): Mapped;
}

export const consoleLogger: Logger = {
  info: (m, d) => console.info(m, d ?? ''),
  warn: (m, d) => console.warn(m, d ?? ''),
  error: (m, d) => console.error(m, d ?? ''),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
