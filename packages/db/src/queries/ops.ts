import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client';
import { opportunities, partners, providers, reports } from '../schema';

export type ReportReason = 'closed' | 'scam' | 'misleading' | 'offensive' | 'other';

/** Returns false when the slug doesn't exist. No reporter identity is stored. */
export async function createReport(
  db: Database,
  input: { slug: string; reason: ReportReason; note?: string | undefined },
): Promise<boolean> {
  const [opp] = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(eq(opportunities.slug, input.slug))
    .limit(1);
  if (!opp) return false;
  await db.insert(reports).values({
    opportunityId: opp.id,
    reason: input.reason,
    note: input.note?.slice(0, 1000) ?? null,
  });
  return true;
}

export const hashApiKey = (key: string): string => createHash('sha256').update(key).digest('hex');

/** Create a partner and return the plaintext key ONCE. Only the hash is stored. */
export async function createPartner(
  db: Database,
  input: { providerId: string; name: string },
): Promise<{ id: string; apiKey: string }> {
  const apiKey = `unn_${randomBytes(24).toString('base64url')}`;
  const [row] = await db
    .insert(partners)
    .values({ providerId: input.providerId, name: input.name, apiKeyHash: hashApiKey(apiKey) })
    .returning({ id: partners.id });
  if (!row) throw new Error('Failed to create partner');
  return { id: row.id, apiKey };
}

export async function findPartnerByKey(db: Database, apiKey: string) {
  const [row] = await db
    .select({
      id: partners.id,
      name: partners.name,
      providerId: partners.providerId,
      provider: {
        id: providers.id,
        name: providers.name,
        licence: providers.licence,
        attribution: providers.attribution,
        attributionUrl: providers.attributionUrl,
        storagePolicy: providers.storagePolicy,
        isSample: providers.isSample,
      },
    })
    .from(partners)
    .innerJoin(providers, eq(providers.id, partners.providerId))
    .where(and(eq(partners.apiKeyHash, hashApiKey(apiKey)), isNull(partners.revokedAt)))
    .limit(1);
  return row ?? null;
}
