import { serve } from '@hono/node-server';
import { createDb, runMigrations, schema } from '@unneet/db';
import { createHttp, findAdapter, type Logger as IngestLogger, runProvider } from '@unneet/ingest';
import { eq, sql } from 'drizzle-orm';
import { createApp } from './app';
import { EnvError, loadEnv } from './env';
import { createAuth } from './lib/auth';
import { createConsoleEmailSender, createResendEmailSender, type EmailSender } from './lib/email';
import { createFederatedGateway, noopGateway } from './lib/federated-gateway';
import { createPostcodesIoResolver } from './lib/locations';
import { createLogger, type Logger } from './logger';
import type { IngestStart } from './types';

let env: ReturnType<typeof loadEnv>;
try {
  env = loadEnv();
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger({ level: env.logLevel, pretty: !env.isProduction });
const handle = createDb(env.databaseUrl, {
  max: env.isProduction ? 10 : 6,
  applicationName: 'unneet-api',
  statementTimeoutMs: 15_000,
  onError: (error) => logger.error({ err: error.message }, 'database pool error'),
});

/** Demo listings must never reach real users by accident. */
async function refuseSampleDataInProduction(): Promise<void> {
  if (!env.isProduction || env.allowSampleData) return;
  const rows = await handle.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.opportunities)
    .innerJoin(schema.providers, eq(schema.providers.id, schema.opportunities.providerId))
    .where(eq(schema.providers.isSample, true));
  if ((rows[0]?.n ?? 0) > 0) {
    logger.fatal(
      'Sample (demo) listings are in the production database. Remove them, or set ALLOW_SAMPLE_DATA=true if that is intended.',
    );
    process.exit(1);
  }
}

if (env.autoMigrate) {
  logger.info('applying migrations');
  await runMigrations(handle.db);
}
await refuseSampleDataInProduction();

const email: EmailSender = env.resendApiKey
  ? createResendEmailSender({ apiKey: env.resendApiKey, from: env.emailFrom })
  : createConsoleEmailSender(logger);
if (!env.resendApiKey)
  logger.warn('RESEND_API_KEY not set: sign-in codes are printed to this console');

const auth = createAuth({ db: handle.db, env, email, logger });
const http = createHttp({ minIntervalMs: 0 });
const federated = Object.values(env.providerEnv).some(Boolean)
  ? createFederatedGateway({ env: env.providerEnv, http, logger })
  : noopGateway;

/** The ingest package logs `(message, data)`; pino wants `(data, message)`. */
const ingestLogger = (log: Logger): IngestLogger => ({
  info: (m, d) => log.info(d ?? {}, m),
  warn: (m, d) => log.warn(d ?? {}, m),
  error: (m, d) => log.error(d ?? {}, m),
});

const running = new Set<string>();
function startIngest(
  providerId: string,
  options: { limit?: number; dryRun?: boolean },
): IngestStart {
  const adapter = findAdapter(providerId);
  if (!adapter) return { status: 'unknown-provider' };
  if (running.has(providerId)) return { status: 'already-running' };
  running.add(providerId);
  void runProvider(handle.db, adapter, {
    env: { ...env.providerEnv },
    logger: ingestLogger(logger),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.dryRun ? { dryRun: true } : {}),
  })
    .then((report) =>
      logger.info(
        {
          provider: providerId,
          status: report.status,
          seen: report.seen,
          rejected: report.rejected,
          ms: report.durationMs,
        },
        'ingest finished',
      ),
    )
    .catch((error: unknown) =>
      logger.error(
        { provider: providerId, err: error instanceof Error ? error.message : String(error) },
        'ingest crashed',
      ),
    )
    .finally(() => running.delete(providerId));
  return { status: 'started' };
}

const app = createApp({
  env,
  db: handle.db,
  logger,
  auth,
  email,
  locations: createPostcodesIoResolver(),
  federated,
  now: () => new Date(),
  startIngest,
});

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info(
    { port: info.port, env: env.nodeEnv, docs: `http://localhost:${info.port}/docs` },
    'UnNEET API listening',
  );
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await handle.close();
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error(
    { err: reason instanceof Error ? reason.message : String(reason) },
    'unhandled rejection',
  );
});
