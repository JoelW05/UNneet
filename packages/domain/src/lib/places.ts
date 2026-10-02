/** The few fields of a postcodes.io `places` hit that ranking needs. */
export interface PlaceHit {
  name_1: string;
  local_type?: string | null | undefined;
}

/**
 * postcodes.io's `places` endpoint is a plain text match, so "Newcastle" returns a Fife suburb
 * before Newcastle upon Tyne. People mean the big settlement, so rank by settlement size, then by
 * how closely the name matches. Verified against the live API (see docs/DATA-SOURCES.md).
 */
const TYPE_RANK: Readonly<Record<string, number>> = {
  City: 0,
  Town: 1,
  'Suburban Area': 2,
  Village: 3,
  'Other Settlement': 4,
  Hamlet: 5,
};

export function rankPlaces<T extends PlaceHit>(places: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const score = (p: T): number => {
    const name = p.name_1.toLowerCase();
    const exact = name === q ? 0 : name.startsWith(q) ? 1 : 2;
    const type = TYPE_RANK[p.local_type ?? ''] ?? 6;
    // Settlement size dominates, then name closeness, then a shorter name.
    return type * 1000 + exact * 100 + Math.min(name.length, 99);
  };
  return [...places].sort((a, b) => score(a) - score(b));
}
