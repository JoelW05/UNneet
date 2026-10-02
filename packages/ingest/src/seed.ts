/**
 * `pnpm db:seed` — load the curated programmes (always) and sample demo listings (non-production,
 * or when ALLOW_SAMPLE_DATA=true) into the database named by DATABASE_URL.
 */
import { createDb, DEV_DATABASE_URL } from '@unneet/db';
import { curatedAdapter } from './adapters/curated';
import { sampleAdapter } from './adapters/sample';
import { runProvider } from './pipeline';
import { consoleLogger } from './types';

const production = process.env.NODE_ENV === 'production';
const includeSample = !production || process.env.ALLOW_SAMPLE_DATA === 'true';

const handle = createDb(process.env.DATABASE_URL?.trim() || DEV_DATABASE_URL, {
  max: 2,
  applicationName: 'unneet-seed',
});
try {
  for (const adapter of [curatedAdapter, ...(includeSample ? [sampleAdapter] : [])]) {
    const report = await runProvider(handle.db, adapter, { logger: consoleLogger });
    console.info(
      `${report.status.toUpperCase()} ${report.providerId}: seen ${report.seen}, created ${report.stats?.created ?? 0}, updated ${report.stats?.updated ?? 0}, unchanged ${report.stats?.unchanged ?? 0}${report.rejected ? `, REJECTED ${report.rejected}` : ''}`,
    );
    for (const sample of report.rejectionSamples) console.warn(`  rejected: ${sample}`);
    if (report.status === 'failed') process.exitCode = 1;
  }
  if (!includeSample)
    console.info('Sample data skipped (production). Set ALLOW_SAMPLE_DATA=true to include it.');
} finally {
  await handle.close();
}
