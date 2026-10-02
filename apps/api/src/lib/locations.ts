import { classifyLocationQuery, isPlausiblyUk, rankPlaces } from '@unneet/domain';
import { z } from 'zod';

export interface ResolvedLocation {
  /** Search centre. For a full postcode this is the exact point; it is used for the query and never stored. */
  lat: number;
  lon: number;
  /** Short human label: "M1", "Leeds, West Yorkshire". */
  label: string;
  outcode: string | null;
  kind: 'postcode' | 'outcode' | 'place';
  /** The text safe to hand to third parties (outcode for a postcode, never the full postcode). */
  shareableText: string;
}

export type LocationResult =
  | { ok: true; location: ResolvedLocation }
  | { ok: false; reason: 'not-found' | 'outside-uk' | 'unavailable' };

export interface LocationSuggestion {
  label: string;
  outcode: string | null;
  lat: number;
  lon: number;
}

export interface LocationResolver {
  resolve(input: string): Promise<LocationResult>;
  /** Outcode-level centroid: what a profile stores instead of an exact point. */
  coarsen(location: ResolvedLocation): Promise<{ lat: number; lon: number; label: string }>;
  suggest(input: string): Promise<LocationSuggestion[]>;
}

const POSTCODE_RESULT = z.object({
  result: z.object({
    postcode: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    outcode: z.string(),
    admin_district: z.string().nullable().optional(),
  }),
});

const OUTCODE_RESULT = z.object({
  result: z.object({
    outcode: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    admin_district: z.array(z.string()).optional(),
  }),
});

const PLACES_RESULT = z.object({
  result: z
    .array(
      z.object({
        name_1: z.string(),
        local_type: z.string().nullable().optional(),
        outcode: z.string().nullable().optional(),
        county_unitary: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .nullable(),
});
type Place = NonNullable<z.infer<typeof PLACES_RESULT>['result']>[number];

const placeLabel = (p: Place): string => {
  const area = p.county_unitary ?? p.region ?? p.country;
  return area && area !== p.name_1 ? `${p.name_1}, ${area}` : p.name_1;
};

class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max: number,
    private readonly now: () => number,
  ) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V): void {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
  }
}

export interface PostcodesIoOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
  timeoutMs?: number;
}

class NotFound extends Error {}

/** Resolver backed by https://postcodes.io (free, no key, Open Government Licence data). */
export function createPostcodesIoResolver(options: PostcodesIoOptions = {}): LocationResolver {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? 'https://api.postcodes.io';
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 4000;
  // Postcodes and outcodes are static; places change rarely. A day is plenty.
  const cache = new TtlCache<LocationResult>(24 * 60 * 60 * 1000, 5000, now);
  const outcodeCentroids = new TtlCache<{ lat: number; lon: number; label: string }>(
    7 * 24 * 60 * 60 * 1000,
    3000,
    now,
  );

  async function getJson(path: string): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) throw new NotFound();
    if (!res.ok) throw new Error(`postcodes.io responded ${res.status}`);
    return res.json();
  }

  async function lookup(input: string): Promise<LocationResult> {
    const { kind, value } = classifyLocationQuery(input);
    try {
      if (kind === 'postcode') {
        const { result } = POSTCODE_RESULT.parse(
          await getJson(`/postcodes/${encodeURIComponent(value)}`),
        );
        if (result.latitude === null || result.longitude === null)
          return { ok: false, reason: 'not-found' };
        return finish({
          lat: result.latitude,
          lon: result.longitude,
          label: result.admin_district
            ? `${result.outcode} (${result.admin_district})`
            : result.outcode,
          outcode: result.outcode,
          kind,
          shareableText: result.outcode,
        });
      }
      if (kind === 'outcode') {
        const { result } = OUTCODE_RESULT.parse(
          await getJson(`/outcodes/${encodeURIComponent(value)}`),
        );
        if (result.latitude === null || result.longitude === null)
          return { ok: false, reason: 'not-found' };
        const district = result.admin_district?.[0];
        return finish({
          lat: result.latitude,
          lon: result.longitude,
          label: district ? `${result.outcode} (${district})` : result.outcode,
          outcode: result.outcode,
          kind,
          shareableText: result.outcode,
        });
      }
      const { result } = PLACES_RESULT.parse(
        await getJson(`/places?q=${encodeURIComponent(value)}&limit=10`),
      );
      const best = rankPlaces(result ?? [], value)[0];
      if (!best) return { ok: false, reason: 'not-found' };
      return finish({
        lat: best.latitude,
        lon: best.longitude,
        label: placeLabel(best),
        outcode: best.outcode ?? null,
        kind,
        shareableText: best.name_1,
      });
    } catch (error) {
      if (error instanceof NotFound) return { ok: false, reason: 'not-found' };
      return { ok: false, reason: 'unavailable' };
    }
  }

  const finish = (location: ResolvedLocation): LocationResult =>
    isPlausiblyUk(location) ? { ok: true, location } : { ok: false, reason: 'outside-uk' };

  return {
    async resolve(input) {
      const key = input.trim().toLowerCase();
      if (!key) return { ok: false, reason: 'not-found' };
      const cached = cache.get(key);
      if (cached) return cached;
      const result = await lookup(input);
      // Never cache an outage: the next request should try again.
      if (result.ok || result.reason !== 'unavailable') cache.set(key, result);
      return result;
    },

    async coarsen(location) {
      if (location.kind !== 'postcode' || !location.outcode) {
        return { lat: location.lat, lon: location.lon, label: location.label };
      }
      const cached = outcodeCentroids.get(location.outcode);
      if (cached) return cached;
      try {
        const { result } = OUTCODE_RESULT.parse(
          await getJson(`/outcodes/${encodeURIComponent(location.outcode)}`),
        );
        if (result.latitude !== null && result.longitude !== null) {
          const centroid = { lat: result.latitude, lon: result.longitude, label: location.label };
          outcodeCentroids.set(location.outcode, centroid);
          return centroid;
        }
      } catch {
        // fall through: better to store a coarse-ish point we already have than nothing
      }
      return { lat: location.lat, lon: location.lon, label: location.label };
    },

    async suggest(input) {
      const text = input.trim();
      if (text.length < 2) return [];
      try {
        const { result } = PLACES_RESULT.parse(
          await getJson(`/places?q=${encodeURIComponent(text)}&limit=10`),
        );
        const seen = new Set<string>();
        const out: LocationSuggestion[] = [];
        for (const p of rankPlaces(result ?? [], text)) {
          const label = placeLabel(p);
          if (seen.has(label) || !isPlausiblyUk({ lat: p.latitude, lon: p.longitude })) continue;
          seen.add(label);
          out.push({ label, outcode: p.outcode ?? null, lat: p.latitude, lon: p.longitude });
          if (out.length >= 6) break;
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}

/** For tests and offline development: a fixed gazetteer, no network. */
export function createStaticResolver(
  table: Record<string, { lat: number; lon: number; label?: string; outcode?: string }>,
): LocationResolver {
  const find = (input: string) => table[input.trim().toLowerCase()];
  return {
    async resolve(input) {
      const hit = find(input);
      if (!hit) return { ok: false, reason: 'not-found' };
      const { kind } = classifyLocationQuery(input);
      return {
        ok: true,
        location: {
          lat: hit.lat,
          lon: hit.lon,
          label: hit.label ?? input.trim(),
          outcode: hit.outcode ?? null,
          kind,
          shareableText: hit.outcode ?? hit.label ?? input.trim(),
        },
      };
    },
    async coarsen(location) {
      return { lat: location.lat, lon: location.lon, label: location.label };
    },
    async suggest(input) {
      const q = input.trim().toLowerCase();
      return Object.entries(table)
        .filter(([key]) => key.startsWith(q))
        .map(([key, v]) => ({
          label: v.label ?? key,
          outcode: v.outcode ?? null,
          lat: v.lat,
          lon: v.lon,
        }));
    },
  };
}
