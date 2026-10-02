import { createDb, type DbHandle, runMigrations, schema, searchOpportunities } from '@unneet/db';
import { type DevDatabase, startDevDatabase } from '@unneet/db/dev-server';
import { type OpportunityInput, resolveDefaults } from '@unneet/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { curatedAdapter } from '../src/adapters/curated';
import { createJsonFeedAdapter } from '../src/adapters/json-feed';
import { sampleAdapter } from '../src/adapters/sample';
import { runProvider } from '../src/pipeline';
import type { Mapped, ProviderAdapter } from '../src/types';

let dev: DevDatabase;
let handle: DbHandle;

beforeAll(async () => {
  dev = await startDevDatabase({});
  handle = createDb(dev.url, { max: 3 });
  await runMigrations(handle.db);
}, 60_000);
afterAll(async () => {
  await handle?.close();
  await dev?.stop();
});

const valid = (id: string): OpportunityInput => ({
  externalId: id,
  type: 'job',
  title: `Warehouse Operative ${id}`,
  description: 'Pick and pack orders. No experience needed.',
  organisation: { name: 'Millbrook Ltd' },
  applyUrl: `https://example.com/${id}`,
  location: { label: 'Leeds', workMode: 'onsite' },
});

/** A configurable fake provider for pipeline behaviour tests. */
function fakeAdapter(
  id: string,
  records: unknown[],
  opts: { fullFeed?: boolean; configured?: boolean; throwAfter?: number } = {},
): ProviderAdapter {
  return {
    meta: {
      id,
      name: id,
      licence: 'test',
      attribution: 'test',
      attributionUrl: null,
      storagePolicy: 'store',
      isSample: false,
      requiresKey: false,
    },
    fullFeed: opts.fullFeed ?? true,
    isConfigured: () => opts.configured ?? true,
    async *fetch() {
      let i = 0;
      for (const r of records) {
        if (opts.throwAfter !== undefined && i >= opts.throwAfter)
          throw new Error('upstream exploded');
        i += 1;
        yield r;
      }
    },
    map: (raw): Mapped =>
      typeof raw === 'object' && raw !== null && 'externalId' in raw
        ? { ok: true, input: raw as OpportunityInput }
        : { ok: false, reason: 'unmappable record' },
  };
}

describe('runProvider', () => {
  it('ingests the curated programmes end to end and makes them searchable', async () => {
    const report = await runProvider(handle.db, curatedAdapter);
    expect(report.status).toBe('succeeded');
    expect(report.rejected).toBe(0);
    expect(report.stats?.created).toBe(report.seen);

    const result = await searchOpportunities(handle.db, resolveDefaults({ q: 'careers advice' }));
    expect(result.items.some((i) => i.title.includes('National Careers Service'))).toBe(true);
    const support = await searchOpportunities(handle.db, resolveDefaults({ type: ['support'] }));
    expect(support.total).toBeGreaterThanOrEqual(10);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const second = await runProvider(handle.db, curatedAdapter);
    expect(second.stats).toMatchObject({ created: 0, updated: 0, unchanged: second.seen });
    expect(second.expired).toBe(0);
  });

  it('loads sample data flagged as sample', async () => {
    const report = await runProvider(handle.db, sampleAdapter);
    expect(report.status).toBe('succeeded');
    const found = await searchOpportunities(handle.db, resolveDefaults({ q: 'Sample' }), {
      facets: false,
    });
    expect(found.items.length).toBeGreaterThan(0);
    expect(found.items.every((i) => i.source.isSample || i.source.providerId !== 'sample')).toBe(
      true,
    );
    const sampleItems = (
      await searchOpportunities(handle.db, resolveDefaults({ pageSize: 50 }), { facets: false })
    ).items.filter((i) => i.source.providerId === 'sample');
    expect(sampleItems.every((i) => i.source.isSample)).toBe(true);
  });

  it('expires listings that vanish from a complete feed', async () => {
    const a = fakeAdapter('feed-expire', [valid('a'), valid('b'), valid('c')]);
    await runProvider(handle.db, a);
    const smaller = fakeAdapter('feed-expire', [valid('a'), valid('b')]);
    const report = await runProvider(handle.db, smaller, { now: new Date(Date.now() + 1000) });
    expect(report.expired).toBe(1);
    const [gone] = await handle.db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.externalId, 'c'));
    expect(gone?.status).toBe('expired');
  });

  it('never expires after a limited run, a delta feed, or a failure', async () => {
    await runProvider(handle.db, fakeAdapter('feed-safe', [valid('a'), valid('b'), valid('c')]));
    const limited = await runProvider(handle.db, fakeAdapter('feed-safe', [valid('a')]), {
      limit: 1,
      now: new Date(Date.now() + 1000),
    });
    expect(limited.expired).toBe(0);
    const delta = await runProvider(
      handle.db,
      fakeAdapter('feed-safe', [valid('a')], { fullFeed: false }),
      { now: new Date(Date.now() + 2000) },
    );
    expect(delta.expired).toBe(0);
    const failing = await runProvider(
      handle.db,
      fakeAdapter('feed-safe', [valid('a'), valid('b')], { throwAfter: 1 }),
      { now: new Date(Date.now() + 3000) },
    );
    expect(failing.status).toBe('failed');
    expect(failing.error).toContain('upstream exploded');
    const live = await handle.db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.providerId, 'feed-safe'));
    expect(live.every((r) => r.status === 'live')).toBe(true);
  });

  it('fails safe when most records cannot be mapped (a broken adapter must not wipe the catalogue)', async () => {
    const records = [valid('ok-1'), ...Array.from({ length: 11 }, (_, i) => ({ garbage: i }))];
    const report = await runProvider(handle.db, fakeAdapter('feed-broken', records));
    expect(report.status).toBe('failed');
    expect(report.error).toMatch(/Too many records failed to map/);
    expect(report.rejectionSamples[0]).toBe('unmappable record');
    expect(report.expired).toBe(0);
  });

  it('counts schema-invalid records as rejections with a readable reason', async () => {
    const bad = { ...valid('bad'), applyUrl: 'http://not-secure.example' };
    const report = await runProvider(handle.db, fakeAdapter('feed-invalid', [valid('good'), bad]));
    expect(report.valid).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.rejectionSamples[0]).toMatch(/bad: applyUrl/);
  });

  it('skips unconfigured providers instead of failing', async () => {
    const report = await runProvider(
      handle.db,
      fakeAdapter('needs-key', [valid('x')], { configured: false }),
    );
    expect(report.status).toBe('skipped');
    const rows = await handle.db
      .select()
      .from(schema.ingestRuns)
      .where(eq(schema.ingestRuns.providerId, 'needs-key'));
    expect(rows[0]?.status).toBe('skipped');
  });

  it('dry run writes nothing and returns a preview', async () => {
    const report = await runProvider(
      handle.db,
      fakeAdapter('dry-run', [valid('d1'), valid('d2')]),
      { dryRun: true },
    );
    expect(report.status).toBe('succeeded');
    expect(report.preview).toHaveLength(2);
    expect(report.stats).toBeNull();
    const rows = await handle.db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.providerId, 'dry-run'));
    expect(rows).toEqual([]);
  });

  it('audits every run in ingest_runs', async () => {
    const runs = await handle.db
      .select()
      .from(schema.ingestRuns)
      .where(eq(schema.ingestRuns.providerId, 'curated'));
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.every((r) => r.finishedAt !== null)).toBe(true);
  });

  it('imports a partner JSON feed as a delta', async () => {
    const { writeFile, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'unneet-feed-'));
    const file = join(dir, 'feed.json');
    await writeFile(file, JSON.stringify([valid('p1'), { nope: true }]));
    const adapter = createJsonFeedAdapter({
      meta: { id: 'partner-test-college', name: 'Test College' },
      source: file,
    });
    const report = await runProvider(handle.db, adapter);
    expect(report.status).toBe('succeeded');
    expect(report.valid).toBe(1);
    expect(report.rejected).toBe(1);
    expect(adapter.fullFeed).toBe(false);
  });
});
