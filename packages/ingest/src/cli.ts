/**
 * Ingest CLI.
 *
 *   pnpm ingest                                  every configured real provider
 *   pnpm ingest -- --provider curated            one provider
 *   pnpm ingest -- --provider find-an-apprenticeship --dry-run --limit 20
 *   pnpm ingest -- --provider partner-feed --file feed.json --partner-id my-college --partner-name "My College"
 *
 * Exit code 1 if any provider run failed (so a scheduler/CI alerts), 0 otherwise. Providers that
 * aren't configured are SKIPPED, never failed.
 */
import { parseArgs } from 'node:util';
import { createDb, DEV_DATABASE_URL } from '@unneet/db';
import { createJsonFeedAdapter } from './adapters/json-feed';
import { type RunReport, runProvider } from './pipeline';
import { defaultAdapters, findAdapter } from './registry';
import { consoleLogger, type ProviderAdapter } from './types';

// pnpm forwards the `--` in `pnpm ingest -- --provider x` to the script. Left in, it would end
// option parsing and every flag (including --dry-run!) would be silently ignored.
const argv = process.argv.slice(2).filter((arg) => arg !== '--');

const { values } = parseArgs({
  args: argv,
  options: {
    provider: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    file: { type: 'string' },
    'partner-id': { type: 'string' },
    'partner-name': { type: 'string' },
  },
  allowPositionals: true,
  strict: false,
});

const dryRun = values['dry-run'] === true;
const limit = values.limit ? Number(values.limit) : undefined;
const requested = (values.provider as string[] | undefined) ?? [];

function selectAdapters(): ProviderAdapter[] {
  if (requested.length === 0) return defaultAdapters(process.env);
  return requested.map((id): ProviderAdapter => {
    if (id === 'partner-feed') {
      const file = values.file as string | undefined;
      const partnerId = values['partner-id'] as string | undefined;
      const partnerName = values['partner-name'] as string | undefined;
      if (!file || !partnerId || !partnerName) {
        throw new Error('partner-feed needs --file, --partner-id and --partner-name');
      }
      return createJsonFeedAdapter({
        meta: { id: `partner-${partnerId}`, name: partnerName },
        source: file,
      });
    }
    const adapter = findAdapter(id);
    if (!adapter) throw new Error(`Unknown provider "${id}"`);
    return adapter;
  });
}

function print(report: RunReport): void {
  const line = `${report.status.toUpperCase().padEnd(9)} ${report.providerId.padEnd(26)} seen ${report.seen} · valid ${report.valid} · rejected ${report.rejected}${
    report.stats
      ? ` · +${report.stats.created} ~${report.stats.updated} =${report.stats.unchanged} · expired ${report.expired}`
      : ''
  } · ${(report.durationMs / 1000).toFixed(1)}s`;
  console.info(line);
  if (report.error) console.error(`  error: ${report.error}`);
  for (const sample of report.rejectionSamples) console.warn(`  rejected: ${sample}`);
  if (report.preview) {
    console.info(`  preview (${report.preview.length}):`);
    for (const p of report.preview)
      console.info(`    • [${p.type}] ${p.title} @ ${p.organisation.name} → ${p.applyUrl}`);
  }
}

const adapters = selectAdapters();
const handle = dryRun
  ? null
  : createDb(process.env.DATABASE_URL?.trim() || DEV_DATABASE_URL, {
      max: 4,
      applicationName: 'unneet-ingest',
    });

let failed = 0;
try {
  for (const adapter of adapters) {
    const report = await runProvider(handle?.db ?? null, adapter, {
      dryRun,
      ...(limit !== undefined ? { limit } : {}),
      logger: consoleLogger,
    });
    print(report);
    if (report.status === 'failed') failed += 1;
  }
} finally {
  await handle?.close();
}
process.exit(failed > 0 ? 1 : 0);
