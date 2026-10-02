import { createHash } from 'node:crypto';
import {
  annualRange,
  isFreeCost,
  OPPORTUNITY_TYPE_INFO,
  type OpportunityCard,
  type OpportunityDetail,
  type OpportunityInput,
  type OpportunityTag,
  opportunitySlug,
  type ProviderMeta,
  pillarOf,
  type Requirements,
  SECTORS,
  type SkillRef,
  summarise,
  TAG_LABEL,
  tidyTitle,
} from '@unneet/domain';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { opportunities, providers } from '../schema';

export type OpportunityRow = InferSelectModel<typeof opportunities>;
export type NewOpportunityRow = InferInsertModel<typeof opportunities>;
export type ProviderRow = InferSelectModel<typeof providers>;

export interface UpsertItem {
  input: OpportunityInput;
  /** Skill ids (from the skills dictionary) detected for this listing. */
  skillIds: readonly string[];
  /** What the advert asks of an applicant. Part of the hash, so better rules re-save old rows. */
  requirements?: Requirements | null | undefined;
}

/** JSON with sorted keys, so semantically equal inputs always hash equal. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function contentHash(item: UpsertItem): string {
  return createHash('sha256')
    .update(
      stableStringify({
        input: item.input,
        skills: [...item.skillIds].sort(),
        requirements: item.requirements ?? null,
      }),
    )
    .digest('hex');
}

const toDate = (iso: string | null | undefined): Date | null => (iso ? new Date(iso) : null);

/** Derived search terms: sector words, type label(s), skill labels, tag labels. */
export function buildKeywords(input: OpportunityInput, skillLabels: readonly string[]): string {
  const parts: string[] = [];
  const typeInfo = OPPORTUNITY_TYPE_INFO[input.type];
  parts.push(typeInfo.label, typeInfo.plural);
  if (input.sector) {
    const sector = SECTORS.find((s) => s.slug === input.sector);
    if (sector) parts.push(sector.name, ...sector.exampleRoles);
  }
  parts.push(...skillLabels);
  for (const tag of input.tags ?? []) parts.push(TAG_LABEL[tag]);
  return parts.join(' ');
}

/** Build the insert/update values for a listing. Pure; all derivation lives here. */
export function toRow(
  provider: ProviderMeta,
  item: UpsertItem,
  skillLabels: ReadonlyMap<string, string>,
  now: Date,
): NewOpportunityRow {
  const { input } = item;
  const title = tidyTitle(input.title);
  const annual = annualRange(
    input.pay ? { ...input.pay, isEstimate: input.pay.isEstimate ?? false } : null,
  );
  const cost = input.cost ?? { kind: 'unknown' as const, amount: null };
  const labels = item.skillIds.map((id) => skillLabels.get(id) ?? id.replaceAll('-', ' '));
  return {
    slug: opportunitySlug(title, input.organisation.name, provider.id, input.externalId),
    providerId: provider.id,
    externalId: input.externalId,
    type: input.type,
    pillar: pillarOf(input.type),
    title,
    summary: summarise(input.description),
    description: input.description,
    orgName: input.organisation.name,
    orgUrl: input.organisation.url ?? null,
    applyUrl: input.applyUrl,
    sector: input.sector ?? null,
    level: input.level ?? null,
    minEntryLevel: input.minEntryLevel ?? null,
    experienceRequired: input.experienceRequired ?? null,
    requirements: item.requirements ?? null,
    locationLabel: input.location.label,
    lat: input.location.lat ?? null,
    lon: input.location.lon ?? null,
    postcode: input.location.postcode ?? null,
    region: input.location.region ?? null,
    country: input.location.country ?? null,
    workMode: input.location.workMode ?? 'onsite',
    payMin: input.pay?.min ?? null,
    payMax: input.pay?.max ?? null,
    payUnit: input.pay?.unit ?? null,
    payIsEstimate: input.pay?.isEstimate ?? false,
    payNote: input.pay?.note ?? null,
    annualPayMin: annual.min,
    annualPayMax: annual.max,
    costKind: cost.kind,
    costAmount: cost.amount,
    costNote: cost.note ?? null,
    isFree: isFreeCost(cost),
    duration: input.duration ?? null,
    postedAt: toDate(input.postedAt),
    startsAt: toDate(input.startsAt),
    closesAt: toDate(input.closesAt),
    minAge: input.minAge ?? null,
    maxAge: input.maxAge ?? null,
    tags: [...(input.tags ?? [])],
    keywords: buildKeywords(input, labels),
    status: 'live',
    contentHash: contentHash(item),
    lastSeenAt: now,
    updatedAt: now,
  };
}

export interface CardRow {
  o: OpportunityRow;
  p: Pick<ProviderRow, 'id' | 'name' | 'licence' | 'attribution' | 'attributionUrl' | 'isSample'>;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function rowToCard(
  { o, p }: CardRow,
  skills: readonly SkillRef[],
  distanceMiles?: number | null,
): OpportunityCard {
  const hasPay = o.payUnit !== null && (o.payMin !== null || o.payMax !== null);
  return {
    id: o.id,
    slug: o.slug,
    type: o.type,
    pillar: o.pillar,
    title: o.title,
    summary: o.summary,
    organisation: { name: o.orgName, url: o.orgUrl },
    sector: o.sector,
    level: o.level,
    minEntryLevel: o.minEntryLevel,
    location: {
      label: o.locationLabel,
      lat: o.lat,
      lon: o.lon,
      postcode: o.postcode,
      region: o.region,
      country: o.country,
      workMode: o.workMode,
    },
    pay: hasPay
      ? {
          min: o.payMin,
          max: o.payMax,
          unit: o.payUnit as NonNullable<typeof o.payUnit>,
          isEstimate: o.payIsEstimate,
          note: o.payNote,
        }
      : null,
    cost: { kind: o.costKind, amount: o.costAmount, note: o.costNote },
    duration: o.duration,
    postedAt: iso(o.postedAt),
    closesAt: iso(o.closesAt),
    startsAt: iso(o.startsAt),
    minAge: o.minAge,
    maxAge: o.maxAge,
    tags: o.tags as OpportunityTag[],
    skills: [...skills],
    experienceRequired: o.experienceRequired,
    requirements: o.requirements ?? null,
    distanceMiles:
      distanceMiles === undefined || distanceMiles === null
        ? null
        : Math.round(distanceMiles * 10) / 10,
    source: {
      providerId: p.id,
      providerName: p.name,
      licence: p.licence,
      attribution: p.attribution,
      attributionUrl: p.attributionUrl,
      isSample: p.isSample,
    },
  };
}

export function rowToDetail(row: CardRow, skills: readonly SkillRef[]): OpportunityDetail {
  return {
    ...rowToCard(row, skills),
    description: row.o.description,
    applyUrl: row.o.applyUrl,
    updatedAt: row.o.updatedAt.toISOString(),
    status: row.o.status === 'live' ? 'live' : 'expired',
  };
}
