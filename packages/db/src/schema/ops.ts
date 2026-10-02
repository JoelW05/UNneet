import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ingestStatusEnum, reportReasonEnum, reportStatusEnum } from './enums';
import { opportunities, providers } from './opportunities';

/** One row per ingest run per provider: the audit trail and the basis for staleness alerts. */
export const ingestRuns = pgTable(
  'ingest_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    status: ingestStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    seen: integer('seen').notNull().default(0),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    unchanged: integer('unchanged').notNull().default(0),
    expired: integer('expired').notNull().default(0),
    rejected: integer('rejected').notNull().default(0),
    error: text('error'),
  },
  (t) => [index('ingest_runs_provider_started').on(t.providerId, t.startedAt.desc())],
);

/** "Report a problem with this listing". Deliberately no reporter identity or IP stored. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    reason: reportReasonEnum('reason').notNull(),
    note: text('note'),
    status: reportStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reports_status_created').on(t.status, t.createdAt.desc())],
);

/** Partners (colleges, employers, charities) who push listings via the keyed partner endpoint. */
export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: text('provider_id')
    .notNull()
    .references(() => providers.id),
  name: text('name').notNull(),
  /** sha-256 of the API key. The key itself is shown once at creation and never stored. */
  apiKeyHash: text('api_key_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
