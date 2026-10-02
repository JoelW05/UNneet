import { z } from 'zod';

/**
 * How a provider's data may be used. Decided per source from its licence/terms. See
 * docs/adr/0003-provider-storage-policy.md.
 *  - store: open licence → ingest on a schedule, persist, index
 *  - cache: request-time query with a short TTL; never written to the opportunity table
 *  - live:  pass-through only
 */
export const STORAGE_POLICIES = ['store', 'cache', 'live'] as const;
export const StoragePolicySchema = z.enum(STORAGE_POLICIES);
export type StoragePolicy = z.infer<typeof StoragePolicySchema>;

export const ProviderMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  licence: z.string().min(1),
  /** Text the UI must show wherever this provider's results appear. */
  attribution: z.string().min(1),
  attributionUrl: z.string().url().nullable(),
  storagePolicy: StoragePolicySchema,
  /** Sample/demo data is labelled in the UI and refused in production unless explicitly allowed. */
  isSample: z.boolean().default(false),
  requiresKey: z.boolean().default(false),
});
export type ProviderMeta = z.infer<typeof ProviderMetaSchema>;
