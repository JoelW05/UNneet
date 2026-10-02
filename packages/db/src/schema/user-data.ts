import type { Profile } from '@unneet/domain';
import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUser } from './auth';
import { opportunities } from './opportunities';

/**
 * A profile is a *document* validated by the domain's ProfileSchema, so it lives in jsonb: the
 * schema evolves in one place (Zod) and old rows are migrated lazily by parsing with defaults.
 * Location inside is already coarse (outcode centroid). Cascades from the user so erasure is complete.
 */
export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Profile>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const savedOpportunities = pgTable(
  'saved_opportunities',
  {
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.opportunityId] }),
    index('saved_opportunities_user_created').on(t.userId, t.createdAt.desc()),
  ],
);

export const quizResults = pgTable(
  'quiz_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    quizId: text('quiz_id').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quiz_results_user_quiz').on(t.userId, t.quizId, t.createdAt.desc())],
);
