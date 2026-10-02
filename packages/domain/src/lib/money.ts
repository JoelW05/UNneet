import type { CostKind, PayUnit } from '../taxonomy/misc';

/** Assumptions used to compare pay across units. Documented so users can trust the comparison. */
export const HOURS_PER_WEEK_FTE = 37.5;
export const WEEKS_PER_YEAR = 52;
export const WORKING_DAYS_PER_YEAR = 260;

export interface Pay {
  min: number | null;
  max: number | null;
  unit: PayUnit;
  /** True when the figure is an estimate (e.g. Adzuna Jobsworth) rather than the employer's. */
  isEstimate: boolean;
  note?: string | null;
}

export interface Cost {
  kind: CostKind;
  /** Total cost to the learner in GBP, when `kind === 'paid'`. */
  amount: number | null;
  note?: string | null;
}

export function toAnnual(amount: number, unit: PayUnit): number {
  switch (unit) {
    case 'hour':
      return amount * HOURS_PER_WEEK_FTE * WEEKS_PER_YEAR;
    case 'day':
      return amount * WORKING_DAYS_PER_YEAR;
    case 'week':
      return amount * WEEKS_PER_YEAR;
    case 'month':
      return amount * 12;
    case 'year':
      return amount;
  }
}

/** Annualised full-time-equivalent range, rounded to whole pounds. */
export function annualRange(pay: Pay | null | undefined): {
  min: number | null;
  max: number | null;
} {
  if (!pay) return { min: null, max: null };
  const conv = (n: number | null) => (n === null ? null : Math.round(toAnnual(n, pay.unit)));
  const min = conv(pay.min);
  const max = conv(pay.max);
  return { min: min ?? max, max: max ?? min };
}

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});
const gbpPence = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatGBP(amount: number): string {
  return Number.isInteger(amount) ? gbp.format(amount) : gbpPence.format(amount);
}

const UNIT_PHRASE: Readonly<Record<PayUnit, string>> = {
  hour: 'an hour',
  day: 'a day',
  week: 'a week',
  month: 'a month',
  year: 'a year',
};

/**
 * "£12.21 an hour", "£22,000 – £25,000 a year", "Up to £39,201 a year", "From £20,957 a year",
 * or "Pay not stated". A one-sided figure (the listing gave only a ceiling or a floor) says so
 * rather than reading as an exact amount.
 */
export function formatPay(pay: Pay | null | undefined): string {
  if (!pay || (pay.min === null && pay.max === null)) return 'Pay not stated';
  const { min, max } = pay;
  const phrase = UNIT_PHRASE[pay.unit];
  let body: string;
  if (min !== null && max !== null) {
    body = min === max ? formatGBP(min) : `${formatGBP(min)} – ${formatGBP(max)}`;
  } else if (max !== null) {
    body = `Up to ${formatGBP(max)}`;
  } else {
    body = `From ${formatGBP(min as number)}`;
  }
  return `${body} ${phrase}${pay.isEstimate ? ' (estimate)' : ''}`;
}

export function formatCost(cost: Cost | null | undefined): string {
  if (!cost) return 'Cost not stated';
  switch (cost.kind) {
    case 'free':
      return 'Free';
    case 'funded':
      return 'Free if you qualify';
    case 'paid':
      return cost.amount === null ? 'Fees apply' : formatGBP(cost.amount);
    case 'unknown':
      return 'Cost not stated';
  }
}

/** Does this cost count as "free" for filtering? (Funded = free to eligible learners.) */
export function isFreeCost(cost: Cost | null | undefined): boolean {
  return cost?.kind === 'free' || cost?.kind === 'funded';
}
