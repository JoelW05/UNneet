import { createDb, type DbHandle, runMigrations } from '../src/client';
import { type DevDatabase, startDevDatabase } from '../src/dev-server';

export interface TestDb extends DbHandle {
  dev: DevDatabase;
  url: string;
  stop(): Promise<void>;
}

/**
 * A throwaway, fully migrated PostgreSQL for one test file. It speaks the real wire protocol and
 * uses the same driver as production, so tests exercise FTS, trigram and earthdistance for real.
 */
export async function startTestDb(): Promise<TestDb> {
  const dev = await startDevDatabase({});
  const handle = createDb(dev.url, { max: 2, applicationName: 'unneet-test' });
  await runMigrations(handle.db);
  return {
    ...handle,
    dev,
    url: dev.url,
    async stop() {
      await handle.close();
      await dev.stop();
    },
  };
}
