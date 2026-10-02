/**
 * `pnpm --filter @unneet/ingest ats:discover`
 *
 * Probes every name in ats-candidates.ts against the public Greenhouse, Lever and Ashby job-board
 * APIs, keeps the boards that exist AND currently have UK jobs, and writes the verified registry
 * to src/adapters/ats/employers.ts. Re-run it every few months: companies move ATS, and new ones
 * are added to the candidate list.
 *
 * Polite by design: 5 requests in flight, identifies itself, and only GETs public endpoints.
 */
import { writeFileSync } from 'node:fs';
import {
  type AtsEmployer,
  type AtsJob,
  type AtsKind,
  ashbyUrl,
  greenhouseUrl,
  isUkJob,
  leverUrl,
  mapAshby,
  mapGreenhouse,
  mapLever,
} from '../src/adapters/ats';
import { USER_AGENT } from '../src/http';
import { CANDIDATES, parseCandidate } from './ats-candidates';

const OUT = new URL('../src/adapters/ats/employers.ts', import.meta.url);
const CONCURRENCY = 5;

interface Hit {
  employer: AtsEmployer;
  total: number;
  uk: number;
  sample: string[];
  /** Lower-cased UK job titles, for spotting a stale mirror of the same board on another ATS. */
  titles: Set<string>;
}

const URLS: Record<AtsKind, (t: string) => string> = {
  greenhouse: greenhouseUrl,
  lever: leverUrl,
  ashby: (t) => ashbyUrl(t).replace('includeCompensation=true', 'includeCompensation=false'),
};
const MAPPERS: Record<AtsKind, (raw: unknown, e: AtsEmployer) => AtsJob | null> = {
  greenhouse: mapGreenhouse,
  lever: mapLever,
  ashby: mapAshby,
};

async function probe(ats: AtsKind, token: string, name: string): Promise<Hit | null> {
  let res: Response;
  try {
    res = await fetch(URLS[ats](token), {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const raw =
    ats === 'lever'
      ? Array.isArray(body)
        ? body
        : []
      : ((body as { jobs?: unknown[] })?.jobs ?? []);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const employer: AtsEmployer = { ats, token, name };
  const jobs = raw.map((r) => MAPPERS[ats](r, employer)).filter((j): j is AtsJob => j !== null);
  const uk = jobs.filter((j) => isUkJob(j.locationText, j.countryCode));
  return {
    employer,
    total: jobs.length,
    uk: uk.length,
    sample: uk.slice(0, 2).map((j) => `${j.title} (${j.locationText.slice(0, 30)})`),
    titles: new Set(uk.map((j) => j.title.toLowerCase())),
  };
}

async function pool<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i] as T);
        await new Promise((r) => setTimeout(r, 60));
      }
    }),
  );
  return out;
}

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] as
  | AtsKind
  | undefined;
const kinds: AtsKind[] = only ? [only] : ['greenhouse', 'lever', 'ashby'];

const tasks = CANDIDATES.flatMap((line) => {
  const { name, slugs } = parseCandidate(line);
  return kinds.map((ats) => ({ name, slugs, ats }));
});
console.info(`Probing ${tasks.length} (employer × ATS) pairs…`);

const results = await pool(tasks, CONCURRENCY, async ({ name, slugs, ats }) => {
  let best: Hit | null = null;
  for (const slug of slugs) {
    const hit = await probe(ats, slug, name);
    if (hit && (!best || hit.uk > best.uk)) best = hit;
    if (best && best.uk > 0) break; // first board with UK jobs wins
  }
  return best;
});

const hits = results.filter((h): h is Hit => h !== null && h.uk > 0);
hits.sort((a, b) => b.uk - a.uk);

// 1. The same board reached through two candidate names (e.g. "Deliveroo" and "Deliveroo Editions"
//    both slug to "deliveroo"): keep it once.
const seenBoards = new Set<string>();
const unique = hits.filter((h) => {
  const key = `${h.employer.ats}:${h.employer.token}`;
  if (seenBoards.has(key)) return false;
  seenBoards.add(key);
  return true;
});

// 2. A company that moved ATS can leave a stale mirror on the old one. If two boards for the same
//    employer share at least half their UK job titles, keep only the bigger board.
const overlap = (a: Set<string>, b: Set<string>): number => {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.max(1, Math.min(a.size, b.size));
};
const found = unique.filter(
  (h, i) =>
    !unique
      .slice(0, i)
      .some(
        (bigger) =>
          (bigger.employer.token === h.employer.token ||
            bigger.employer.name.toLowerCase() === h.employer.name.toLowerCase()) &&
          bigger.employer.ats !== h.employer.ats &&
          overlap(bigger.titles, h.titles) >= 0.5,
      ),
);
found.sort(
  (a, b) =>
    a.employer.name.localeCompare(b.employer.name) || a.employer.ats.localeCompare(b.employer.ats),
);

console.info(
  `\nFound ${found.length} boards with UK jobs, ${found.reduce((n, h) => n + h.uk, 0)} UK jobs in total\n`,
);
for (const h of found) {
  console.info(
    `${h.employer.ats.padEnd(10)} ${h.employer.token.padEnd(24)} ${h.employer.name.padEnd(28)} UK ${String(h.uk).padStart(4)} / ${String(h.total).padStart(4)}   e.g. ${h.sample[0] ?? ''}`,
  );
}

const date = new Date().toISOString().slice(0, 10);
const body = `// GENERATED by \`pnpm --filter @unneet/ingest ats:discover\` on ${date}. Re-run it rather than editing by hand.
// Every entry is a public job board that existed AND had UK jobs on that date.
import type { AtsEmployer } from './common';

export const ATS_VERIFIED_ON = '${date}';

export const ATS_EMPLOYERS: readonly AtsEmployer[] = [
${found.map((h) => `  { ats: '${h.employer.ats}', token: ${JSON.stringify(h.employer.token)}, name: ${JSON.stringify(h.employer.name)} },`).join('\n')}
];
`;
writeFileSync(OUT, body);
console.info(`\nWrote ${found.length} employers to src/adapters/ats/employers.ts`);
