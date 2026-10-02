import type { Database } from '@unneet/db';
import type { ProviderMeta } from '@unneet/domain';
import type { Env } from './env';
import type { Auth } from './lib/auth';
import type { EmailSender } from './lib/email';
import type { FederatedGateway } from './lib/federated-gateway';
import type { LocationResolver } from './lib/locations';
import type { Logger } from './logger';

export type IngestStart =
  | { status: 'started' }
  | { status: 'already-running' }
  | { status: 'unknown-provider' };

/** Everything the app needs from the outside world. Tests build this with fakes; server.ts with the real thing. */
export interface Deps {
  env: Env;
  db: Database;
  logger: Logger;
  auth: Auth;
  email: EmailSender;
  locations: LocationResolver;
  federated: FederatedGateway;
  /** Injectable clock: timeline and "closing soon" logic stay deterministic in tests. */
  now: () => Date;
  /**
   * Start a store-policy ingest in the background (for POST /internal/ingest/:provider). Returns
   * immediately. Absent = the endpoint answers 404.
   */
  startIngest?: (providerId: string, options: { limit?: number; dryRun?: boolean }) => IngestStart;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface PartnerContext {
  id: string;
  providerId: string;
  provider: ProviderMeta;
}

/** Hono context variables set by middleware. */
export interface AppEnv {
  Variables: {
    requestId: string;
    user: SessionUser | null;
    partner: PartnerContext | null;
  };
}
