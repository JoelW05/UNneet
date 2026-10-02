import { SKILLS } from '@unneet/content';
import {
  type Database,
  expireUnseen,
  finishIngestRun,
  startIngestRun,
  type UpsertItem,
  type UpsertStats,
  upsertOpportunities,
  upsertProvider,
  upsertSkills,
} from '@unneet/db';
import { type OpportunityInput, OpportunityInputSchema } from '@unneet/domain';
import { createGeocoder } from './geo';
import { createHttp } from './http';
import { normalise } from './normalise';
import { SKILL_LABELS } from './skills';
import {
  type AdapterContext,
  type Env,
  type Logger,
  type ProviderAdapter,
  silentLogger,
} from './types';

export interface RunOptions {
  /** Map and validate but write nothing. Prints a preview, perfect for checking a new adapter. */
  dryRun?: boolean;
  /** Stop after N raw records. A limited run never expires listings. */
  limit?: number;
  now?: Date;
  env?: Env;
  logger?: Logger;
  batchSize?: number;
}

export interface RunReport {
  providerId: string;
  status: 'succeeded' | 'failed' | 'skipped';
  seen: number;
  valid: number;
  rejected: number;
  /** A few rejection reasons, so a broken mapping is obvious instead of silent. */
  rejectionSamples: string[];
  stats: UpsertStats | null;
  expired: number;
  error?: string;
  /** First few mapped listings (dry run only). */
  preview?: OpportunityInput[];
  durationMs: number;
}

/** If more than this share of records fail to map, something is wrong with the adapter or feed. */
export const MAX_REJECT_RATIO = 0.5;
const MIN_FOR_RATIO = 10;

/**
 * Run one provider end to end: fetch → map → validate → normalise → upsert → (maybe) expire,
 * with an audited `ingest_runs` row. Safe by construction:
 *   - an unconfigured provider is skipped, never failed;
 *   - invalid records are counted and sampled, never written;
 *   - listings are only expired after a COMPLETE, SUCCESSFUL, UNLIMITED run of a full feed.
 */
export async function runProvider(
  db: Database | null,
  adapter: ProviderAdapter,
  options: RunOptions = {},
): Promise<RunReport> {
  const started = Date.now();
  const logger = options.logger ?? silentLogger;
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true || db === null;
  const batchSize = options.batchSize ?? 200;

  const base: RunReport = {
    providerId: adapter.meta.id,
    status: 'succeeded',
    seen: 0,
    valid: 0,
    rejected: 0,
    rejectionSamples: [],
    stats: null,
    expired: 0,
    durationMs: 0,
  };
  const finish = (r: Partial<RunReport>): RunReport => ({
    ...base,
    ...r,
    durationMs: Date.now() - started,
  });

  if (!adapter.isConfigured(env)) {
    logger.warn(`Skipping ${adapter.meta.id}: not configured (missing API key or settings)`);
    if (!dryRun && db) {
      await upsertProvider(db, adapter.meta);
      const id = await startIngestRun(db, adapter.meta.id);
      await finishIngestRun(db, id, { status: 'skipped', reason: 'not configured' });
    }
    return finish({ status: 'skipped' });
  }

  const ctx: AdapterContext = {
    env,
    http: createHttp({ minIntervalMs: 250 }),
    // postcodes.io is a separate service with its own (generous) limits, so it gets its own pacing.
    geocoder: createGeocoder(createHttp({ minIntervalMs: 120 })),
    now,
    logger,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  };

  let runId: string | null = null;
  const stats: UpsertStats = { seen: 0, created: 0, updated: 0, unchanged: 0 };
  const rejectionSamples: string[] = [];
  const preview: OpportunityInput[] = [];
  let seen = 0;
  let valid = 0;
  let rejected = 0;
  let buffer: UpsertItem[] = [];

  const reject = (reason: string) => {
    rejected += 1;
    if (rejectionSamples.length < 5) rejectionSamples.push(reason);
  };

  const flush = async () => {
    if (buffer.length === 0 || dryRun || !db) {
      buffer = [];
      return;
    }
    const s = await upsertOpportunities(db, adapter.meta, buffer, {
      now,
      skillLabels: SKILL_LABELS,
    });
    stats.seen += s.seen;
    stats.created += s.created;
    stats.updated += s.updated;
    stats.unchanged += s.unchanged;
    buffer = [];
  };

  try {
    if (!dryRun && db) {
      await upsertProvider(db, adapter.meta);
      await upsertSkills(db, SKILLS);
      runId = await startIngestRun(db, adapter.meta.id);
    }

    for await (const raw of adapter.fetch(ctx)) {
      seen += 1;
      const mapped = adapter.map(raw, ctx);
      if (!mapped.ok) {
        reject(mapped.reason);
      } else {
        const parsed = OpportunityInputSchema.safeParse(mapped.input);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          reject(
            `${mapped.input.externalId}: ${issue?.path.join('.') ?? '?'} ${issue?.message ?? 'invalid'}`,
          );
        } else {
          valid += 1;
          const item = normalise(parsed.data);
          if (dryRun && preview.length < 5) preview.push(item.input);
          buffer.push(item);
          if (buffer.length >= batchSize) await flush();
        }
      }
      if (options.limit !== undefined && seen >= options.limit) break;
    }
    await flush();

    const ratio = seen === 0 ? 0 : rejected / seen;
    if (seen >= MIN_FOR_RATIO && ratio > MAX_REJECT_RATIO) {
      throw new Error(
        `Too many records failed to map (${rejected}/${seen}). Sample: ${rejectionSamples.join(' | ')}`,
      );
    }

    let expired = 0;
    const complete = adapter.fullFeed && options.limit === undefined;
    if (!dryRun && db && complete && seen > 0)
      expired = await expireUnseen(db, adapter.meta.id, now);

    if (!dryRun && db && runId) {
      await finishIngestRun(db, runId, { status: 'succeeded', stats, expired, rejected });
    }
    return finish({
      status: 'succeeded',
      seen,
      valid,
      rejected,
      rejectionSamples,
      stats: dryRun ? null : stats,
      expired,
      ...(dryRun ? { preview } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep the valid records we already have (a feed that dies at page 60 still gave us 59 good
    // pages). The run is still marked failed and nothing is expired.
    await flush().catch(() => undefined);
    logger.error(`Ingest failed for ${adapter.meta.id}`, { error: message });
    if (!dryRun && db && runId)
      await finishIngestRun(db, runId, { status: 'failed', error: message });
    return finish({ status: 'failed', seen, valid, rejected, rejectionSamples, error: message });
  }
}
