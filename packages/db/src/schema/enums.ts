import {
  COST_KINDS,
  COUNTRIES,
  OPPORTUNITY_TYPES,
  PAY_UNITS,
  PILLARS,
  REGIONS,
  SECTOR_SLUGS,
  STORAGE_POLICIES,
  WORK_MODES,
} from '@unneet/domain';
import { pgEnum } from 'drizzle-orm/pg-core';

// Postgres enums mirror the domain taxonomy so invalid values are impossible at rest, not just
// at the API boundary. Adding a value is an `ALTER TYPE … ADD VALUE` migration (drizzle-kit
// generates it); removing one is deliberately painful.
export const opportunityTypeEnum = pgEnum('opportunity_type', OPPORTUNITY_TYPES);
export const pillarEnum = pgEnum('pillar', PILLARS);
export const sectorEnum = pgEnum('sector', SECTOR_SLUGS);
export const workModeEnum = pgEnum('work_mode', WORK_MODES);
export const payUnitEnum = pgEnum('pay_unit', PAY_UNITS);
export const costKindEnum = pgEnum('cost_kind', COST_KINDS);
export const regionEnum = pgEnum('region', REGIONS);
export const countryEnum = pgEnum('country', COUNTRIES);
export const storagePolicyEnum = pgEnum('storage_policy', STORAGE_POLICIES);

export const opportunityStatusEnum = pgEnum('opportunity_status', ['live', 'expired', 'removed']);
export const ingestStatusEnum = pgEnum('ingest_status', [
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export const reportReasonEnum = pgEnum('report_reason', [
  'closed',
  'scam',
  'misleading',
  'offensive',
  'other',
]);
export const reportStatusEnum = pgEnum('report_status', [
  'open',
  'reviewed',
  'actioned',
  'dismissed',
]);
