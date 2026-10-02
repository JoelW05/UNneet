import { HttpError } from '../../http';
import type { AdapterContext, Mapped, ProviderAdapter } from '../../types';
import { ashbyUrl, greenhouseUrl, leverUrl, mapAshby, mapGreenhouse, mapLever } from './boards';
import {
  ATS_PROVIDERS,
  type AtsEmployer,
  type AtsJob,
  type AtsKind,
  type AtsRecord,
  atsJobToInput,
  isUkJob,
  placeFromLocation,
} from './common';

export * from './boards';
export * from './common';

const ENDPOINT: Readonly<Record<AtsKind, (token: string) => string>> = {
  greenhouse: greenhouseUrl,
  lever: leverUrl,
  ashby: ashbyUrl,
};

/** Pull the list of postings out of each vendor's response envelope. */
function postingsOf(ats: AtsKind, body: unknown): unknown[] {
  if (ats === 'lever') return Array.isArray(body) ? body : [];
  const jobs = (body as { jobs?: unknown } | null)?.jobs;
  return Array.isArray(jobs) ? jobs : [];
}

const MAPPER: Readonly<Record<AtsKind, (raw: unknown, e: AtsEmployer) => AtsJob | null>> = {
  greenhouse: mapGreenhouse,
  lever: mapLever,
  ashby: mapAshby,
};

export function isAtsRecord(raw: unknown): raw is AtsRecord {
  return (
    typeof raw === 'object' && raw !== null && 'employer' in raw && 'id' in raw && 'url' in raw
  );
}

/**
 * One adapter per applicant-tracking system, covering every employer registered for it. Only UK
 * jobs are kept (`isUkJob`), and each is geocoded from its stated place.
 *
 * Failure policy: a board that is GONE (404) just has no jobs. A board that errors for any other
 * reason is retried by the HTTP client; if it still fails we carry on with the others and throw
 * at the end, so the run is reported as failed and, crucially, NOTHING is expired on the strength
 * of a board we could not read.
 */
export function createAtsAdapter(ats: AtsKind, employers: readonly AtsEmployer[]): ProviderAdapter {
  const mine = employers.filter((e) => e.ats === ats);
  return {
    meta: ATS_PROVIDERS[ats],
    fullFeed: true,
    isConfigured: () => mine.length > 0,
    async *fetch(ctx: AdapterContext) {
      const failures: string[] = [];
      for (const employer of mine) {
        let body: unknown;
        try {
          body = await ctx.http.getJson(ENDPOINT[ats](employer.token), {
            timeoutMs: 60_000,
            retries: 2,
          });
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) {
            ctx.logger.warn(`${ats}/${employer.token}: board not found (employer may have left)`);
            continue;
          }
          failures.push(
            `${employer.token}: ${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }

        const jobs = postingsOf(ats, body)
          .map((raw) => MAPPER[ats](raw, employer))
          .filter((j): j is AtsJob => j !== null && isUkJob(j.locationText, j.countryCode));

        // Geocode the distinct places once per employer.
        const places = new Map<string, Awaited<ReturnType<typeof ctx.geocoder.place>>>();
        for (const job of jobs) {
          const place = placeFromLocation(job.locationText);
          if (place && !places.has(place.toLowerCase())) {
            places.set(place.toLowerCase(), await ctx.geocoder.place(place));
          }
        }
        for (const job of jobs) {
          const place = placeFromLocation(job.locationText);
          const geo = place ? places.get(place.toLowerCase()) : null;
          yield {
            ...job,
            ...(place ? { _place: place } : {}),
            ...(geo ? { _geo: geo } : {}),
          } satisfies AtsRecord;
        }
      }
      if (failures.length > 0) {
        throw new Error(
          `Could not read ${failures.length} board(s): ${failures.slice(0, 5).join(' | ')}`,
        );
      }
    },
    map(raw): Mapped {
      if (!isAtsRecord(raw)) return { ok: false, reason: 'not an ATS record' };
      const input = atsJobToInput(raw);
      return 'reject' in input ? { ok: false, reason: input.reject } : { ok: true, input };
    },
  };
}
