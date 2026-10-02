import { z } from 'zod';

export const SKILL_CATEGORIES = [
  'people',
  'practical',
  'digital',
  'business',
  'care',
  'creative',
  'thinking',
  'self',
] as const;
export const SkillCategorySchema = z.enum(SKILL_CATEGORIES);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillDefSchema = z.object({
  /** Stable kebab-case id used everywhere (profiles, opportunities). */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  label: z.string().min(1),
  category: SkillCategorySchema,
  /** Lower-case phrases that indicate the skill in free text (CVs, job ads). */
  aliases: z.array(z.string().min(2)).default([]),
  /** ESCO concept URI where one maps cleanly (https://esco.ec.europa.eu). */
  escoUri: z.string().nullable().optional(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

export interface ExtractedSkill {
  id: string;
  label: string;
  /** How many times any alias for this skill appeared. */
  mentions: number;
  /** The phrase that matched first, so the UI can show the evidence. */
  evidence: string;
}

/**
 * Normalise text for matching: lower-case, unify quotes/dashes, keep letters, digits and the
 * few symbols that are part of skill names (+ # .), then light plural stemming.
 */
export function tokenise(text: string): string[] {
  return rawTokens(text).map(stem);
}

/** Lower-cased words as written (minus punctuation), before stemming. Used to show evidence. */
function rawTokens(text: string): string[] {
  const cleaned = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9+#.'\s/-]/g, ' ')
    // keep "node.js" / "c++" / "c#" but drop sentence-final dots and slashes around words
    .replace(/(?<![a-z0-9])\.(?![a-z0-9])/g, ' ')
    .replace(/[/-]/g, ' ');
  return cleaned
    .split(/\s+/)
    .map((t) =>
      t.replace(/^[.'+#]+|[.'+#]+$/g, (m) => (m.includes('+') || m.includes('#') ? m : '')),
    )
    .filter(Boolean);
}

/**
 * Very light stemming: plural "s" and possessive "'s". Applied to both text and aliases so they
 * always compare like-for-like. Names containing symbols (node.js, c++, c#) are left untouched.
 */
function stem(token: string): string {
  if (/[.+#]/.test(token)) return token;
  if (token.endsWith("'s")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export interface SkillMatcher {
  extract(text: string): ExtractedSkill[];
  readonly size: number;
}

/**
 * Greedy longest-match dictionary extractor over word n-grams. O(words × maxN) with Map lookups,
 * so a 5,000-word CV takes well under a millisecond-scale of work.
 */
export function buildSkillMatcher(defs: readonly SkillDef[]): SkillMatcher {
  const phrases = new Map<string, SkillDef>();
  let maxN = 1;

  for (const def of defs) {
    const surface = new Set<string>([
      def.label.toLowerCase(),
      ...def.aliases.map((a) => a.toLowerCase()),
    ]);
    for (const phrase of surface) {
      const tokens = tokenise(phrase);
      if (tokens.length === 0) continue;
      maxN = Math.max(maxN, tokens.length);
      const key = tokens.join(' ');
      // First definition wins, keeping behaviour deterministic when aliases collide.
      if (!phrases.has(key)) phrases.set(key, def);
    }
  }

  return {
    size: defs.length,
    extract(text: string): ExtractedSkill[] {
      const raw = rawTokens(text);
      const tokens = raw.map(stem);
      const found = new Map<string, ExtractedSkill>();
      let i = 0;
      while (i < tokens.length) {
        let matched = false;
        for (let n = Math.min(maxN, tokens.length - i); n >= 1; n--) {
          const phrase = tokens.slice(i, i + n).join(' ');
          const def = phrases.get(phrase);
          if (def) {
            const existing = found.get(def.id);
            if (existing) existing.mentions++;
            else
              found.set(def.id, {
                id: def.id,
                label: def.label,
                mentions: 1,
                evidence: raw.slice(i, i + n).join(' '),
              });
            i += n;
            matched = true;
            break;
          }
        }
        if (!matched) i++;
      }
      return [...found.values()].sort(
        (a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label),
      );
    },
  };
}
