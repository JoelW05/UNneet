import {
  formatCost,
  formatPay,
  OPPORTUNITY_TYPE_INFO,
  type OpportunityCard,
  type OpportunityType,
  PILLAR_INFO,
  type Pillar,
  SECTORS,
  type SectorSlug,
} from '@unneet/domain';

/** The colour family for each pillar of "not NEET": work, study, training, support. */
export type PillarTone = 'employment' | 'education' | 'training' | 'support';

export const pillarTone = (pillar: Pillar): PillarTone => pillar;

export const typeLabel = (type: OpportunityType): string => OPPORTUNITY_TYPE_INFO[type].label;

export const pillarLabel = (pillar: Pillar): string => PILLAR_INFO[pillar].label;

export function sectorName(slug: SectorSlug | string | null | undefined): string | null {
  if (!slug) return null;
  return SECTORS.find((s) => s.slug === slug)?.name ?? null;
}

const DAY_MS = 86_400_000;

/** "Closes today", "Closes tomorrow", "Closes in 5 days", "Closes 14 Oct", "Closed 3 Oct". */
export function closesText(
  closesAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!closesAt) return null;
  const closes = new Date(closesAt);
  if (Number.isNaN(closes.getTime())) return null;
  const days = Math.ceil((closes.getTime() - now.getTime()) / DAY_MS);
  const date = closes.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (days < 0) return `Closed ${date}`;
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days <= 14) return `Closes in ${days} days`;
  return `Closes ${date}`;
}

/** "Posted today", "Posted 3 days ago", "Posted 2 weeks ago", "Posted 14 Sep". */
export function postedText(
  postedAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!postedAt) return null;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return null;
  const days = Math.floor((now.getTime() - posted.getTime()) / DAY_MS);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 14) return `Posted ${days} days ago`;
  if (days < 60) return `Posted ${Math.floor(days / 7)} weeks ago`;
  return `Posted ${posted.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export const payText = (card: Pick<OpportunityCard, 'pay'>): string | null =>
  card.pay ? formatPay(card.pay) : null;

/** Only show cost for things where cost matters (not for jobs, which pay you). */
export function costText(card: Pick<OpportunityCard, 'cost' | 'type'>): string | null {
  if (card.type === 'job' || card.type === 'apprenticeship' || card.type === 'internship')
    return null;
  if (card.cost.kind === 'unknown') return null;
  return formatCost(card.cost);
}

export function locationText(card: Pick<OpportunityCard, 'location' | 'distanceMiles'>): string {
  const { label, workMode } = card.location;
  const base =
    workMode === 'remote'
      ? label === 'Remote (UK)' || label === 'UK'
        ? 'Remote'
        : `${label} (remote)`
      : workMode === 'nationwide'
        ? 'Across the UK'
        : label;
  const miles = card.distanceMiles;
  return miles !== null && miles !== undefined && miles >= 0
    ? `${base} · ${miles < 1 ? 'under a mile' : `${Math.round(miles)} mi`} away`
    : base;
}

/** "1 result", "2,340 results". */
export const countText = (n: number, noun = 'result'): string =>
  `${n.toLocaleString('en-GB')} ${noun}${n === 1 ? '' : 's'}`;

export const SITE_NAME = 'UnNEET';
export const SITE_TAGLINE =
  'Find your next step: a job, apprenticeship, course or support, all in one place.';
