/**
 * `pnpm db:stats` — what is in the catalogue, by provider, type, sector and region. Run it after
 * an ingest: a provider that dropped to zero, or a sector that vanished, shows up immediately.
 */
import { createDb, DEV_DATABASE_URL } from '../src/client';
import { catalogueStats } from '../src/queries/stats';

const handle = createDb(process.env.DATABASE_URL ?? DEV_DATABASE_URL, {
  max: 1,
  applicationName: 'unneet-stats',
});
try {
  const s = await catalogueStats(handle.db);
  const table = (title: string, rows: Array<{ value: string; count: number }>) => {
    console.info(`\n${title}`);
    for (const r of rows) console.info(`  ${String(r.count).padStart(7)}  ${r.value}`);
  };
  console.info(
    `Open now: ${s.open}   Live (incl. past closing date): ${s.live}   Findable by distance: ${s.locatable}`,
  );
  console.info('\nBy provider');
  for (const p of s.byProvider)
    console.info(
      `  ${String(p.open).padStart(7)}  ${p.name}${p.isSample ? '  [SAMPLE DATA]' : ''}`,
    );
  table('By pillar', s.byPillar);
  table('By type', s.byType);
  table('By sector', s.bySector);
  table('By region', s.byRegion);
} finally {
  await handle.close();
}
