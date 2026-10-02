import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** Max pool size. Keep small for the PGlite dev server (it multiplexes one connection). */
  max?: number;
  applicationName?: string;
  /** Kill any query running longer than this (ms). Protects the API from pathological searches. */
  statementTimeoutMs?: number;
  onError?: (error: Error) => void;
}

/**
 * One `postgres://` URL for every environment: the PGlite dev server, CI's Postgres service
 * container and production all speak the same wire protocol, so there is exactly one driver.
 */
export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'unneet',
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle client erroring must not crash the process.
  pool.on('error', (error) => options.onError?.(error));
  const db = drizzle(pool, { schema, casing: undefined });
  return { db, pool, close: () => pool.end() };
}

export const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export async function runMigrations(
  db: Database,
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}

export const DEV_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:54329/postgres';
