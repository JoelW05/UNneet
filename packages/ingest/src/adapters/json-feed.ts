import { readFile } from 'node:fs/promises';
import {
  type OpportunityInput,
  OpportunityInputSchema,
  type ProviderMeta,
  ProviderMetaSchema,
} from '@unneet/domain';
import { z } from 'zod';
import type { AdapterContext, Mapped, ProviderAdapter } from '../types';

/**
 * Partner feed: a JSON file (or https URL) containing OpportunityInput[]. This is how colleges,
 * training providers and employers add supply beyond what public APIs expose. The same schema
 * backs `POST /v1/partner/opportunities`.
 *
 *   pnpm ingest -- --provider partner-feed --file ./college-feed.json --partner-id my-college --partner-name "My College"
 *
 * `fullFeed` is false: a partner file is a delta, so absent listings are NOT expired.
 */
export function createJsonFeedAdapter(options: {
  meta?: Partial<ProviderMeta> & Pick<ProviderMeta, 'id' | 'name'>;
  source: string;
}): ProviderAdapter {
  const meta = ProviderMetaSchema.parse({
    licence: 'Supplied by the listing organisation under a partner agreement',
    attribution: `Listing supplied by ${options.meta?.name ?? 'the provider'}.`,
    attributionUrl: null,
    storagePolicy: 'store',
    isSample: false,
    requiresKey: false,
    ...options.meta,
  });
  return {
    meta,
    fullFeed: false,
    isConfigured: () => true,
    async *fetch(ctx: AdapterContext) {
      let text: string;
      if (options.source.startsWith('https://')) {
        const res = await fetch(options.source, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`);
        text = await res.text();
      } else {
        text = await readFile(options.source, 'utf8');
      }
      const data = z.array(z.unknown()).parse(JSON.parse(text));
      ctx.logger.info(`Feed contains ${data.length} records`);
      for (const record of data) yield record;
    },
    map(raw): Mapped {
      const parsed = OpportunityInputSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return {
          ok: false,
          reason: `${issue?.path.join('.') ?? '?'}: ${issue?.message ?? 'invalid'}`,
        };
      }
      return { ok: true, input: parsed.data as OpportunityInput };
    },
  };
}
