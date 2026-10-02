import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers';

let t: TestDb;
beforeAll(async () => {
  t = await startTestDb();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

describe('migrations', () => {
  it('create every table', async () => {
    const result = await t.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const names = result.rows.map((r) => r.table_name);
    for (const expected of [
      'opportunities',
      'providers',
      'skills',
      'opportunity_skills',
      'auth_user',
      'auth_session',
      'profiles',
      'saved_opportunities',
      'ingest_runs',
      'reports',
      'partners',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('install the search extensions', async () => {
    const result = await t.db.execute(sql`select extname from pg_extension`);
    const names = result.rows.map((r) => r.extname);
    expect(names).toEqual(expect.arrayContaining(['pg_trgm', 'cube', 'earthdistance']));
  });

  it('create the search indexes', async () => {
    const result = await t.db.execute(
      sql`select indexname from pg_indexes where tablename = 'opportunities'`,
    );
    const names = result.rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'opportunities_search_gin',
        'opportunities_title_trgm',
        'opportunities_geo_gist',
        'opportunities_slug_uq',
        'opportunities_provider_external_uq',
      ]),
    );
  });

  it('are idempotent (running again is a no-op)', async () => {
    const { runMigrations } = await import('../src/client');
    await expect(runMigrations(t.db)).resolves.toBeUndefined();
  });
});
