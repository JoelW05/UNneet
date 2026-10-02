import type { ProviderMeta, SkillDef } from '@unneet/domain';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { opportunities, opportunitySkills, providers, skills } from '../schema';
import { type NewOpportunityRow, toRow, type UpsertItem } from './mappers';

export interface UpsertStats {
  seen: number;
  created: number;
  updated: number;
  unchanged: number;
}

const CHUNK = 200;
const chunks = <T>(items: readonly T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function upsertProvider(db: Database, provider: ProviderMeta): Promise<void> {
  await db
    .insert(providers)
    .values({
      id: provider.id,
      name: provider.name,
      licence: provider.licence,
      attribution: provider.attribution,
      attributionUrl: provider.attributionUrl,
      storagePolicy: provider.storagePolicy,
      isSample: provider.isSample,
    })
    .onConflictDoUpdate({
      target: providers.id,
      set: {
        name: provider.name,
        licence: provider.licence,
        attribution: provider.attribution,
        attributionUrl: provider.attributionUrl,
        storagePolicy: provider.storagePolicy,
        isSample: provider.isSample,
      },
    });
}

export async function upsertSkills(db: Database, defs: readonly SkillDef[]): Promise<void> {
  for (const batch of chunks(defs)) {
    await db
      .insert(skills)
      .values(
        batch.map((s) => ({
          id: s.id,
          label: s.label,
          category: s.category,
          escoUri: s.escoUri ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: skills.id,
        set: {
          label: sql`excluded.label`,
          category: sql`excluded.category`,
          escoUri: sql`excluded.esco_uri`,
        },
      });
  }
}

export interface UpsertOptions {
  now?: Date;
  /** id → label, used to build search keywords for each listing's skills. */
  skillLabels?: ReadonlyMap<string, string>;
}

/**
 * Idempotent, transactional write of a batch of listings for ONE provider.
 *
 * - Keyed by (provider, externalId). Re-running with the same data changes nothing but `last_seen_at`.
 * - A content hash lets unchanged rows skip the (index-heavy) full update.
 * - Seen rows are resurrected to `live`, so a listing that disappears then returns recovers by itself.
 */
export async function upsertOpportunities(
  db: Database,
  provider: ProviderMeta,
  items: readonly UpsertItem[],
  options: UpsertOptions = {},
): Promise<UpsertStats> {
  const now = options.now ?? new Date();
  const skillLabels = options.skillLabels ?? new Map<string, string>();
  const stats: UpsertStats = { seen: items.length, created: 0, updated: 0, unchanged: 0 };
  if (items.length === 0) return stats;

  // De-duplicate within the batch (last one wins): providers sometimes repeat a listing.
  const byExternal = new Map<string, UpsertItem>();
  for (const item of items) byExternal.set(item.input.externalId, item);
  const unique = [...byExternal.values()];

  await db.transaction(async (tx) => {
    const existing = new Map<string, { id: string; hash: string }>();
    for (const batch of chunks(unique)) {
      const rows = await tx
        .select({
          id: opportunities.id,
          externalId: opportunities.externalId,
          hash: opportunities.contentHash,
        })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.providerId, provider.id),
            inArray(
              opportunities.externalId,
              batch.map((b) => b.input.externalId),
            ),
          ),
        );
      for (const r of rows) existing.set(r.externalId, { id: r.id, hash: r.hash });
    }

    const toInsert: Array<{ item: UpsertItem; row: NewOpportunityRow }> = [];
    const toUpdate: Array<{ id: string; item: UpsertItem; row: NewOpportunityRow }> = [];
    const unchangedIds: string[] = [];

    for (const item of unique) {
      const row = toRow(provider, item, skillLabels, now);
      const prior = existing.get(item.input.externalId);
      if (!prior) toInsert.push({ item, row });
      else if (prior.hash !== row.contentHash) toUpdate.push({ id: prior.id, item, row });
      else unchangedIds.push(prior.id);
    }

    const linkRows: Array<{ opportunityId: string; skillId: string }> = [];

    for (const batch of chunks(toInsert)) {
      const inserted = await tx
        .insert(opportunities)
        .values(batch.map((b) => b.row))
        .returning({ id: opportunities.id, externalId: opportunities.externalId });
      const idByExternal = new Map(inserted.map((r) => [r.externalId, r.id]));
      for (const { item } of batch) {
        const id = idByExternal.get(item.input.externalId);
        if (id) for (const skillId of item.skillIds) linkRows.push({ opportunityId: id, skillId });
      }
    }
    stats.created = toInsert.length;

    for (const { id, item, row } of toUpdate) {
      // slug is stable for the life of the row (URLs must not change); everything else refreshes.
      const { slug: _slug, ...rest } = row;
      await tx
        .update(opportunities)
        .set({ ...rest, firstSeenAt: undefined })
        .where(eq(opportunities.id, id));
      await tx.delete(opportunitySkills).where(eq(opportunitySkills.opportunityId, id));
      for (const skillId of item.skillIds) linkRows.push({ opportunityId: id, skillId });
    }
    stats.updated = toUpdate.length;

    for (const batch of chunks(unchangedIds)) {
      await tx
        .update(opportunities)
        .set({ lastSeenAt: now, status: 'live' })
        .where(inArray(opportunities.id, batch));
    }
    stats.unchanged = unchangedIds.length;

    for (const batch of chunks(linkRows)) {
      await tx.insert(opportunitySkills).values(batch).onConflictDoNothing();
    }
  });

  return stats;
}

/**
 * Mark a provider's listings that were NOT seen in this run as expired. Only call this after a
 * *complete, successful* fetch of a full feed; never after a partial or failed run.
 */
export async function expireUnseen(
  db: Database,
  providerId: string,
  runStartedAt: Date,
): Promise<number> {
  const rows = await db
    .update(opportunities)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.providerId, providerId),
        eq(opportunities.status, 'live'),
        lt(opportunities.lastSeenAt, runStartedAt),
      ),
    )
    .returning({ id: opportunities.id });
  return rows.length;
}
