/**
 * `pnpm db:dev` — start a local PostgreSQL (PGlite) on 127.0.0.1:54329, apply migrations, and
 * keep running. Data persists in <repo>/.data/pg (delete the folder to reset).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, runMigrations } from '../src/client';
import { startDevDatabase } from '../src/dev-server';

const PORT = Number(process.env.DEV_DB_PORT ?? 54329);
const dataDir = resolve(import.meta.dirname, '../../../.data/pg');
mkdirSync(dataDir, { recursive: true });

const database = await startDevDatabase({ dataDir, port: PORT });
console.info(`PostgreSQL (PGlite) ready: ${database.url}`);
console.info(`Data directory: ${dataDir}`);

const handle = createDb(database.url, { max: 1, applicationName: 'unneet-migrate' });
await runMigrations(handle.db);
await handle.close();
console.info('Migrations applied. Press Ctrl+C to stop.');

const shutdown = async () => {
  await database.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
