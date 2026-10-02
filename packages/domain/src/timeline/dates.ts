/**
 * Date helpers for the timeline. Everything is done on whole-day numbers (days since the Unix
 * epoch, UTC) so there is no time-zone or DST arithmetic anywhere: a deadline is a calendar date.
 */
export const MS_PER_DAY = 86_400_000;

export function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function dayOf(date: Date): number {
  return dayNumber(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function isoToDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return dayNumber(y, m, d);
}

export function dayToIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function dayToDate(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

export function addYears(day: number, years: number): number {
  const d = dayToDate(day);
  return dayNumber(d.getUTCFullYear() + years, d.getUTCMonth() + 1, d.getUTCDate());
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "13 Jan 2027" */
export function formatDay(day: number): string {
  const d = dayToDate(day);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "13 Jan" */
export function formatMonthDay(month: number, dayOfMonth: number): string {
  return `${dayOfMonth} ${MONTHS_SHORT[month - 1]}`;
}

/** Human distance in days: "today", "tomorrow", "in 12 days", "in 3 weeks", "in 4 months". */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const abs = Math.abs(days);
  const phrase =
    abs < 14
      ? `${abs} days`
      : abs < 60
        ? `${Math.round(abs / 7)} weeks`
        : `${Math.round(abs / 30.4)} months`;
  return days > 0 ? `in ${phrase}` : `${phrase} ago`;
}
