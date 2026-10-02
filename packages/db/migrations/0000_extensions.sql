-- Extensions the search relies on. All three ship with PostgreSQL contrib, are available on
-- managed Postgres (Neon, Supabase, RDS, Cloud SQL) and in PGlite.
--   pg_trgm       typo-tolerant title search (similarity, gin_trgm_ops)
--   cube          multi-dimensional point type (dependency of earthdistance)
--   earthdistance great-circle radius search (ll_to_earth, earth_box, earth_distance)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS cube;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS earthdistance;
