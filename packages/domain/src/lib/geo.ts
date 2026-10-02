const EARTH_RADIUS_MILES = 3958.7613;

export interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in miles. */
export function haversineMiles(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Loose bounding box for the UK incl. Northern Ireland, Shetland and the Channel coast. */
export function isPlausiblyUk({ lat, lon }: LatLon): boolean {
  return lat >= 49.8 && lat <= 61.0 && lon >= -8.7 && lon <= 2.0;
}

// UK postcode formats per the GOV.UK/Royal Mail pattern (outcode + incode).
const OUTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;
const FULL_POSTCODE = /^([A-Z]{1,2}[0-9][A-Z0-9]?)\s?([0-9][A-Z]{2})$/;

/** Normalise user input like "m1 1ae" or "M11AE" to "M1 1AE". Returns null if not a full postcode. */
export function normalisePostcode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = FULL_POSTCODE.exec(cleaned.replace(' ', ''));
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

export function isOutcode(input: string): boolean {
  return OUTCODE.test(input.trim().toUpperCase());
}

/** "M1 1AE" -> "M1"; "m1" -> "M1"; anything else -> null. */
export function outcodeOf(input: string): string | null {
  const full = normalisePostcode(input);
  if (full) return full.split(' ')[0] ?? null;
  const trimmed = input.trim().toUpperCase();
  return OUTCODE.test(trimmed) ? trimmed : null;
}

export type LocationQueryKind = 'postcode' | 'outcode' | 'place';

/** Decide how a free-text "where" box should be resolved. */
export function classifyLocationQuery(input: string): { kind: LocationQueryKind; value: string } {
  const full = normalisePostcode(input);
  if (full) return { kind: 'postcode', value: full };
  const out = input.trim().toUpperCase();
  if (OUTCODE.test(out)) return { kind: 'outcode', value: out };
  return { kind: 'place', value: input.trim() };
}

/** Rough bounding box (degrees) for a radius, used as a cheap SQL prefilter. */
export function boundingBox(centre: LatLon, radiusMiles: number) {
  const dLat = radiusMiles / 69.0;
  const dLon = radiusMiles / (69.0 * Math.max(0.2, Math.cos(toRad(centre.lat))));
  return {
    minLat: centre.lat - dLat,
    maxLat: centre.lat + dLat,
    minLon: centre.lon - dLon,
    maxLon: centre.lon + dLon,
  };
}

export const MILES_TO_METRES = 1609.344;
