import type { Requirements } from '@unneet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  costKindEnum,
  countryEnum,
  opportunityStatusEnum,
  opportunityTypeEnum,
  payUnitEnum,
  pillarEnum,
  regionEnum,
  sectorEnum,
  storagePolicyEnum,
  workModeEnum,
} from './enums';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const providers = pgTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  licence: text('licence').notNull(),
  attribution: text('attribution').notNull(),
  attributionUrl: text('attribution_url'),
  storagePolicy: storagePolicyEnum('storage_policy').notNull(),
  isSample: boolean('is_sample').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  escoUri: text('esco_uri'),
});

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    externalId: text('external_id').notNull(),

    type: opportunityTypeEnum('type').notNull(),
    /** Derived from `type`; stored so the work/study/train/support filter is a plain index lookup. */
    pillar: pillarEnum('pillar').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    description: text('description').notNull(),
    orgName: text('org_name').notNull(),
    orgUrl: text('org_url'),
    applyUrl: text('apply_url').notNull(),

    sector: sectorEnum('sector'),
    level: smallint('level'),
    minEntryLevel: smallint('min_entry_level'),
    experienceRequired: boolean('experience_required'),
    /** What the advert asks of an applicant (qualifications, experience, checks…), read from its text. */
    requirements: jsonb('requirements').$type<Requirements>(),

    locationLabel: text('location_label').notNull(),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    postcode: text('postcode'),
    region: regionEnum('region'),
    country: countryEnum('country'),
    workMode: workModeEnum('work_mode').notNull().default('onsite'),

    payMin: numeric('pay_min', { precision: 12, scale: 2, mode: 'number' }),
    payMax: numeric('pay_max', { precision: 12, scale: 2, mode: 'number' }),
    payUnit: payUnitEnum('pay_unit'),
    payIsEstimate: boolean('pay_is_estimate').notNull().default(false),
    payNote: text('pay_note'),
    /** Annualised full-time-equivalent, derived by the domain `annualRange`, for pay filters/sorts. */
    annualPayMin: integer('annual_pay_min'),
    annualPayMax: integer('annual_pay_max'),

    costKind: costKindEnum('cost_kind').notNull().default('unknown'),
    costAmount: numeric('cost_amount', { precision: 12, scale: 2, mode: 'number' }),
    costNote: text('cost_note'),
    /** True for `free` and `funded`. Stored so "free only" is a boolean index lookup. */
    isFree: boolean('is_free').notNull().default(false),

    duration: text('duration'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    minAge: smallint('min_age'),
    maxAge: smallint('max_age'),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),

    status: opportunityStatusEnum('status').notNull().default('live'),
    /** sha-256 of the normalised input, so ingest can skip unchanged rows. */
    contentHash: text('content_hash').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Extra search terms derived at write time: sector words, type label, skill labels, tag labels.
     * (A generated column can't read the enum columns: enum→text casts are STABLE, not IMMUTABLE.)
     * Lets "apprenticeship", "care" or "customer service" match listings whose title doesn't say so.
     */
    keywords: text('keywords').notNull().default(''),

    /**
     * Weighted full-text document: title (A) > organisation & keywords (B) > summary (C) >
     * description (D). Generated and stored so it can never drift from the source columns.
     * The 'english' config is a literal, which keeps the expression IMMUTABLE as Postgres requires.
     */
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(org_name, '') || ' ' || coalesce(keywords, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(summary, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'D')`,
    ),
  },
  (t) => [
    uniqueIndex('opportunities_slug_uq').on(t.slug),
    uniqueIndex('opportunities_provider_external_uq').on(t.providerId, t.externalId),
    // Full-text + typo-tolerant title search
    index('opportunities_search_gin').using('gin', t.search),
    index('opportunities_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
    // Radius search: earthdistance GiST over the point; only rows with coordinates.
    index('opportunities_geo_gist')
      .using('gist', sql`ll_to_earth(${t.lat}, ${t.lon})`)
      .where(sql`${t.lat} is not null and ${t.lon} is not null`),
    // The common filter combination; partial on live rows keeps it small.
    index('opportunities_live_filters')
      .on(t.pillar, t.type, t.sector, t.level)
      .where(sql`${t.status} = 'live'`),
    index('opportunities_live_posted').on(t.postedAt.desc()).where(sql`${t.status} = 'live'`),
    index('opportunities_closes_at').on(t.closesAt),
    index('opportunities_provider_status').on(t.providerId, t.status, t.lastSeenAt),
  ],
);

export const opportunitySkills = pgTable(
  'opportunity_skills',
  {
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id),
  },
  (t) => [
    primaryKey({ columns: [t.opportunityId, t.skillId] }),
    index('opportunity_skills_skill').on(t.skillId),
  ],
);
