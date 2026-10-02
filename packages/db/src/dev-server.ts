import { PGlite } from '@electric-sql/pglite';
import { cube } from '@electric-sql/pglite/contrib/cube';
import { earthdistance } from '@electric-sql/pglite/contrib/earthdistance';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export interface DevDatabase {
  /** A normal `postgres://` URL. Any pg client or psql can connect. */
  url: string;
  port: number;
  stop(): Promise<void>;
}

export interface DevDatabaseOptions {
  /** Directory for persistence. Omit for a throwaway in-memory database (tests). */
  dataDir?: string;
  /** 0 = let the OS choose a free port (tests). */
  port?: number;
  host?: string;
  /**
   * Concurrent client connections. PGlite is single-connection; the socket server queues queries
   * from many clients. The library default is 1, which resets any second pool connection.
   */
  maxConnections?: number;
}

/**
 * Real PostgreSQL (WASM) served over the wire protocol: no Docker, no install. Supports the
 * extensions the app needs: pg_trgm (typo-tolerant search), cube + earthdistance (radius search).
 *
 * Caveat: PGlite is single-connection (clients are multiplexed). Great for dev and tests; use real
 * Postgres in production.
 */
export async function startDevDatabase(options: DevDatabaseOptions = {}): Promise<DevDatabase> {
  const host = options.host ?? '127.0.0.1';
  const db = await PGlite.create({
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
    extensions: { pg_trgm, cube, earthdistance },
  });
  const server = new PGLiteSocketServer({
    db,
    port: options.port ?? 0,
    host,
    maxConnections: options.maxConnections ?? 20,
  });
  await server.start();

  const address = server.getServerConn();
  const port = Number(address.split(':').pop());

  return {
    url: `postgres://postgres:postgres@${host}:${port}/postgres`,
    port,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
