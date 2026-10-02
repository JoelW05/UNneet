import { desc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { ingestRuns } from '../schema';
import type { UpsertStats } from './upsert';

export async function startIngestRun(db: Database, providerId: string): Promise<string> {
  const [row] = await db
    .insert(ingestRuns)
    .values({ providerId, status: 'running' })
    .returning({ id: ingestRuns.id });
  if (!row) throw new Error('Failed to create ingest run');
  return row.id;
}

export async function finishIngestRun(
  db: Database,
  id: string,
  result:
    | { status: 'succeeded'; stats: UpsertStats; expired: number; rejected: number }
    | { status: 'failed'; error: string }
    | { status: 'skipped'; reason: string },
): Promise<void> {
  const base = { finishedAt: new Date() };
  if (result.status === 'succeeded') {
    await db
      .update(ingestRuns)
      .set({
        ...base,
        status: 'succeeded',
        seen: result.stats.seen,
        created: result.stats.created,
        updated: result.stats.updated,
        unchanged: result.stats.unchanged,
        expired: result.expired,
        rejected: result.rejected,
      })
      .where(eq(ingestRuns.id, id));
  } else if (result.status === 'failed') {
    await db
      .update(ingestRuns)
      .set({ ...base, status: 'failed', error: result.error.slice(0, 2000) })
      .where(eq(ingestRuns.id, id));
  } else {
    await db
      .update(ingestRuns)
      .set({ ...base, status: 'skipped', error: result.reason })
      .where(eq(ingestRuns.id, id));
  }
}

export async function latestRunPerProvider(db: Database) {
  return db.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(50);
}
