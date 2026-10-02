import { CURATED_OPPORTUNITIES, CURATED_PROVIDER } from '@unneet/content';
import type { OpportunityInput } from '@unneet/domain';
import type { Mapped, ProviderAdapter } from '../types';

/** Editorial front doors (national schemes, free learning, support). Always available, no key. */
export const curatedAdapter: ProviderAdapter = {
  meta: CURATED_PROVIDER,
  fullFeed: true,
  isConfigured: () => true,
  async *fetch() {
    for (const o of CURATED_OPPORTUNITIES) yield o;
  },
  map(raw): Mapped {
    return { ok: true, input: raw as OpportunityInput };
  },
};
