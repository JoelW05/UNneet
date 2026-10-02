import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, makePartner } from './helpers/harness';

let h: Harness;
let key: string;
beforeAll(async () => {
  h = await createHarness({ env: { INTERNAL_TOKEN: 't'.repeat(32) } });
  key = await makePartner(h.handle, { id: 'partner-riverside-college', name: 'Riverside College' });
}, 120_000);
afterAll(async () => {
  await h?.stop();
});

const listing = (id: string, over: Record<string, unknown> = {}) => ({
  externalId: id,
  type: 'course',
  title: `Level 2 Plumbing ${id}`,
  description: 'Learn domestic plumbing in our workshop. No experience needed.',
  organisation: { name: 'Riverside College', url: 'https://riverside.example/' },
  applyUrl: `https://riverside.example/courses/${id}`,
  location: { label: 'Leeds', postcode: 'LS1 4AP', workMode: 'onsite' },
  level: 2,
  cost: { kind: 'free', amount: null },
  ...over,
});

describe('POST /v1/partner/opportunities', () => {
  it('needs a valid API key', async () => {
    const none = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      json: { opportunities: [listing('a')] },
    });
    expect(none.status).toBe(401);
    const bad = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      json: { opportunities: [listing('a')] },
      headers: { 'x-api-key': 'unn_not-a-real-key' },
    });
    expect(bad.status).toBe(401);
  });

  it('stores listings under the partner, geocodes the postcode, and makes them searchable', async () => {
    const r = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      headers: { 'x-api-key': key },
      json: {
        opportunities: [
          listing('plumb-1'),
          listing('plumb-2', { title: 'Level 3 Electrical Installation' }),
        ],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ received: 2, valid: 2, rejected: 0, created: 2, updated: 0 });

    const found = await h.call('/v1/opportunities?q=plumbing&near=leeds&radius=5');
    const hit = found.body.items.find(
      (i: { organisation: { name: string } }) => i.organisation.name === 'Riverside College',
    );
    expect(hit).toBeTruthy();
    expect(hit.distanceMiles).toBeLessThan(2);
    expect(hit.source).toMatchObject({ providerName: 'Riverside College', isSample: false });
    expect(hit.source.attribution).toMatch(/Riverside College/);
  });

  it('is idempotent: re-sending updates in place instead of duplicating', async () => {
    const batch = { opportunities: [listing('plumb-1')] };
    const again = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      headers: { 'x-api-key': key },
      json: batch,
    });
    expect(again.body).toMatchObject({ created: 0, unchanged: 1 });
    const changed = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      headers: { 'x-api-key': key },
      json: {
        opportunities: [
          listing('plumb-1', { description: 'Updated description for the plumbing course.' }),
        ],
      },
    });
    expect(changed.body).toMatchObject({ created: 0, updated: 1 });
  });

  it('rejects an invalid batch with an error that says which listing and field', async () => {
    const r = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      headers: { 'x-api-key': key },
      json: {
        opportunities: [
          listing('ok-1'),
          listing('bad-1', { applyUrl: 'http://not-secure.example' }),
        ],
      },
    });
    expect(r.status).toBe(422);
    expect(r.body.errors[0].path).toMatch(/^opportunities\.1\.applyUrl/);
    // Nothing from the failed batch was stored.
    const found = await h.call('/v1/opportunities?q=ok-1');
    expect(found.body.items.some((i: { title: string }) => i.title.includes('ok-1'))).toBe(false);
  });

  it('caps a batch at 200 listings', async () => {
    const many = Array.from({ length: 201 }, (_, i) => listing(`bulk-${i}`));
    const r = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      headers: { 'x-api-key': key },
      json: { opportunities: many },
    });
    expect([413, 422]).toContain(r.status);
  });

  it('is server-to-server only: no CORS for browsers', async () => {
    const r = await h.call('/v1/partner/opportunities', {
      method: 'POST',
      headers: { 'x-api-key': key, origin: 'https://evil.example' },
      json: { opportunities: [listing('cors-1')] },
    });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('/internal', () => {
  const token = { 'x-internal-token': 't'.repeat(32) };

  it('rejects a missing or wrong token', async () => {
    expect((await h.call('/internal/ingest/runs')).status).toBe(401);
    expect(
      (await h.call('/internal/ingest/runs', { headers: { 'x-internal-token': 'wrong' } })).status,
    ).toBe(401);
  });

  it('lists recent ingest runs', async () => {
    const r = await h.call('/internal/ingest/runs', { headers: token });
    expect(r.status).toBe(200);
    expect(r.body.runs.length).toBeGreaterThan(0);
    expect(r.body.runs[0]).toHaveProperty('providerId');
  });

  it('starts an ingest in the background with 202, passing limit and dry-run through', async () => {
    const r = await h.call('/internal/ingest/gias?limit=50&dryRun=1', {
      method: 'POST',
      headers: token,
    });
    expect(r.status).toBe(202);
    expect(h.ingestCalls.at(-1)).toEqual({
      providerId: 'gias',
      options: { limit: 50, dryRun: true },
    });
  });

  it('reports an unknown provider and a provider that is already running', async () => {
    h.setIngestResult({ status: 'unknown-provider' });
    expect((await h.call('/internal/ingest/nope', { method: 'POST', headers: token })).status).toBe(
      404,
    );
    h.setIngestResult({ status: 'already-running' });
    expect((await h.call('/internal/ingest/gias', { method: 'POST', headers: token })).status).toBe(
      409,
    );
    h.setIngestResult({ status: 'started' });
  });

  it('does not exist at all when no token is configured', async () => {
    const closed = await createHarness({ seed: false });
    try {
      expect((await closed.call('/internal/ingest/runs', { headers: token })).status).toBe(404);
    } finally {
      await closed.stop();
    }
  });
});
