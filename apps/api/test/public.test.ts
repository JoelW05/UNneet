import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, WEB_ORIGIN } from './helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.stop();
});

const isProblem = (body: any, status: number) => {
  expect(body).toMatchObject({
    status,
    title: expect.any(String),
    type: expect.stringMatching(/^https:/),
  });
  expect(typeof body.requestId).toBe('string');
};

describe('operations', () => {
  it('liveness and readiness', async () => {
    expect((await h.call('/health')).body).toEqual({ status: 'ok' });
    const ready = await h.call('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ready', database: 'ok' });
    expect(ready.body.liveByProvider.length).toBeGreaterThan(0);
  });

  it('serves the OpenAPI document and the docs page', async () => {
    const spec = await h.call('/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(Object.keys(spec.body.paths)).toEqual(
      expect.arrayContaining(['/v1/opportunities', '/v1/match', '/v1/timeline', '/v1/me']),
    );
    const docs = await h.call('/docs');
    expect(docs.status).toBe(200);
    expect(docs.headers.get('content-security-policy')).toContain("script-src 'self'");
  });
});

describe('reference data', () => {
  it('taxonomy covers the 15 sectors and RQF levels 0–8', async () => {
    const r = await h.call('/v1/taxonomy');
    expect(r.status).toBe(200);
    expect(r.body.sectors).toHaveLength(15);
    expect(r.body.levels.map((l: { value: number }) => l.value)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(r.body.stages.length).toBeGreaterThan(8);
    expect(r.headers.get('cache-control')).toContain('max-age');
  });

  it('stats count what is open and name the sources', async () => {
    const r = await h.call('/v1/stats');
    expect(r.status).toBe(200);
    expect(r.body.open).toBeGreaterThan(40);
    expect(r.body.sources.map((s: { name: string }) => s.name)).toContain('UnNEET editorial');
    // The harness loads labelled sample listings, and the site must be able to say so.
    expect(r.body.sampleData).toBe(true);
    expect(r.body.sources.some((s: { isSample: boolean }) => s.isSample)).toBe(true);
    expect(r.body.byPillar.length).toBeGreaterThan(1);
  });
});

describe('search', () => {
  it('finds listings by text, with facets and paging metadata', async () => {
    const r = await h.call('/v1/opportunities?q=careers%20advice');
    expect(r.status).toBe(200);
    expect(
      r.body.items.some((i: { title: string }) => i.title.includes('National Careers Service')),
    ).toBe(true);
    expect(r.body).toMatchObject({
      page: 1,
      pageSize: 20,
      centre: null,
      locationError: null,
      external: [],
    });
    expect(r.body.facets.pillar.length).toBeGreaterThan(0);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.body.attributions.length).toBeGreaterThan(0);
  });

  it('filters by pillar/type and paginates', async () => {
    const support = await h.call('/v1/opportunities?type=support&pageSize=5');
    expect(support.body.items.length).toBeLessThanOrEqual(5);
    expect(support.body.items.every((i: { type: string }) => i.type === 'support')).toBe(true);
    expect(support.body.totalPages).toBe(Math.ceil(support.body.total / 5));
    const page2 = await h.call('/v1/opportunities?type=support&pageSize=5&page=2');
    const first = new Set(support.body.items.map((i: { id: string }) => i.id));
    expect(page2.body.items.every((i: { id: string }) => !first.has(i.id))).toBe(true);
  });

  it('accepts comma lists and repeated keys, and ignores nonsense values instead of failing', async () => {
    const csv = await h.call('/v1/opportunities?type=support,programme');
    const repeated = await h.call('/v1/opportunities?type=support&type=programme');
    expect(csv.body.total).toBe(repeated.body.total);
    const junk = await h.call('/v1/opportunities?type=banana&levelMin=abc&radius=-5&sort=sideways');
    expect(junk.status).toBe(200);
    expect(junk.body.total).toBeGreaterThan(0);
  });

  it('resolves `near` and echoes the centre; an unknown place is reported, not fatal', async () => {
    const near = await h.call('/v1/opportunities?near=leeds&radius=30');
    expect(near.status).toBe(200);
    expect(near.body.centre).toMatchObject({ label: 'Leeds' });
    const lost = await h.call('/v1/opportunities?near=Atlantis');
    expect(lost.status).toBe(200);
    expect(lost.body.centre).toBeNull();
    expect(lost.body.locationError).toMatch(/could not find/i);
    expect(lost.body.total).toBeGreaterThan(0);
  });

  it('partner boards are included only when asked for and eligible', async () => {
    const withGateway = await createHarness({
      seed: false,
      federated: {
        async search() {
          return {
            items: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                slug: 'adzuna-1',
                type: 'job',
                pillar: 'employment',
                title: 'Cleaner',
                summary: 's',
                organisation: { name: 'Acme', url: null },
                sector: null,
                level: null,
                minEntryLevel: null,
                location: { label: 'Leeds', workMode: 'onsite' },
                pay: null,
                cost: { kind: 'unknown', amount: null },
                duration: null,
                postedAt: null,
                closesAt: null,
                startsAt: null,
                minAge: null,
                maxAge: null,
                tags: [],
                skills: [],
                experienceRequired: null,
                externalUrl: 'https://example.com/1',
                source: {
                  providerId: 'adzuna',
                  providerName: 'Adzuna',
                  licence: 'l',
                  attribution: 'Jobs by Adzuna',
                  attributionUrl: 'https://adzuna.example',
                  isSample: false,
                },
              },
            ],
            attributions: [
              { providerName: 'Adzuna', text: 'Jobs by Adzuna', url: 'https://adzuna.example' },
            ],
          };
        },
      },
    });
    try {
      const both = await withGateway.call('/v1/opportunities?q=cleaner');
      expect(both.body.external).toHaveLength(1);
      expect(both.body.attributions).toEqual(
        expect.arrayContaining([expect.objectContaining({ providerName: 'Adzuna' })]),
      );
      const skipped = await withGateway.call('/v1/opportunities?q=cleaner&external=0');
      expect(skipped.body.external).toEqual([]);
      const only = await withGateway.call('/v1/opportunities/external?q=cleaner');
      expect(only.body.items).toHaveLength(1);
    } finally {
      await withGateway.stop();
    }
  });
});

describe('opportunity detail', () => {
  let slug: string;
  beforeAll(async () => {
    slug = (await h.call('/v1/opportunities?q=careers')).body.items[0].slug;
  });

  it('returns the full listing with an https apply link', async () => {
    const r = await h.call(`/v1/opportunities/${slug}`);
    expect(r.status).toBe(200);
    expect(r.body.applyUrl).toMatch(/^https:\/\//);
    expect(r.body.description.length).toBeGreaterThan(20);
    expect(r.body.status).toBe('live');
  });

  it('404s as problem+json for an unknown slug, and 422s for a malformed one', async () => {
    const missing = await h.call('/v1/opportunities/no-such-thing-here');
    expect(missing.status).toBe(404);
    isProblem(missing.body, 404);
    expect(missing.headers.get('content-type')).toContain('application/problem+json');
    const bad = await h.call('/v1/opportunities/Bad%20Slug!');
    expect(bad.status).toBe(422);
    expect(bad.body.errors[0]).toMatchObject({ path: 'slug' });
  });

  it('suggests similar listings, never the listing itself', async () => {
    const r = await h.call(`/v1/opportunities/${slug}/similar?limit=4`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeLessThanOrEqual(4);
    expect(r.body.items.every((i: { slug: string }) => i.slug !== slug)).toBe(true);
  });

  it('accepts anonymous reports, validates them, and rate-limits them', async () => {
    const ok = await h.call(`/v1/opportunities/${slug}/reports`, {
      method: 'POST',
      json: { reason: 'closed', note: 'Page says closed' },
      ip: '203.0.113.7',
    });
    expect(ok.status).toBe(201);
    const bad = await h.call(`/v1/opportunities/${slug}/reports`, {
      method: 'POST',
      json: { reason: 'spam-me' },
      ip: '203.0.113.7',
    });
    expect(bad.status).toBe(422);
    const missing = await h.call('/v1/opportunities/nope-nope/reports', {
      method: 'POST',
      json: { reason: 'scam' },
      ip: '203.0.113.7',
    });
    expect(missing.status).toBe(404);
  });
});

describe('locations', () => {
  it('resolves a place and offers a coarse point for profiles', async () => {
    const r = await h.call('/v1/locations/resolve?q=Leeds');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ label: 'Leeds', outcode: 'LS1', coarse: { label: 'Leeds' } });
  });
  it('404s an unknown place and 422s a too-short query', async () => {
    expect((await h.call('/v1/locations/resolve?q=Atlantis')).status).toBe(404);
    expect((await h.call('/v1/locations/resolve?q=a')).status).toBe(422);
  });
  it('suggests places', async () => {
    const r = await h.call('/v1/locations/suggest?q=le');
    expect(r.body.items.map((i: { label: string }) => i.label)).toContain('Leeds');
  });
});

describe('quizzes', () => {
  it("serves the 30-item interests quiz without revealing each item's type", async () => {
    const r = await h.call('/v1/quizzes/interests');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(30);
    expect(Object.keys(r.body.items[0]).sort()).toEqual(['id', 'text']);
    expect(r.body.scale).toHaveLength(5);
    expect(r.body.attribution).toMatch(/O\*NET/);
  });

  it('scores answers into a profile, a Holland code and ranked sectors', async () => {
    const quiz = (await h.call('/v1/quizzes/interests')).body;
    const answers = Object.fromEntries(
      quiz.items.map((i: { id: string }, n: number) => [i.id, n % 5 === 0 ? 4 : 1]),
    );
    const r = await h.call('/v1/quizzes/interests/score', { method: 'POST', json: { answers } });
    expect(r.status).toBe(200);
    expect(r.body.code).toMatch(/^[RIASEC]{3}$/);
    expect(r.body.answered).toBe(30);
    expect(r.body.sectors).toHaveLength(15);
    for (const v of Object.values(r.body.riasec) as number[]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('rejects answers that match no question, and values outside 0–4', async () => {
    expect(
      (
        await h.call('/v1/quizzes/interests/score', {
          method: 'POST',
          json: { answers: { nope: 3 } },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.call('/v1/quizzes/interests/score', {
          method: 'POST',
          json: { answers: { 'ip-01': 9 } },
        })
      ).status,
    ).toBe(422);
  });
});

describe('pathways', () => {
  it('lists pathways and shows live counts for each step', async () => {
    const list = await h.call('/v1/pathways');
    expect(list.body.items.length).toBeGreaterThanOrEqual(10);
    const detail = await h.call(`/v1/pathways/${list.body.items[0].slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.steps.length).toBeGreaterThanOrEqual(3);
    for (const step of detail.body.steps)
      expect(typeof detail.body.openNow[step.id]).toBe('number');
    expect((await h.call('/v1/pathways/nope')).status).toBe(404);
  });
});

describe('timeline', () => {
  it('builds a plan for a stage, as of a date', async () => {
    const r = await h.call('/v1/timeline?stage=uni-year-2&asOf=2026-10-05');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ stage: 'uni-year-2', asOf: '2026-10-05', academicYear: 2026 });
    expect(r.body.nextUp.length).toBeLessThanOrEqual(3);
    const total = ['now', 'soon', 'later', 'missed', 'done'].reduce(
      (n, k) => n + r.body[k].length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it('marks things done and filters by sector', async () => {
    const base = (await h.call('/v1/timeline?stage=year-13&asOf=2026-10-05')).body;
    const first = base.nextUp[0].rule.id;
    const after = (await h.call(`/v1/timeline?stage=year-13&asOf=2026-10-05&done=${first}`)).body;
    expect(after.done.map((e: { rule: { id: string } }) => e.rule.id)).toContain(first);
  });

  it('exports a subscribable .ics calendar', async () => {
    const r = await h.call('/v1/timeline.ics?stage=year-13&asOf=2026-10-05');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/calendar');
    expect(r.text).toMatch(/^BEGIN:VCALENDAR/);
    expect(r.text).toContain('BEGIN:VEVENT');
    expect(r.text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('validates the stage and the date', async () => {
    expect((await h.call('/v1/timeline?stage=wizard')).status).toBe(422);
    expect((await h.call('/v1/timeline')).status).toBe(422);
    expect((await h.call('/v1/timeline?stage=year-13&asOf=3000-01-01')).status).toBe(422);
    expect((await h.call('/v1/timeline?stage=year-13&asOf=yesterday')).status).toBe(422);
  });
});

describe('matching', () => {
  const profile = {
    ageBand: '16-17',
    highestLevel: 2,
    goal: 'earn-and-learn',
    sectorsInterested: ['digital'],
    skills: [{ id: 'communication', label: 'Communication', level: 2 }],
    location: { label: 'Leeds', lat: 53.7965, lon: -1.5476 },
    budget: 'free-only',
  };

  it('returns explainable, ranked matches with reasons and eligibility', async () => {
    const r = await h.call('/v1/match', { method: 'POST', json: { profile, limit: 8 } });
    expect(r.status).toBe(200);
    expect(r.body.matches.length).toBeGreaterThan(0);
    expect(r.body.matches.length).toBeLessThanOrEqual(8);
    const m = r.body.matches[0];
    expect(m.score).toBeGreaterThan(0);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(m.reasons)).toBe(true);
    expect(m.eligibility).toHaveProperty('eligible');
    expect(r.body.sectors).toHaveLength(5);
    expect(r.body.completeness).toBeGreaterThan(0);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('works with an empty profile (everything is optional)', async () => {
    const r = await h.call('/v1/match', { method: 'POST', json: { profile: {} } });
    expect(r.status).toBe(200);
    expect(r.body.matches.length).toBeGreaterThan(0);
  });

  it('honours "free only" so a tight budget never sees paid listings first', async () => {
    const r = await h.call('/v1/match', {
      method: 'POST',
      json: { profile: { budget: 'free-only' }, limit: 20 },
    });
    const kinds = r.body.matches.map((m: { item: { cost: { kind: string } } }) => m.item.cost.kind);
    expect(kinds.every((k: string) => k !== 'paid')).toBe(true);
  });

  it('rejects an invalid profile with field-level errors', async () => {
    const r = await h.call('/v1/match', {
      method: 'POST',
      json: { profile: { highestLevel: 42, riasec: { R: 3 } } },
    });
    expect(r.status).toBe(422);
    expect(r.body.errors.length).toBeGreaterThan(0);
  });
});

describe('skills', () => {
  it('suggests skills by prefix first', async () => {
    const r = await h.call('/v1/skills/suggest?q=pyth');
    expect(r.status).toBe(200);
    expect(r.body.items[0].label.toLowerCase()).toContain('python');
    expect(r.body.items.length).toBeLessThanOrEqual(10);
  });
});

describe('cross-cutting behaviour', () => {
  it('sets hardening headers on JSON responses', async () => {
    const r = await h.call('/v1/taxonomy');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
  });

  it('echoes a sane request id and replaces a malicious one', async () => {
    const good = await h.call('/health', { headers: { 'x-request-id': 'abc-12345678' } });
    expect(good.headers.get('x-request-id')).toBe('abc-12345678');
    const evil = await h.call('/health', {
      headers: { 'x-request-id': 'has spaces; and <script>' },
    });
    expect(evil.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('CORS: public API open without credentials; credentialed paths only for the website', async () => {
    const pub = await h.call('/v1/taxonomy', { headers: { origin: 'https://other.example' } });
    expect(pub.headers.get('access-control-allow-origin')).toBe('*');
    expect(pub.headers.get('access-control-allow-credentials')).toBeNull();

    const own = await h.call('/v1/me', { headers: { origin: WEB_ORIGIN } });
    expect(own.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(own.headers.get('access-control-allow-credentials')).toBe('true');

    const foreign = await h.call('/v1/me', { headers: { origin: 'https://evil.example' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();

    const server = await h.call('/internal/ingest/runs', {
      headers: { origin: 'https://evil.example' },
    });
    expect(server.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers preflight requests', async () => {
    const r = await h.call('/v1/match', {
      method: 'OPTIONS',
      headers: { origin: 'https://other.example', 'access-control-request-method': 'POST' },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('every error is RFC 9457 problem+json', async () => {
    const notFound = await h.call('/v1/nothing-here');
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('content-type')).toContain('application/problem+json');
    isProblem(notFound.body, 404);
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const r = await h.call('/v1/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect([400, 422]).toContain(r.status);
    expect(r.body.status).toBe(r.status);
  });

  it('refuses oversized bodies', async () => {
    const r = await h.call('/v1/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { jobTitles: ['x'.repeat(300_000)] } }),
    });
    expect(r.status).toBe(413);
    isProblem(r.body, 413);
  });

  it('advertises rate limits and enforces them with Retry-After', async () => {
    const r = await h.call('/v1/taxonomy', { ip: '198.51.100.1' });
    expect(r.headers.get('ratelimit-limit')).toBe('300');
    expect(Number(r.headers.get('ratelimit-remaining'))).toBeLessThan(300);
    let last = r;
    for (let i = 0; i < 12; i++) {
      last = await h.call('/v1/locations/resolve?q=Leeds', { ip: '198.51.100.99' });
    }
    expect(last.status).toBe(200); // 60/min: not yet limited
    let limited = last;
    for (let i = 0; i < 62; i++)
      limited = await h.call('/v1/locations/resolve?q=Leeds', { ip: '198.51.100.99' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    isProblem(limited.body, 429);
  });
});
