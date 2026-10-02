import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { opportunities, providers } from '../schema';

const o = opportunities;

export interface CountBy {
  value: string;
  count: number;
}

export interface CatalogueStats {
  /** Listings people can act on now: live and not past their closing date. */
  open: number;
  /** Everything we hold as live (including ones whose closing date has passed). */
  live: number;
  /** Open listings with coordinates, i.e. findable by distance. */
  locatable: number;
  byPillar: CountBy[];
  byType: CountBy[];
  bySector: CountBy[];
  byRegion: CountBy[];
  byProvider: Array<{ providerId: string; name: string; isSample: boolean; open: number }>;
}

const count = sql<number>`count(*)::int`;

const sorted = (rows: Array<{ value: string | null; count: number }>): CountBy[] =>
  rows
    .map((r) => ({ value: r.value ?? 'unknown', count: r.count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/**
 * What is in the catalogue right now: counts by pillar, type, sector, region and provider.
 * Backs the public `/v1/stats` ("12,000 opportunities") and the operator `db:stats` report that
 * makes a bad ingest (one provider suddenly at zero, a sector that vanished) visible.
 */
export async function catalogueStats(
  db: Database,
  now: Date = new Date(),
): Promise<CatalogueStats> {
  const open = and(eq(o.status, 'live'), or(isNull(o.closesAt), gte(o.closesAt, now)));

  const [totals, pillar, type, sector, region, provider] = await Promise.all([
    db
      .select({
        live: sql<number>`count(*) filter (where ${o.status} = 'live')::int`,
        open: sql<number>`count(*) filter (where ${open})::int`,
        locatable: sql<number>`count(*) filter (where ${open} and ${o.lat} is not null and ${o.lon} is not null)::int`,
      })
      .from(o),
    db.select({ value: o.pillar, count }).from(o).where(open).groupBy(o.pillar),
    db.select({ value: o.type, count }).from(o).where(open).groupBy(o.type),
    db.select({ value: o.sector, count }).from(o).where(open).groupBy(o.sector),
    db.select({ value: o.region, count }).from(o).where(open).groupBy(o.region),
    db
      .select({
        providerId: providers.id,
        name: providers.name,
        isSample: providers.isSample,
        open: sql<number>`count(${o.id}) filter (where ${open})::int`,
      })
      .from(providers)
      .leftJoin(o, eq(o.providerId, providers.id))
      .groupBy(providers.id, providers.name, providers.isSample),
  ]);

  return {
    open: totals[0]?.open ?? 0,
    live: totals[0]?.live ?? 0,
    locatable: totals[0]?.locatable ?? 0,
    byPillar: sorted(pillar),
    byType: sorted(type),
    bySector: sorted(sector),
    byRegion: sorted(region),
    byProvider: provider.sort((a, b) => b.open - a.open),
  };
}
