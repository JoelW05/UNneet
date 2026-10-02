import type { OpportunityCard, ResolvedSearch } from '@unneet/domain';
import type { Http } from '@unneet/ingest';
import {
  FEDERATED_PROVIDERS,
  type FederatedProvider,
  type FederatedQuery,
} from '@unneet/ingest/federated';
import type { Logger } from '../logger';

export interface ExternalResults {
  items: OpportunityCard[];
  attributions: Array<{ providerName: string; text: string; url: string | null }>;
}

export interface FederatedGateway {
  search(query: ResolvedSearch, locationText: string | undefined): Promise<ExternalResults>;
}

export const NO_EXTERNAL: ExternalResults = { items: [], attributions: [] };

/** Disabled gateway: used when no provider key is configured and in most tests. */
export const noopGateway: FederatedGateway = {
  async search() {
    return NO_EXTERNAL;
  },
};

export interface Budget {
  perMinute: number;
  perDay: number;
}

export interface GatewayOptions {
  providers?: readonly FederatedProvider[];
  env: Readonly<Record<string, string | undefined>>;
  http: Http;
  logger: Logger;
  now?: () => number;
  /** Per-provider call budgets, kept under each provider's published limits. */
  budgets?: Readonly<Record<string, Budget>>;
  /** Hard cap on how long a search waits for partner boards. */
  timeoutMs?: number;
  /** Cap on cache lifetime; each provider's own `maxCacheSeconds` still applies. */
  cacheSeconds?: number;
  maxResults?: number;
}

const DEFAULT_BUDGET: Budget = { perMinute: 30, perDay: 1000 };
/** Adzuna's published defaults are 25/min and 250/day; stay clearly under them. */
const DEFAULT_BUDGETS: Readonly<Record<string, Budget>> = {
  adzuna: { perMinute: 20, perDay: 200 },
};

const BREAKER_FAILURES = 3;
const BREAKER_COOLDOWN_MS = 60_000;

interface CacheEntry {
  expires: number;
  items: OpportunityCard[];
}

interface ProviderState {
  minute: { windowStart: number; count: number };
  day: { windowStart: number; count: number };
  failures: number;
  openUntil: number;
}

/**
 * Job boards whose terms don't let us mirror their listings (policy `cache`). We query them at
 * request time, cache briefly, never write to the database, and link straight out. A partner
 * being slow, down or over budget must never degrade our own search, so every failure is
 * swallowed (and logged) and the whole thing is time-boxed.
 */
export function createFederatedGateway(options: GatewayOptions): FederatedGateway {
  const now = options.now ?? Date.now;
  const providers = (options.providers ?? FEDERATED_PROVIDERS).filter((p) =>
    p.isConfigured(options.env),
  );
  const timeoutMs = options.timeoutMs ?? 3000;
  const maxResults = options.maxResults ?? 10;
  const cache = new Map<string, CacheEntry>();
  const states = new Map<string, ProviderState>();
  const log = options.logger;

  const stateOf = (id: string): ProviderState => {
    let s = states.get(id);
    if (!s) {
      s = {
        minute: { windowStart: 0, count: 0 },
        day: { windowStart: 0, count: 0 },
        failures: 0,
        openUntil: 0,
      };
      states.set(id, s);
    }
    return s;
  };

  /** Consume one call from the provider's minute and day budgets; false when exhausted. */
  function takeBudget(id: string, t: number): boolean {
    const budget = options.budgets?.[id] ?? DEFAULT_BUDGETS[id] ?? DEFAULT_BUDGET;
    const s = stateOf(id);
    if (t - s.minute.windowStart >= 60_000) s.minute = { windowStart: t, count: 0 };
    if (t - s.day.windowStart >= 86_400_000) s.day = { windowStart: t, count: 0 };
    if (s.minute.count >= budget.perMinute || s.day.count >= budget.perDay) return false;
    s.minute.count += 1;
    s.day.count += 1;
    return true;
  }

  function remember(key: string, entry: CacheEntry): void {
    if (cache.size >= 500) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, entry);
  }

  async function withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function ask(
    provider: FederatedProvider,
    query: FederatedQuery,
  ): Promise<OpportunityCard[]> {
    const id = provider.meta.id;
    const t = now();
    const state = stateOf(id);
    if (state.openUntil > t) return [];

    const key = `${id}|${JSON.stringify(query)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > t) return hit.items;

    if (!takeBudget(id, t)) {
      log.warn({ provider: id }, 'federated provider budget exhausted; skipping');
      return [];
    }
    try {
      const result = await withTimeout(
        provider.search(query, { env: options.env, http: options.http, now: new Date(t) }),
      );
      state.failures = 0;
      const ttl = Math.min(provider.maxCacheSeconds, options.cacheSeconds ?? 900) * 1000;
      remember(key, { items: result.items, expires: t + ttl });
      return result.items;
    } catch (error) {
      state.failures += 1;
      if (state.failures >= BREAKER_FAILURES) state.openUntil = t + BREAKER_COOLDOWN_MS;
      log.warn(
        { provider: id, err: error instanceof Error ? error.message : String(error) },
        'federated provider failed; search continues without it',
      );
      return [];
    }
  }

  return {
    async search(query, locationText) {
      if (providers.length === 0 || !isEligible(query)) return NO_EXTERNAL;

      const federatedQuery: FederatedQuery = {
        keywords: query.q,
        location: locationText,
        distanceMiles: locationText ? query.radius : undefined,
        minSalary: query.payMin,
        page: 1,
        pageSize: maxResults,
      };
      const settled = await Promise.all(
        providers.map(async (p) => ({ provider: p, items: await ask(p, federatedQuery) })),
      );

      const wanted = query.sector?.length ? new Set<string>(query.sector) : null;
      const items: OpportunityCard[] = [];
      const shown = new Set<FederatedProvider>();
      // Interleave providers so one board can't crowd out the other.
      const lists = settled.map((s) => ({
        provider: s.provider,
        cards: s.items.filter(
          (card) => !wanted || (card.sector !== null && wanted.has(card.sector)),
        ),
      }));
      for (let i = 0; items.length < maxResults && lists.some((l) => i < l.cards.length); i++) {
        for (const { provider, cards } of lists) {
          const card = cards[i];
          if (card && items.length < maxResults) {
            items.push(card);
            shown.add(provider);
          }
        }
      }
      // Required attribution is owed for every provider that actually appears in the results.
      const attributions: ExternalResults['attributions'] = [...shown].map((provider) => ({
        providerName: provider.meta.name,
        text: provider.meta.attribution,
        url: provider.meta.attributionUrl,
      }));
      return { items, attributions };
    },
  };
}

/**
 * Partner job boards only make sense for a targeted, job-shaped, first-page search. Anything that
 * implies something they don't carry (courses, free-only, qualification levels) skips them.
 */
export function isEligible(query: ResolvedSearch): boolean {
  if (!query.q && !query.centre) return false;
  if (query.page > 1) return false;
  if (query.type?.length && !query.type.includes('job')) return false;
  if (query.pillar?.length && !query.pillar.includes('employment')) return false;
  if (query.free || query.costMax !== undefined) return false;
  if (query.levelMin !== undefined || query.levelMax !== undefined) return false;
  if (query.workMode?.length && !query.workMode.some((m) => m === 'onsite' || m === 'hybrid'))
    return false;
  return true;
}
