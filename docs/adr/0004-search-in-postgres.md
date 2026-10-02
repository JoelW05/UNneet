# ADR-0004: Search and geo in PostgreSQL (FTS + trigram + earthdistance); PGlite for dev

- Status: accepted · Date: 2026-10-01

## Context
The corpus is modest (10⁴–10⁶ rows), filters are mostly structured, text relevance matters, typos are
common (young users, mobile keyboards), and radius search is essential. Running Elasticsearch/Algolia
adds cost and a second source of truth. Postgres supports weighted full-text, `pg_trgm` and geo
([hybrid search](https://paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual),
[Drizzle FTS](https://orm.drizzle.team/docs/guides/postgresql-full-text-search)).

## Decision
- Weighted generated `tsvector` (GIN), `pg_trgm` GIN on title, `cube`+`earthdistance` GiST on
  `ll_to_earth(lat, lon)`, `unaccent` text-search config. PostGIS is **not** used: it is heavy in PGlite and
  unnecessary for point-radius queries.
- Dev/test DB is **PGlite exposed over the wire protocol** (`@electric-sql/pglite-socket`), so every
  process uses the same `postgres://` URL and the same driver as production. Caveat: PGlite is
  single-connection (clients are multiplexed) — fine for dev, not a production topology
  ([docs](https://pglite.dev/docs/pglite-socket)). CI runs a real `postgres:17` service container.
- `pgvector` is reserved for phase 3 semantic matching; schema keeps an optional `embedding` column off by default.

## Consequences
+ Zero-install dev; one datastore; transactional ingest; simple ops.
− Must tune queries as data grows (EXPLAIN reviews, partial indexes on `status='live'`).
− Postgres-specific SQL (acceptable; it's the stated platform).
