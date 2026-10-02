import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, signIn, WEB_ORIGIN } from './helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.stop();
});

const same = { origin: WEB_ORIGIN };
let n = 0;
const freshIp = () => `10.1.${Math.floor(++n / 250)}.${n % 250}`;

describe('requesting a sign-in code', () => {
  it('requires the 16+ confirmation', async () => {
    const r = await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email: 'kid@example.com', ageConfirmed: false },
      headers: same,
      ip: freshIp(),
    });
    expect(r.status).toBe(422);
    expect(r.body.detail).toMatch(/16 or over/);
    expect(r.body.errors[0].path).toBe('ageConfirmed');
    expect(h.email.lastOtpFor('kid@example.com')).toBeUndefined();
  });

  it('validates the e-mail address', async () => {
    const r = await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email: 'not-an-email', ageConfirmed: true },
      headers: same,
      ip: freshIp(),
    });
    expect(r.status).toBe(422);
  });

  it('emails a 6-digit code and answers identically for new and existing addresses', async () => {
    const a = await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email: 'New.Person@Example.com', ageConfirmed: true },
      headers: same,
      ip: freshIp(),
    });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ ok: true, expiresInSeconds: 600 });
    expect(h.email.lastOtpFor('new.person@example.com')).toMatch(/^\d{6}$/);
  });

  it("Better Auth's own send-code endpoint is disabled, so the age gate cannot be skipped", async () => {
    const res = await h.app.request('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email: 'sneaky@example.com', type: 'sign-in' }),
    });
    expect(res.status).toBe(404);
    expect(h.email.lastOtpFor('sneaky@example.com')).toBeUndefined();
  });

  it('limits code requests per address and per IP', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(
        (
          await h.call('/v1/auth/otp', {
            method: 'POST',
            json: { email: 'spam@example.com', ageConfirmed: true },
            headers: same,
            ip,
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429); // 3 per address per 10 minutes
    const other = await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email: 'someone-else@example.com', ageConfirmed: true },
      headers: same,
      ip: freshIp(),
    });
    expect(other.status).toBe(200);
  });

  it('only the website origin may call it', async () => {
    const r = await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email: 'x@example.com', ageConfirmed: true },
      headers: { origin: 'https://evil.example' },
      ip: freshIp(),
    });
    expect(r.status).toBe(403);
  });
});

describe('signing in with the code', () => {
  it('rejects a wrong code, and a code reused after success', async () => {
    const email = 'wrong.code@example.com';
    await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email, ageConfirmed: true },
      headers: same,
      ip: freshIp(),
    });
    const bad = await h.app.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, otp: '000000' }),
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.headers.getSetCookie()).toHaveLength(0);

    const otp = h.email.lastOtpFor(email) as string;
    const good = await h.app.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, otp }),
    });
    expect(good.status).toBe(200);
    const cookies = good.headers.getSetCookie().join('\n');
    expect(cookies).toMatch(/better-auth\.session_token/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);

    const again = await h.app.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, otp }),
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a sign-in from a foreign origin (CSRF)', async () => {
    const email = 'csrf@example.com';
    await h.call('/v1/auth/otp', {
      method: 'POST',
      json: { email, ageConfirmed: true },
      headers: same,
      ip: freshIp(),
    });
    const res = await h.app.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email, otp: h.email.lastOtpFor(email) }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe('the signed-in area', () => {
  it('needs a session', async () => {
    for (const path of ['/v1/me', '/v1/me/profile', '/v1/me/saved', '/v1/me/export']) {
      const r = await h.call(path);
      expect(r.status, path).toBe(401);
      expect(r.headers.get('content-type')).toContain('application/problem+json');
    }
    expect(
      (await h.call('/v1/me/profile', { method: 'PUT', json: {}, headers: same })).status,
    ).toBe(401);
  });

  it('a session cookie is not enough from another origin: unsafe methods must come from the website', async () => {
    const cookie = await signIn(h, 'origin.check@example.com');
    const r = await h.call('/v1/me/profile', {
      method: 'PUT',
      json: { highestLevel: 3 },
      cookie,
      headers: { origin: 'https://evil.example' },
    });
    expect(r.status).toBe(403);
  });

  it('saves and reads a profile, validating it', async () => {
    const cookie = await signIn(h, 'profile.person@example.com');
    const me = await h.call('/v1/me', { cookie });
    expect(me.body.user.email).toBe('profile.person@example.com');
    expect((await h.call('/v1/me/profile', { cookie })).body).toEqual({ profile: null });

    const put = await h.call('/v1/me/profile', {
      method: 'PUT',
      cookie,
      headers: same,
      json: {
        highestLevel: 2,
        goal: 'earn-now',
        skills: [{ id: 'teamwork', label: 'Teamwork', level: 3 }],
        stage: 'year-11',
      },
    });
    expect(put.status).toBe(200);
    const got = (await h.call('/v1/me/profile', { cookie })).body.profile;
    expect(got).toMatchObject({
      highestLevel: 2,
      goal: 'earn-now',
      stage: 'year-11',
      budget: 'any',
    });
    expect(got.skills[0]).toMatchObject({ id: 'teamwork', level: 3 });

    const bad = await h.call('/v1/me/profile', {
      method: 'PUT',
      cookie,
      headers: same,
      json: { highestLevel: 12 },
    });
    expect(bad.status).toBe(422);
  });

  it('saves, lists and unsaves opportunities', async () => {
    const cookie = await signIn(h, 'saver@example.com');
    const found = (await h.call('/v1/opportunities?q=careers')).body.items[0];
    expect(
      (await h.call(`/v1/me/saved/${found.id}`, { method: 'PUT', cookie, headers: same })).status,
    ).toBe(204);
    expect(
      (await h.call(`/v1/me/saved/${found.id}`, { method: 'PUT', cookie, headers: same })).status,
    ).toBe(204); // idempotent
    const list = await h.call('/v1/me/saved', { cookie });
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([found.id]);

    expect(
      (
        await h.call('/v1/me/saved/00000000-0000-4000-8000-000000000000', {
          method: 'PUT',
          cookie,
          headers: same,
        })
      ).status,
    ).toBe(404);
    expect(
      (await h.call('/v1/me/saved/not-a-uuid', { method: 'PUT', cookie, headers: same })).status,
    ).toBe(422);

    expect(
      (await h.call(`/v1/me/saved/${found.id}`, { method: 'DELETE', cookie, headers: same }))
        .status,
    ).toBe(204);
    expect((await h.call('/v1/me/saved', { cookie })).body.items).toEqual([]);
  });

  it("keeps users apart: one person never sees another's data", async () => {
    const alice = await signIn(h, 'alice@example.com');
    const bob = await signIn(h, 'bob@example.com');
    await h.call('/v1/me/profile', {
      method: 'PUT',
      cookie: alice,
      headers: same,
      json: { highestLevel: 5, goal: 'learn-first' },
    });
    const found = (await h.call('/v1/opportunities?q=careers')).body.items[0];
    await h.call(`/v1/me/saved/${found.id}`, { method: 'PUT', cookie: alice, headers: same });

    expect((await h.call('/v1/me/profile', { cookie: bob })).body).toEqual({ profile: null });
    expect((await h.call('/v1/me/saved', { cookie: bob })).body.items).toEqual([]);
    const bobExport = (await h.call('/v1/me/export', { cookie: bob })).body;
    expect(bobExport.account.email).toBe('bob@example.com');
    expect(JSON.stringify(bobExport)).not.toContain('alice@example.com');
  });

  it('exports everything held about the person (UK GDPR Art. 20)', async () => {
    const cookie = await signIn(h, 'export@example.com');
    await h.call('/v1/me/profile', {
      method: 'PUT',
      cookie,
      headers: same,
      json: { highestLevel: 3 },
    });
    await h.call('/v1/me/quiz-results', {
      method: 'POST',
      cookie,
      headers: same,
      json: { quizId: 'interests', result: { code: 'SIA' } },
    });
    const r = await h.call('/v1/me/export', { cookie });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(r.body).toMatchObject({
      account: { email: 'export@example.com' },
      profile: { highestLevel: 3 },
      quizResults: [{ quizId: 'interests', result: { code: 'SIA' } }],
    });
    expect(r.body.exportedAt).toMatch(/^\d{4}-/);
  });

  it('erases the account and everything attached to it (UK GDPR Art. 17)', async () => {
    const email = 'erase.me@example.com';
    const cookie = await signIn(h, email);
    await h.call('/v1/me/profile', {
      method: 'PUT',
      cookie,
      headers: same,
      json: { highestLevel: 4 },
    });
    const found = (await h.call('/v1/opportunities?q=careers')).body.items[0];
    await h.call(`/v1/me/saved/${found.id}`, { method: 'PUT', cookie, headers: same });

    const del = await h.app.request('/v1/me', {
      method: 'DELETE',
      headers: { cookie, origin: WEB_ORIGIN },
    });
    expect(del.status).toBe(204);
    expect(del.headers.getSetCookie().join('\n')).toMatch(/Max-Age=0/);

    // The old session is dead...
    expect((await h.call('/v1/me', { cookie })).status).toBe(401);
    // ...and every row is gone.
    const { schema } = await import('./helpers/harness');
    const { eq } = await import('drizzle-orm');
    expect(
      await h.handle.db.select().from(schema.authUser).where(eq(schema.authUser.email, email)),
    ).toHaveLength(0);
    expect(await h.handle.db.select().from(schema.profiles)).not.toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ highestLevel: 4 }) }),
    );
  });

  it('signing in again with a deleted address starts a brand-new, empty account', async () => {
    const email = 'comes.back@example.com';
    const first = await signIn(h, email);
    await h.call('/v1/me/profile', {
      method: 'PUT',
      cookie: first,
      headers: same,
      json: { highestLevel: 6 },
    });
    await h.app.request('/v1/me', {
      method: 'DELETE',
      headers: { cookie: first, origin: WEB_ORIGIN },
    });
    const second = await signIn(h, email);
    expect((await h.call('/v1/me/profile', { cookie: second })).body).toEqual({ profile: null });
  });

  it('rejects an oversized quiz result', async () => {
    const cookie = await signIn(h, 'big.quiz@example.com');
    const r = await h.call('/v1/me/quiz-results', {
      method: 'POST',
      cookie,
      headers: same,
      json: { quizId: 'interests', result: { blob: 'x'.repeat(9000) } },
    });
    expect(r.status).toBe(422);
  });
});
