/** `pnpm db:migrate` — apply pending migrations to DATABASE_URL (defaults to the local dev DB). */
import { createDb, DEV_DATABASE_URL, runMigrations } from '../src/client';

const url = process.env.DATABASE_URL ?? DEV_DATABASE_URL;
const handle = createDb(url, { max: 1, applicationName: 'unneet-migrate' });
try {
  await runMigrations(handle.db);
  console.info('Migrations applied.');
} finally {
  await handle.close();
}
