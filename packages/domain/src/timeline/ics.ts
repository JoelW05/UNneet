import type { TimelineEntry } from '../schemas/timeline';
import { dayToIso, isoToDay } from './dates';
import { actionHref } from './links';

/** RFC 5545 TEXT escaping. */
export function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line so no physical line exceeds 75 octets (RFC 5545 §3.1), without splitting a
 * multi-byte UTF-8 character. Continuation lines start with a single space.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

const compact = (iso: string): string => iso.replaceAll('-', '');

function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

export interface IcsOptions {
  calendarName: string;
  /** Domain-ish suffix for UIDs, e.g. "unneet.uk". */
  uidDomain: string;
  /** Absolute origin used to build links back to the site, e.g. "https://unneet.uk". */
  siteOrigin: string;
  now: Date;
}

function linkFor(entry: TimelineEntry, origin: string): string | null {
  const action = entry.rule.action;
  if (!action) return null;
  const { href, external } = actionHref(action);
  return external ? href : `${origin}${href}`;
}

/**
 * Build an iCalendar (.ics) document of timeline entries as all-day events. Subscribing in
 * Google/Apple/Outlook calendar gives people reminders without us holding any personal data.
 * Reminders fire at 09:00 on the day each window opens.
 */
export function buildIcs(entries: readonly TimelineEntry[], options: IcsOptions): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UnNEET//Timeline//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
  ];

  for (const entry of entries) {
    const { rule } = entry;
    const endExclusive = dayToIso(isoToDay(entry.closesOn) + 1);
    const link = linkFor(entry, options.siteOrigin);
    const description = [
      rule.summary,
      '',
      rule.why,
      '',
      entry.windowLabel,
      rule.caveat ?? '',
      link ? `More: ${link}` : '',
    ]
      .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
      .join('\n')
      .trim();

    lines.push(
      'BEGIN:VEVENT',
      `UID:${rule.id}-${compact(entry.opensOn)}@${options.uidDomain}`,
      `DTSTAMP:${utcStamp(options.now)}`,
      `DTSTART;VALUE=DATE:${compact(entry.opensOn)}`,
      `DTEND;VALUE=DATE:${compact(endExclusive)}`,
      `SUMMARY:${escapeIcsText(rule.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      ...(link ? [`URL:${link}`] : []),
      'CATEGORIES:UnNEET',
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(rule.title)}`,
      'TRIGGER;RELATED=START:PT9H',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
