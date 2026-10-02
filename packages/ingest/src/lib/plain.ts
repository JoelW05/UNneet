import { decodeEntities, htmlToText, normaliseWhitespace } from '@unneet/domain';

/**
 * Plain text that keeps its paragraphs and bullet points. Fields documented as plain text often
 * arrive holding HTML (<p>, <ul>) or just entities ("&amp;", "&nbsp;"), so both are handled for
 * every free-text field from every source.
 */
export function rich(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  if (!t) return '';
  return /<[a-z!/][^>]*>/i.test(t) ? htmlToText(t) : normaliseWhitespace(decodeEntities(t));
}

/** Trimmed, single-spaced plain text, for titles, names and one-line fields. */
export const clean = (s: string | null | undefined): string => rich(s).replace(/\s+/g, ' ').trim();

/** "STOKE-ON-TRENT" → "Stoke-On-Trent". Mixed-case input is left alone. */
export function townCase(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}
