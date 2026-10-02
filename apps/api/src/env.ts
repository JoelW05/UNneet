import { DEV_DATABASE_URL } from '@unneet/db';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const DEV_AUTH_SECRET = 'dev-only-secret-do-not-use-in-production-0000000000';

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  DATABASE_URL: optionalString,
  /** Run pending migrations on start. Defaults on in development, off in production (run `db:migrate`). */
  AUTO_MIGRATE: bool,
  /** Permit demo listings in production. Off by default so sample data can never go live by accident. */
  ALLOW_SAMPLE_DATA: bool,

  /** The website's public origin: Better Auth base URL, CORS for credentialed routes, ICS links. */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  AUTH_SECRET: optionalString,
  /** Honour X-Forwarded-For for the client IP (only behind a proxy you control). */
  TRUST_PROXY: bool,

  /** Shared secret for POST /internal/* (ingest triggers from a scheduler). Unset = routes disabled. */
  INTERNAL_TOKEN: optionalString,

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.string().default('UnNEET <no-reply@unneet.example>'),

  REED_API_KEY: optionalString,
  ADZUNA_APP_ID: optionalString,
  ADZUNA_APP_KEY: optionalString,
  FAA_API_KEY: optionalString,
});

export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  databaseUrl: string;
  autoMigrate: boolean;
  allowSampleData: boolean;
  webOrigin: string;
  authSecret: string;
  trustProxy: boolean;
  internalToken: string | undefined;
  resendApiKey: string | undefined;
  emailFrom: string;
  /** Raw provider keys, passed to the ingest federated providers. */
  providerEnv: Readonly<Record<string, string | undefined>>;
}

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
    this.name = 'EnvError';
  }
}

/**
 * Parse and validate the environment once, at start-up. Fails fast with every problem listed, and
 * refuses unsafe production configuration instead of silently running with a dev default.
 */
export function loadEnv(source: Readonly<Record<string, string | undefined>> = process.env): Env {
  const parsed = RawEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const raw = parsed.data;
  const isProduction = raw.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProduction) {
    if (!raw.DATABASE_URL) problems.push('DATABASE_URL is required in production');
    if (!raw.AUTH_SECRET || raw.AUTH_SECRET.length < 32)
      problems.push('AUTH_SECRET is required in production and must be at least 32 characters');
    if (raw.AUTH_SECRET === DEV_AUTH_SECRET)
      problems.push('AUTH_SECRET must not be the development default');
    if (!raw.WEB_ORIGIN.startsWith('https://'))
      problems.push('WEB_ORIGIN must be an https:// URL in production');
    if (!raw.RESEND_API_KEY)
      problems.push('RESEND_API_KEY is required in production (sign-in codes are sent by email)');
    if (raw.INTERNAL_TOKEN && raw.INTERNAL_TOKEN.length < 24)
      problems.push('INTERNAL_TOKEN must be at least 24 characters');
  }
  if (problems.length > 0) throw new EnvError(problems);

  const providerEnv = Object.freeze({
    REED_API_KEY: raw.REED_API_KEY,
    ADZUNA_APP_ID: raw.ADZUNA_APP_ID,
    ADZUNA_APP_KEY: raw.ADZUNA_APP_KEY,
    FAA_API_KEY: raw.FAA_API_KEY,
    ALLOW_SAMPLE_DATA: raw.ALLOW_SAMPLE_DATA ? 'true' : undefined,
  });

  return {
    nodeEnv: raw.NODE_ENV,
    isProduction,
    port: raw.PORT,
    logLevel: raw.LOG_LEVEL ?? (raw.NODE_ENV === 'test' ? 'silent' : 'info'),
    databaseUrl: raw.DATABASE_URL ?? DEV_DATABASE_URL,
    autoMigrate: raw.AUTO_MIGRATE ?? !isProduction,
    allowSampleData: raw.ALLOW_SAMPLE_DATA ?? false,
    webOrigin: raw.WEB_ORIGIN.replace(/\/$/, ''),
    authSecret: raw.AUTH_SECRET ?? DEV_AUTH_SECRET,
    trustProxy: raw.TRUST_PROXY ?? false,
    internalToken: raw.INTERNAL_TOKEN,
    resendApiKey: raw.RESEND_API_KEY,
    emailFrom: raw.EMAIL_FROM,
    providerEnv,
  };
}
