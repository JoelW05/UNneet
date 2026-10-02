/**
 * Live link checker for every URL in editorial content.
 *
 *   pnpm content:check-links
 *
 * Fails (exit 1) on: 404/410/5xx, DNS/TLS errors, and — importantly — redirects to a DIFFERENT
 * registrable domain (a lapsed domain redirecting to spam is how editorial links go bad: this is
 * exactly what happened to do-it.org while building this). Bot-protected sites that answer 401/403/
 * 429/503 are reported as "unverified" and only warn, because we can't tell from a script.
 */
import {
  ATTRIBUTIONS,
  CALENDAR_EVENTS,
  CURATED_OPPORTUNITIES,
  PATHWAYS,
  TIMELINE_RULES,
} from '../src/index';

interface Target {
  url: string;
  where: string;
}

function collect(): Target[] {
  const out: Target[] = [];
  for (const o of CURATED_OPPORTUNITIES) {
    out.push({ url: o.applyUrl, where: `programme:${o.externalId}` });
    if (o.organisation.url)
      out.push({ url: o.organisation.url, where: `programme:${o.externalId}:org` });
  }
  for (const p of PATHWAYS)
    for (const s of p.sources) out.push({ url: s.url, where: `pathway:${p.slug}` });
  for (const r of TIMELINE_RULES) {
    for (const s of r.sources) out.push({ url: s.url, where: `rule:${r.id}` });
    if (r.action?.href) out.push({ url: r.action.href, where: `rule:${r.id}:action` });
  }
  for (const e of CALENDAR_EVENTS) out.push({ url: e.source.url, where: `event:${e.id}` });
  for (const a of ATTRIBUTIONS) out.push({ url: a.url, where: `attribution:${a.id}` });
  const seen = new Set<string>();
  return out.filter((t) => {
    if (seen.has(t.url)) return false;
    seen.add(t.url);
    return true;
  });
}

const MULTI_PART_SUFFIXES = [
  'gov.uk',
  'co.uk',
  'org.uk',
  'ac.uk',
  'mod.uk',
  'nhs.uk',
  'gov.wales',
  'sch.uk',
];

export function registrableDomain(host: string): string {
  const labels = host
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.');
  const tail2 = labels.slice(-2).join('.');
  const take = MULTI_PART_SUFFIXES.includes(tail2) ? 3 : 2;
  return labels.slice(-take).join('.');
}

type Verdict = 'ok' | 'unverified' | 'fail';
interface Result extends Target {
  verdict: Verdict;
  detail: string;
}

async function check(target: Target): Promise<Result> {
  try {
    const res = await fetch(target.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; UnNEET-linkcheck/1.0)',
        accept: 'text/html,*/*',
      },
    });
    await res.body?.cancel();
    const finalHost = new URL(res.url).hostname;
    const fromHost = new URL(target.url).hostname;
    if (registrableDomain(finalHost) !== registrableDomain(fromHost)) {
      return { ...target, verdict: 'fail', detail: `redirects to different domain: ${res.url}` };
    }
    if (res.ok) return { ...target, verdict: 'ok', detail: `${res.status}` };
    if ([401, 403, 429, 503].includes(res.status)) {
      return { ...target, verdict: 'unverified', detail: `${res.status} (likely bot protection)` };
    }
    return { ...target, verdict: 'fail', detail: `${res.status}` };
  } catch (error) {
    // Node's fetch hides the real reason in `cause` ("fetch failed" tells you nothing).
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string; message?: string } | undefined)
        : undefined;
    const code = cause?.code ?? '';
    const message = `${error instanceof Error ? error.message : String(error)}${code ? ` [${code}]` : ''}`;
    // Timeouts, and servers that send headers bigger than Node's 16KB limit (browsers cope; we
    // can't), say nothing about whether the link works, so they warn instead of failing.
    const inconclusive = /timeout|aborted/i.test(message) || code === 'UND_ERR_HEADERS_OVERFLOW';
    return { ...target, verdict: inconclusive ? 'unverified' : 'fail', detail: message };
  }
}

async function main(): Promise<void> {
  const targets = collect();
  const results: Result[] = [];
  let next = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (next < targets.length) {
      const target = targets[next++] as Target;
      results.push(await check(target));
    }
  });
  await Promise.all(workers);

  const order: Record<Verdict, number> = { fail: 0, unverified: 1, ok: 2 };
  results.sort((a, b) => order[a.verdict] - order[b.verdict] || a.url.localeCompare(b.url));
  for (const r of results) {
    const icon = r.verdict === 'ok' ? '✓' : r.verdict === 'unverified' ? '?' : '✗';
    if (r.verdict !== 'ok') console.info(`${icon} ${r.detail.padEnd(40)} ${r.url}  (${r.where})`);
  }
  const fails = results.filter((r) => r.verdict === 'fail').length;
  const unverified = results.filter((r) => r.verdict === 'unverified').length;
  console.info(
    `\n${results.length} links · ${results.length - fails - unverified} ok · ${unverified} unverified · ${fails} failed`,
  );
  if (fails > 0) process.exit(1);
}

await main();
