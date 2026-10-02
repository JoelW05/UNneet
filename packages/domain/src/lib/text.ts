/** Small, dependency-free text helpers. Everything here is pure and deterministic. */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  pound: '£',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  // Seen in real provider feeds (Find an apprenticeship, Greenhouse, Lever).
  bull: '•',
  middot: '·',
  rarr: '→',
  larr: '←',
  uarr: '↑',
  darr: '↓',
  euro: '€',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  iacute: 'í',
  oacute: 'ó',
  ouml: 'ö',
  uacute: 'ú',
  uuml: 'ü',
  ntilde: 'ñ',
  ccedil: 'ç',
  scaron: 'š',
  Scaron: 'Š',
  // Invisible formatting characters: drop them.
  zwj: '',
  zwnj: '',
  shy: '',
};

/** Decode HTML entities in text that is already plain (no tags): "Fish &amp; chips" → "Fish & chips". */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    // Case matters for a few ("Scaron" vs "scaron"), so try the exact name first. Own properties
    // only: "&constructor;" must stay text, not resolve to something on Object.prototype.
    for (const name of [body, body.toLowerCase()]) {
      if (Object.hasOwn(NAMED_ENTITIES, name)) return NAMED_ENTITIES[name] as string;
    }
    return match;
  });
}

/**
 * Convert untrusted HTML (provider descriptions) to plain text with paragraph breaks kept.
 *
 * The output is ALWAYS rendered as text by the UI, never as HTML, so this is a readability
 * transform, not the XSS defence. (The XSS defence is "no dangerouslySetInnerHTML anywhere".)
 */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const withBreaks = withoutBlocks
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|table|section|article)\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*tr\s*>/gi, '\n');
  // Inline tags vanish without a trace ("<b>home</b>." → "home."); everything else becomes a space.
  const stripped = withBreaks
    .replace(
      /<\/?(?:b|strong|i|em|u|span|a|small|sub|sup|font|mark|code|abbr|cite)(?:\s[^>]*)?>/gi,
      '',
    )
    .replace(/<[^>]*>/g, ' ');
  // HTML lists are usually written one <li> per line, which would otherwise leave a blank line
  // between every bullet. Keep a list together: one blank line before and after it, none inside.
  return normaliseWhitespace(decodeEntities(stripped)).replace(
    /(?<=(?:^|\n)• [^\n]*)\n(?=\n• )/g,
    '',
  );
}

/** Collapse runs of spaces, trim lines, and keep at most one blank line between paragraphs. */
export function normaliseWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Truncate on a word boundary, adding an ellipsis. Never splits a surrogate pair. */
export function truncate(input: string, max: number): string {
  const text = input.trim();
  if (Array.from(text).length <= max) return text;
  const chars = Array.from(text).slice(0, max - 1);
  const cut = chars.join('');
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:–—-]+$/, '')}…`;
}

/** First paragraph/sentences of a description, as a card summary. */
export function summarise(description: string, max = 220): string {
  const firstParagraph = description.split(/\n{2,}/)[0] ?? description;
  return truncate(firstParagraph.replace(/\s*\n\s*/g, ' '), max);
}

/** URL-safe slug. Strips diacritics, lowercases, joins with hyphens. */
export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length <= maxLength
    ? slug
    : slug.slice(0, maxLength).replace(/-+[^-]*$/, '') || slug.slice(0, maxLength);
}

/**
 * cyrb53 — a fast, well-distributed 53-bit non-cryptographic hash. Used for short stable
 * identifiers (slug suffixes), never for anything security sensitive.
 */
export function shortHash(input: string, length = 7): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36).padStart(length, '0').slice(-length);
}

/** Stable public slug for an opportunity: readable prefix + deterministic suffix. */
export function opportunitySlug(
  title: string,
  org: string,
  providerId: string,
  externalId: string,
): string {
  const base = slugify(`${title} ${org}`, 70);
  return `${base || 'opportunity'}-${shortHash(`${providerId}:${externalId}`)}`;
}

/** Title-case a SHOUTING string without breaking acronyms like NHS/UK/IT. */
export function tidyTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 6 && letters === letters.toUpperCase()) {
    return t
      .toLowerCase()
      .replace(/\b([a-z])([a-z']*)/g, (_m, a: string, rest: string) => a.toUpperCase() + rest)
      .replace(/\b(Nhs|Uk|It|Hr|Hgv|Lgv|Cnc|Hnc|Hnd|Nvq|Btec|Sen|Send|Cv|Pcv|Cad|Qa)\b/g, (w) =>
        w.toUpperCase(),
      );
  }
  return t;
}
