export const clamp = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, n));

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Round to a fixed number of decimal places (avoids float noise in API output and tests). */
export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Pearson correlation of two equal-length vectors, mapped to [0, 1] (0.5 = no relationship).
 *
 * Why not plain cosine similarity? All our interest vectors are non-negative, so cosine is
 * high for everything (~0.6+). Centring each vector on its own mean compares the *shape*
 * ("more Social than Realistic") rather than the level, which is what an interest profile means.
 */
export function shapeSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0)
    throw new RangeError('Vectors must be same non-zero length');
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0.5;
  return (num / Math.sqrt(da * db) + 1) / 2;
}

/** Smooth distance decay: 1 at 0 miles, 0.5 at `halfLife`, approaching 0 far away. */
export function distanceDecay(miles: number, halfLifeMiles: number): number {
  if (miles <= 0) return 1;
  return 0.5 ** (miles / halfLifeMiles);
}
