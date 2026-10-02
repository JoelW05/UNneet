import type {
  CalendarEvent,
  Timeline,
  TimelineEntry,
  TimelineRule,
  TimelineStatus,
  Timing,
} from '../schemas/timeline';
import type { SectorSlug } from '../taxonomy/sectors';
import { academicYearOf, STAGE_INFO, type Stage } from '../taxonomy/stages';
import {
  addYears,
  dayNumber,
  dayOf,
  dayToIso,
  formatDay,
  formatMonthDay,
  isoToDay,
  relativeDays,
} from './dates';

export interface TimelineInput {
  stage: Stage;
  now: Date;
  /** Rule ids the person has ticked off. */
  doneIds?: readonly string[];
  /**
   * Sectors they care about (chosen, or the top fits from their quiz). Rules with a `sectors`
   * list only appear when at least one of these matches.
   */
  sectors?: readonly SectorSlug[];
  /** When they started on the site, ISO date, for `relative` rules. Defaults to today. */
  startedOn?: string;
}

/** Look-ahead for the "soon" bucket. */
export const SOON_DAYS = 45;
/** Anything opening further out than this (but not this academic year) is not shown. */
export const LATER_HORIZON_DAYS = 330;
/** A window that closed this recently is shown as "missed (but not over)". */
export const MISSED_DAYS = 30;
/** In summer we show next stage's rules that start within this many days. */
export const NEXT_STAGE_PREVIEW_DAYS = 75;
/** Fixed events are hidden this long after their deadline (the next cycle's dates should replace them). */
const EVENT_GRACE_DAYS = 14;

interface Window {
  opens: number;
  closes: number;
  exact: boolean;
  label: string;
  event?: CalendarEvent;
}

function academicWindows(timing: Extract<Timing, { kind: 'academic' }>, ay: number): Window[] {
  const windows: Window[] = [];
  const label = `Typically ${formatMonthDay(timing.from.month, timing.from.day)} – ${formatMonthDay(
    timing.to.month,
    timing.to.day,
  )}`;
  for (const year of [ay - 1, ay, ay + 1]) {
    const resolve = (md: { month: number; day: number }) =>
      dayNumber(md.month >= 9 ? year : year + 1, md.month, md.day);
    const opens = resolve(timing.from);
    let closes = resolve(timing.to);
    if (closes < opens) closes = addYears(closes, 1);
    windows.push({ opens, closes, exact: false, label });
  }
  return windows;
}

function fixedWindow(
  timing: Extract<Timing, { kind: 'fixed' }>,
  events: ReadonlyMap<string, CalendarEvent>,
  today: number,
): Window | null {
  const event = events.get(timing.eventId);
  // Unverified facts are never shown as facts.
  if (!event?.verifiedOn) return null;
  const closes = isoToDay(event.closes);
  if (today > closes + EVENT_GRACE_DAYS) return null;
  const time = event.closesAtTime ? `, ${event.closesAtTime}` : '';
  let opens: number;
  let label: string;
  if (timing.earlyWindowDays && event.opens) {
    opens = isoToDay(event.opens);
    label = `Opens ${formatDay(opens)} · final deadline ${formatDay(closes)}${time}`;
    return {
      opens,
      closes: Math.min(closes, opens + timing.earlyWindowDays),
      exact: true,
      label,
      event,
    };
  }
  opens = event.opens ? isoToDay(event.opens) : closes - timing.leadDays;
  label = `Deadline ${formatDay(closes)}${time}`;
  return { opens, closes, exact: true, label, event };
}

function relativeWindow(timing: Extract<Timing, { kind: 'relative' }>, startedDay: number): Window {
  const opens = startedDay + timing.fromDay;
  const closes = startedDay + timing.toDay;
  const label =
    timing.toDay - timing.fromDay <= 7
      ? `Week ${Math.floor(timing.fromDay / 7) + 1}`
      : `Days ${timing.fromDay}–${timing.toDay}`;
  return { opens, closes, exact: false, label };
}

/** Choose the occurrence of a (possibly repeating) window that is most relevant today. */
function pickWindow(candidates: readonly Window[], today: number): Window | null {
  const open = candidates.find((w) => w.opens <= today && today <= w.closes);
  if (open) return open;
  const recentlyClosed = candidates
    .filter((w) => w.closes < today && today - w.closes <= MISSED_DAYS)
    .sort((a, b) => b.closes - a.closes)[0];
  if (recentlyClosed) return recentlyClosed;
  const upcoming = candidates.filter((w) => w.opens > today).sort((a, b) => a.opens - b.opens)[0];
  return upcoming ?? null;
}

function statusFor(window: Window, today: number): TimelineStatus | null {
  if (window.opens <= today && today <= window.closes) return 'now';
  if (window.closes < today) return today - window.closes <= MISSED_DAYS ? 'missed' : null;
  const untilOpen = window.opens - today;
  if (untilOpen <= SOON_DAYS) return 'soon';
  return untilOpen <= LATER_HORIZON_DAYS ? 'later' : null;
}

function toEntry(
  rule: TimelineRule,
  window: Window,
  status: TimelineStatus,
  today: number,
  fromNextStage: boolean,
): TimelineEntry {
  return {
    rule,
    status,
    opensOn: dayToIso(window.opens),
    closesOn: dayToIso(window.closes),
    daysToOpen: window.opens - today,
    daysToClose: window.closes - today,
    windowLabel: window.label,
    exact: window.exact,
    fromNextStage,
    ...(window.event ? { event: window.event } : {}),
  };
}

const URGENCY_RANK = { high: 0, normal: 1, low: 2 } as const;

function byUrgencyThenClose(a: TimelineEntry, b: TimelineEntry): number {
  return (
    URGENCY_RANK[a.rule.urgency] - URGENCY_RANK[b.rule.urgency] ||
    a.daysToClose - b.daysToClose ||
    a.rule.id.localeCompare(b.rule.id)
  );
}

const byOpen = (a: TimelineEntry, b: TimelineEntry): number =>
  a.daysToOpen - b.daysToOpen || a.rule.id.localeCompare(b.rule.id);

/**
 * Pure: given who someone is (stage), today's date and the editorial data, decide what they should
 * be doing about their next steps. No clock reads, no I/O, so it is fully deterministic in tests.
 */
export function buildTimeline(
  input: TimelineInput,
  rules: readonly TimelineRule[],
  calendar: readonly CalendarEvent[],
): Timeline {
  const today = dayOf(input.now);
  const ay = academicYearOf(input.now);
  const events = new Map(calendar.map((e) => [e.id, e]));
  const done = new Set(input.doneIds ?? []);
  const startedDay = input.startedOn ? isoToDay(input.startedOn) : today;
  const wanted = new Set(input.sectors ?? []);

  // A sector-specific rule is niche noise for everyone else, so it needs a positive signal.
  const sectorOk = (rule: TimelineRule): boolean =>
    !rule.sectors || rule.sectors.some((s) => wanted.has(s));

  const evaluate = (
    rule: TimelineRule,
    anchorAy: number,
    fromNextStage: boolean,
  ): TimelineEntry | null => {
    let window: Window | null;
    switch (rule.timing.kind) {
      case 'academic':
        window = pickWindow(academicWindows(rule.timing, anchorAy), today);
        break;
      case 'fixed':
        window = fixedWindow(rule.timing, events, today);
        break;
      case 'relative':
        window = relativeWindow(rule.timing, startedDay);
        break;
    }
    if (!window) return null;
    let status = statusFor(window, today);
    if (!status) return null;
    if (done.has(rule.id)) status = 'done';
    return toEntry(rule, window, status, today, fromNextStage);
  };

  const entries: TimelineEntry[] = [];
  for (const rule of rules) {
    if (!rule.stages.includes(input.stage) || !sectorOk(rule)) continue;
    const entry = evaluate(rule, ay, false);
    if (entry) entries.push(entry);
  }

  // Summer heads-up: show what is about to start for the *next* stage ("in September, apply for internships").
  const month = input.now.getUTCMonth();
  const nextStage = STAGE_INFO[input.stage].next;
  if (nextStage && month >= 5 && month <= 7) {
    for (const rule of rules) {
      if (!rule.stages.includes(nextStage) || rule.stages.includes(input.stage) || !sectorOk(rule))
        continue;
      const entry = evaluate(rule, ay + 1, true);
      if (
        entry &&
        entry.status !== 'done' &&
        entry.daysToOpen > 0 &&
        entry.daysToOpen <= NEXT_STAGE_PREVIEW_DAYS
      ) {
        entries.push({ ...entry, status: 'soon' });
      }
    }
  }

  const bucket = (status: TimelineStatus) => entries.filter((e) => e.status === status);
  const nowList = bucket('now').sort(byUrgencyThenClose);
  const soonList = bucket('soon').sort(byOpen);

  return {
    stage: input.stage,
    asOf: dayToIso(today),
    academicYear: ay,
    now: nowList,
    soon: soonList,
    later: bucket('later').sort(byOpen),
    missed: bucket('missed').sort(
      (a, b) => b.daysToClose - a.daysToClose || a.rule.id.localeCompare(b.rule.id),
    ),
    done: bucket('done').sort((a, b) => a.rule.title.localeCompare(b.rule.title)),
    nextUp: [...nowList, ...soonList].slice(0, 3),
  };
}

/** Short, calm status line for a card: "Open now · closes in 12 days". */
export function whenLabel(entry: TimelineEntry): string {
  switch (entry.status) {
    case 'now':
      return entry.daysToClose === 0
        ? 'Open now · closes today'
        : `Open now · ${entry.exact ? 'closes' : 'usually closes'} ${relativeDays(entry.daysToClose)}`;
    case 'soon':
      return `Opens ${relativeDays(entry.daysToOpen)}`;
    case 'later':
      return `Opens ${relativeDays(entry.daysToOpen)}`;
    case 'missed':
      return `Window ended ${relativeDays(entry.daysToClose)}`;
    case 'done':
      return 'Done';
  }
}
