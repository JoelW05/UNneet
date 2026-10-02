import type { OpportunityCard, ProviderMeta } from '@unneet/domain';
import type { Http } from '../http';
import type { Env } from '../types';

export interface FederatedQuery {
  keywords?: string | undefined;
  location?: string | undefined;
  distanceMiles?: number | undefined;
  /** Annual GBP. */
  minSalary?: number | undefined;
  page: number;
  pageSize: number;
}

export interface FederatedContext {
  env: Env;
  http: Http;
  now: Date;
  signal?: AbortSignal;
}

export interface FederatedResult {
  items: OpportunityCard[];
  total: number;
}

/**
 * A provider whose terms don't let us mirror its data (storage policy `cache` or `live`). It is
 * queried at request time, results are merged into search responses, and nothing is written to
 * our database. Cards carry `externalUrl` so they link straight out, plus the provider's required
 * attribution. See docs/adr/0003-provider-storage-policy.md.
 */
export interface FederatedProvider {
  meta: ProviderMeta;
  /** Longest time (seconds) results may be cached, per the provider's terms. */
  maxCacheSeconds: number;
  isConfigured(env: Env): boolean;
  search(query: FederatedQuery, ctx: FederatedContext): Promise<FederatedResult>;
}
