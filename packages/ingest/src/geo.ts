import {
  type Country,
  isPlausiblyUk,
  normalisePostcode,
  type Region,
  rankPlaces,
  regionFromPostcodesIo,
} from '@unneet/domain';
import { z } from 'zod';
import type { Http } from './http';

export interface GeoPoint {
  lat: number;
  lon: number;
  region: Region | null;
  country: Country | null;
  outcode: string | null;
  /** Local authority name for a postcode ("Calderdale"): a safe place label when an address has none. */
  district?: string | null | undefined;
}

/**
 * Turns the postcodes and place names that feeds give us into coordinates, so distance search
 * works for every listing. Best-effort by design: a listing without coordinates is still a valid
 * listing (it just can't be found by distance), so a lookup failure never fails an ingest.
 */
export interface Geocoder {
  /** Bulk lookup. Keys of the result are NORMALISED postcodes ("M1 1AE"). Unknown ones are absent. */
  postcodes(postcodes: readonly string[]): Promise<Map<string, GeoPoint>>;
  /** A town/city name, e.g. "Leeds". Null when nothing sensible matches. */
  place(name: string): Promise<GeoPoint | null>;
}

/** For tests and for adapters whose records already carry coordinates. */
export const nullGeocoder: Geocoder = {
  async postcodes() {
    return new Map();
  },
  async place() {
    return null;
  },
};

const COUNTRY: Readonly<Record<string, Country>> = {
  england: 'england',
  scotland: 'scotland',
  wales: 'wales',
  'northern ireland': 'northern-ireland',
};

const country = (c: string | null | undefined): Country | null =>
  COUNTRY[(c ?? '').trim().toLowerCase()] ?? null;

const BulkSchema = z.object({
  result: z.array(
    z.object({
      query: z.string(),
      result: z
        .object({
          latitude: z.number().nullable(),
          longitude: z.number().nullable(),
          region: z.string().nullable().optional(),
          country: z.string().nullable().optional(),
          outcode: z.string().nullable().optional(),
          admin_district: z.string().nullable().optional(),
        })
        .nullable(),
    }),
  ),
});

const PlacesSchema = z.object({
  result: z
    .array(
      z.object({
        name_1: z.string(),
        local_type: z.string().nullable().optional(),
        outcode: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .nullable(),
});

const BULK_MAX = 100;

export function createGeocoder(http: Http, baseUrl = 'https://api.postcodes.io'): Geocoder {
  const postcodeCache = new Map<string, GeoPoint | null>();
  const placeCache = new Map<string, GeoPoint | null>();

  return {
    async postcodes(postcodes) {
      const wanted = [
        ...new Set(postcodes.map(normalisePostcode).filter((p): p is string => p !== null)),
      ];
      const missing = wanted.filter((p) => !postcodeCache.has(p));
      for (let i = 0; i < missing.length; i += BULK_MAX) {
        const chunk = missing.slice(i, i + BULK_MAX);
        try {
          const body = BulkSchema.parse(
            await http.postJson(`${baseUrl}/postcodes`, { postcodes: chunk }, { retries: 2 }),
          );
          const answered = new Set<string>();
          for (const row of body.result) {
            const key = normalisePostcode(row.query) ?? row.query;
            answered.add(key);
            const r = row.result;
            const ok =
              r !== null &&
              r.latitude !== null &&
              r.longitude !== null &&
              isPlausiblyUk({ lat: r.latitude, lon: r.longitude });
            postcodeCache.set(
              key,
              ok
                ? {
                    lat: r.latitude as number,
                    lon: r.longitude as number,
                    region: regionFromPostcodesIo(r.region, r.country),
                    country: country(r.country),
                    outcode: r.outcode ?? null,
                    district: r.admin_district ?? null,
                  }
                : null,
            );
          }
          // Not answered at all (service hiccup): leave uncached so a later call can retry.
          for (const p of chunk) if (!answered.has(p)) postcodeCache.delete(p);
        } catch {
          // Best-effort: carry on without coordinates for this chunk.
        }
      }
      const out = new Map<string, GeoPoint>();
      for (const p of wanted) {
        const hit = postcodeCache.get(p);
        if (hit) out.set(p, hit);
      }
      return out;
    },

    async place(name) {
      const key = name.trim().toLowerCase();
      if (!key) return null;
      if (placeCache.has(key)) return placeCache.get(key) ?? null;
      try {
        const body = PlacesSchema.parse(
          await http.getJson(`${baseUrl}/places?q=${encodeURIComponent(name.trim())}&limit=10`, {
            retries: 2,
          }),
        );
        const best = rankPlaces(body.result ?? [], name)[0];
        const point: GeoPoint | null =
          best && isPlausiblyUk({ lat: best.latitude, lon: best.longitude })
            ? {
                lat: best.latitude,
                lon: best.longitude,
                region: regionFromPostcodesIo(best.region, best.country),
                country: country(best.country),
                outcode: best.outcode ?? null,
              }
            : null;
        placeCache.set(key, point);
        return point;
      } catch {
        return null;
      }
    },
  };
}
