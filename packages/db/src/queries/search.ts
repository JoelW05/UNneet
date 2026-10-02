import {
  type FacetBucket,
  type Facets,
  MILES_TO_METRES,
  type OpportunityCard,
  type OpportunityDetail,
  type ResolvedSearch,
  type SkillRef,
} from '@unneet/domain';
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { opportunities, opportunitySkills, providers, skills } from '../schema';
import { type CardRow, rowToCard, rowToDetail } from './mappers';

const o = opportunities;

type FacetKey = 'pillar' | 'type' | 'sector' | 'level' | 'workMode';

/**
 * All filters as SQL conditions. `omit` drops one facet's own filter, which is how *disjunctive*
 * facet counts work: selecting "Care" must still show how many "Digital" results exist, so the
 * sector facet is counted with every filter EXCEPT sector. (Algolia/Baymard-style filter UX.)
 */
function buildWhere(q: ResolvedSearch, now: Date, omit?: FacetKey): SQL {
  const c: Array<SQL | undefined> = [eq(o.status, 'live')];

  if (q.openOnly !== false) c.push(or(isNull(o.closesAt), gte(o.closesAt, now)));
  if (omit !== 'pillar' && q.pillar?.length) c.push(inArray(o.pillar, q.pillar));
  if (omit !== 'type' && q.type?.length) c.push(inArray(o.type, q.type));
  if (omit !== 'sector' && q.sector?.length) c.push(inArray(o.sector, q.sector));
  if (omit !== 'workMode' && q.workMode?.length) c.push(inArray(o.workMode, q.workMode));
  if (omit !== 'level') {
    // NULL level never satisfies a level filter: unknown level is not "any level".
    if (q.levelMin !== undefined) c.push(gte(o.level, q.levelMin));
    if (q.levelMax !== undefined) c.push(lte(o.level, q.levelMax));
  }

  if (q.qualified !== undefined)
    c.push(or(isNull(o.minEntryLevel), lte(o.minEntryLevel, q.qualified)));
  if (q.free) c.push(eq(o.isFree, true));
  if (q.costMax !== undefined) c.push(or(eq(o.isFree, true), lte(o.costAmount, q.costMax)));
  if (q.payMin !== undefined)
    c.push(sql`coalesce(${o.annualPayMax}, ${o.annualPayMin}) >= ${q.payMin}`);
  if (q.age !== undefined) {
    c.push(or(isNull(o.minAge), lte(o.minAge, q.age)));
    c.push(or(isNull(o.maxAge), gte(o.maxAge, q.age)));
  }
  if (q.noExperience) {
    c.push(or(eq(o.experienceRequired, false), sql`'no-experience' = ANY(${o.tags})`));
  }

  if (q.q) {
    // Full-text OR trigram-similar title: stems and phrases ("care assistant"), and typos ("carer assitant").
    c.push(sql`(${o.search} @@ websearch_to_tsquery('english', ${q.q}) OR ${o.title} % ${q.q})`);
  }

  if (q.centre) c.push(geoCondition(q.centre, q.radius));
  return and(...c) as SQL;
}

function earthPoint(lat: number, lon: number): SQL {
  return sql`ll_to_earth(${lat}, ${lon})`;
}

/** Within radius, OR doable remotely / anywhere (those don't have a meaningful distance). */
function geoCondition(centre: { lat: number; lon: number }, radiusMiles: number): SQL {
  const metres = radiusMiles * MILES_TO_METRES;
  const here = earthPoint(centre.lat, centre.lon);
  return sql`(
    ${o.workMode} in ('remote', 'nationwide')
    OR (
      ${o.lat} is not null AND ${o.lon} is not null
      AND earth_box(${here}, ${metres}) @> ll_to_earth(${o.lat}, ${o.lon})
      AND earth_distance(${here}, ll_to_earth(${o.lat}, ${o.lon})) <= ${metres}
    )
  )`;
}

function distanceExpr(centre: { lat: number; lon: number } | undefined): SQL<number | null> {
  if (!centre) return sql<number | null>`null`;
  return sql<number | null>`case
    when ${o.lat} is not null and ${o.lon} is not null and ${o.workMode} not in ('remote', 'nationwide')
    then earth_distance(${earthPoint(centre.lat, centre.lon)}, ll_to_earth(${o.lat}, ${o.lon})) / ${MILES_TO_METRES}
  end`;
}

function orderBy(q: ResolvedSearch, distance: SQL<number | null>): SQL[] {
  const newest = [sql`${o.postedAt} desc nulls last`, desc(o.firstSeenAt), asc(o.id)];
  switch (q.sort) {
    case 'relevance': {
      if (!q.q) return newest;
      const rank = sql`(ts_rank_cd(${o.search}, websearch_to_tsquery('english', ${q.q})) * 2 + similarity(${o.title}, ${q.q}))`;
      return [sql`${rank} desc`, ...newest];
    }
    case 'newest':
      return newest;
    case 'closing':
      return [sql`${o.closesAt} asc nulls last`, ...newest];
    case 'distance':
      return [sql`${distance} asc nulls last`, ...newest];
    case 'pay':
      return [sql`coalesce(${o.annualPayMax}, ${o.annualPayMin}) desc nulls last`, ...newest];
    case 'cost':
      return [desc(o.isFree), sql`${o.costAmount} asc nulls last`, ...newest];
  }
}

async function loadSkills(db: Database, ids: readonly string[]): Promise<Map<string, SkillRef[]>> {
  const map = new Map<string, SkillRef[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ opportunityId: opportunitySkills.opportunityId, id: skills.id, label: skills.label })
    .from(opportunitySkills)
    .innerJoin(skills, eq(skills.id, opportunitySkills.skillId))
    .where(inArray(opportunitySkills.opportunityId, [...ids]));
  for (const r of rows) {
    const list = map.get(r.opportunityId) ?? [];
    list.push({ id: r.id, label: r.label });
    map.set(r.opportunityId, list);
  }
  return map;
}

const PROVIDER_COLUMNS = {
  id: providers.id,
  name: providers.name,
  licence: providers.licence,
  attribution: providers.attribution,
  attributionUrl: providers.attributionUrl,
  isSample: providers.isSample,
} as const;

export interface SearchResult {
  items: OpportunityCard[];
  total: number;
  facets: Facets;
}

export interface SearchOptions {
  now?: Date;
  /** Skip facet queries (used by internal candidate retrieval). */
  facets?: boolean;
}

const EMPTY_FACETS: Facets = {
  pillar: [],
  type: [],
  sector: [],
  level: [],
  workMode: [],
  free: 0,
  total: 0,
};

/**
 * The search. One page of results + total + disjunctive facet counts. All inputs are parameterised
 * (Drizzle `sql` tags bind every interpolation); free text only ever reaches Postgres as a bound
 * parameter of websearch_to_tsquery, which accepts arbitrary user input without syntax errors.
 */
export async function searchOpportunities(
  db: Database,
  query: ResolvedSearch,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const now = options.now ?? new Date();
  const where = buildWhere(query, now);
  const distance = distanceExpr(query.centre);

  const pageQuery = db
    .select({ o, p: PROVIDER_COLUMNS, distance })
    .from(o)
    .innerJoin(providers, eq(providers.id, o.providerId))
    .where(where)
    .orderBy(...orderBy(query, distance))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const totalQuery = db.select({ n: sql<number>`count(*)::int` }).from(o).where(where);

  const wantFacets = options.facets !== false;
  const [rows, totalRows, facets] = await Promise.all([
    pageQuery,
    totalQuery,
    wantFacets ? computeFacets(db, query, now) : Promise.resolve(EMPTY_FACETS),
  ]);

  const skillMap = await loadSkills(
    db,
    rows.map((r) => r.o.id),
  );
  const items = rows.map((r) =>
    rowToCard(
      { o: r.o, p: r.p },
      skillMap.get(r.o.id) ?? [],
      r.distance === null ? null : Number(r.distance),
    ),
  );
  const total = totalRows[0]?.n ?? 0;
  return { items, total, facets: { ...facets, total } };
}

async function computeFacets(db: Database, q: ResolvedSearch, now: Date): Promise<Facets> {
  const count = sql<number>`count(*)::int`;
  const bucket = (rows: Array<{ value: string | null; count: number }>): FacetBucket[] =>
    rows
      .filter((r): r is { value: string; count: number } => r.value !== null)
      .map((r) => ({ value: r.value, count: r.count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const [pillar, type, sector, level, workMode, free] = await Promise.all([
    db
      .select({ value: o.pillar, count })
      .from(o)
      .where(buildWhere(q, now, 'pillar'))
      .groupBy(o.pillar),
    db
      .select({ value: o.type, count })
      .from(o)
      .where(buildWhere(q, now, 'type'))
      .groupBy(o.type),
    db
      .select({ value: o.sector, count })
      .from(o)
      .where(buildWhere(q, now, 'sector'))
      .groupBy(o.sector),
    db
      .select({ value: sql<string | null>`${o.level}::text`, count })
      .from(o)
      .where(buildWhere(q, now, 'level'))
      .groupBy(o.level),
    db
      .select({ value: o.workMode, count })
      .from(o)
      .where(buildWhere(q, now, 'workMode'))
      .groupBy(o.workMode),
    db
      .select({ n: count })
      .from(o)
      .where(and(buildWhere(q, now), eq(o.isFree, true))),
  ]);

  return {
    pillar: bucket(pillar),
    type: bucket(type),
    sector: bucket(sector),
    // Levels read best in numeric order, not by count.
    level: bucket(level).sort((a, b) => Number(a.value) - Number(b.value)),
    workMode: bucket(workMode),
    free: free[0]?.n ?? 0,
    total: 0,
  };
}

export async function getOpportunityBySlug(
  db: Database,
  slug: string,
): Promise<OpportunityDetail | null> {
  const [row] = await db
    .select({ o, p: PROVIDER_COLUMNS })
    .from(o)
    .innerJoin(providers, eq(providers.id, o.providerId))
    .where(and(eq(o.slug, slug), ne(o.status, 'removed')))
    .limit(1);
  if (!row) return null;
  const skillMap = await loadSkills(db, [row.o.id]);
  return rowToDetail({ o: row.o, p: row.p } satisfies CardRow, skillMap.get(row.o.id) ?? []);
}

/** Same-sector / same-type neighbours, preferring open listings. */
export async function similarOpportunities(
  db: Database,
  slug: string,
  limit = 6,
  now: Date = new Date(),
): Promise<OpportunityCard[]> {
  const [base] = await db
    .select({ id: o.id, sector: o.sector, type: o.type })
    .from(o)
    .where(eq(o.slug, slug))
    .limit(1);
  if (!base) return [];

  const sectorScore = base.sector
    ? sql`(case when ${o.sector} = ${base.sector} then 2 else 0 end)`
    : sql`0`;
  const typeScore = sql`(case when ${o.type} = ${base.type} then 1 else 0 end)`;
  const rows = await db
    .select({ o, p: PROVIDER_COLUMNS })
    .from(o)
    .innerJoin(providers, eq(providers.id, o.providerId))
    .where(
      and(
        eq(o.status, 'live'),
        ne(o.id, base.id),
        or(isNull(o.closesAt), gte(o.closesAt, now)),
        base.sector ? or(eq(o.sector, base.sector), eq(o.type, base.type)) : eq(o.type, base.type),
      ),
    )
    .orderBy(sql`${sectorScore} + ${typeScore} desc`, sql`${o.postedAt} desc nulls last`, asc(o.id))
    .limit(limit);
  const skillMap = await loadSkills(
    db,
    rows.map((r) => r.o.id),
  );
  return rows.map((r) => rowToCard({ o: r.o, p: r.p }, skillMap.get(r.o.id) ?? []));
}

/** Count of live listings per provider (health/admin and staleness checks). */
export async function liveCountsByProvider(
  db: Database,
): Promise<Array<{ providerId: string; live: number }>> {
  return db
    .select({ providerId: o.providerId, live: sql<number>`count(*)::int` })
    .from(o)
    .where(eq(o.status, 'live'))
    .groupBy(o.providerId);
}
