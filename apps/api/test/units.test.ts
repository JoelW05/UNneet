import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from '../src/env';
import { problemBody } from '../src/errors';
import { CV_LIMITS, CvError, extractCvText, inspectZip, sniffCvFormat } from '../src/lib/cv';
import { createCapturingEmailSender, createResendEmailSender } from '../src/lib/email';
import { createFederatedGateway, isEligible, NO_EXTERNAL } from '../src/lib/federated-gateway';
import { createPostcodesIoResolver, createStaticResolver } from '../src/lib/locations';
import { MemoryRateLimitStore } from '../src/lib/rate-limiter';
import { createLogger, REDACT_PATHS } from '../src/logger';
import { buildZip } from './helpers/zip';

describe('loadEnv', () => {
  it('has safe development defaults', () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      port: 4000,
      autoMigrate: true,
      allowSampleData: false,
    });
    expect(env.databaseUrl).toContain('127.0.0.1');
  });

  it('refuses unsafe production configuration, listing every problem at once', () => {
    try {
      loadEnv({
        NODE_ENV: 'production',
        WEB_ORIGIN: 'http://insecure.example',
        AUTH_SECRET: 'short',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as EnvError).message;
      expect(message).toMatch(/DATABASE_URL is required/);
      expect(message).toMatch(/AUTH_SECRET/);
      expect(message).toMatch(/https/);
      expect(message).toMatch(/RESEND_API_KEY/);
    }
  });

  it('accepts a complete production configuration and turns auto-migrate off', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db.internal:5432/unneet',
      AUTH_SECRET: 'x'.repeat(40),
      WEB_ORIGIN: 'https://unneet.uk/',
      RESEND_API_KEY: 're_123',
      INTERNAL_TOKEN: 'y'.repeat(30),
    });
    expect(env).toMatchObject({
      isProduction: true,
      autoMigrate: false,
      webOrigin: 'https://unneet.uk',
    });
  });

  it('rejects a bad port and a bad URL', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(EnvError);
    expect(() => loadEnv({ WEB_ORIGIN: 'not a url' })).toThrow(EnvError);
  });

  it('treats blank strings as unset', () => {
    expect(loadEnv({ REED_API_KEY: '  ' }).providerEnv.REED_API_KEY).toBeUndefined();
  });
});

describe('MemoryRateLimitStore', () => {
  it('counts per key within a window and resets after it', () => {
    let t = 1_000;
    const store = new MemoryRateLimitStore(() => t);
    expect(store.hit('a', 2, 1000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(store.hit('a', 2, 1000)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = store.hit('a', 2, 1000);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.resetSeconds).toBeGreaterThanOrEqual(1);
    expect(store.hit('b', 2, 1000).allowed).toBe(true);
    t += 1001;
    expect(store.hit('a', 2, 1000).allowed).toBe(true);
  });

  it('is bounded: a flood of unique keys cannot grow it without limit', () => {
    const store = new MemoryRateLimitStore(() => 0, 100);
    for (let i = 0; i < 1000; i++) store.hit(`k${i}`, 5, 60_000);
    expect(store.size).toBeLessThanOrEqual(100);
  });
});

describe('cv upload safety', () => {
  const docx = buildZip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': '<w:document/>',
  });

  it('decides the format from the bytes, not the name', () => {
    expect(sniffCvFormat(new TextEncoder().encode('%PDF-1.7\n...'))).toBe('pdf');
    expect(sniffCvFormat(new TextEncoder().encode('\n\n  %PDF-1.4'))).toBe('pdf');
    expect(sniffCvFormat(docx)).toBe('docx');
    expect(sniffCvFormat(new TextEncoder().encode('MZ\x90\x00'))).toBeNull();
    expect(sniffCvFormat(new TextEncoder().encode('just some text'))).toBeNull();
  });

  it('reads a zip central directory without decompressing anything', () => {
    const summary = inspectZip(docx);
    expect(summary.names).toContain('word/document.xml');
    expect(summary.entries).toBe(2);
  });

  it('rejects zips that are malformed, huge, or too complex', () => {
    expect(() => inspectZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toThrow(CvError);
    const bomb = buildZip({ 'word/document.xml': 'x' });
    // Patch the central directory's uncompressed size to 1 GB: a decompression bomb's signature.
    const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
    for (let i = 0; i < bomb.length - 4; i++) {
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1_000_000_000, true);
    }
    expect(() => inspectZip(bomb)).toThrow(/too large/);
  });

  it('refuses empty, oversized and unsupported files with specific codes', async () => {
    await expect(extractCvText(new Uint8Array())).rejects.toMatchObject({ code: 'empty' });
    await expect(extractCvText(new Uint8Array(CV_LIMITS.maxBytes + 1))).rejects.toMatchObject({
      code: 'too-large',
    });
    await expect(
      extractCvText(new TextEncoder().encode('MZ not a document')),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects a zip that is not a Word document', async () => {
    const notWord = buildZip({ 'readme.txt': 'hello' });
    await expect(extractCvText(notWord)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('does not blow up on a corrupt PDF: it says it could not be read', async () => {
    const corrupt = new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf');
    await expect(extractCvText(corrupt)).rejects.toBeInstanceOf(CvError);
  });
});

describe('email senders', () => {
  it('captures codes for tests, newest first by address', async () => {
    const mail = createCapturingEmailSender();
    await mail.sendOtp({ to: 'A@x.com', otp: '111111', expiresInMinutes: 10 });
    await mail.sendOtp({ to: 'a@x.com', otp: '222222', expiresInMinutes: 10 });
    expect(mail.lastOtpFor('a@X.com')).toBe('222222');
    expect(mail.lastOtpFor('b@x.com')).toBeUndefined();
  });

  it('sends through Resend with a bearer key, and fails loudly on an error', async () => {
    const seen: Array<{ url: string; auth: string | null; body: any }> = [];
    const ok = createResendEmailSender({
      apiKey: 're_key',
      from: 'UnNEET <no-reply@unneet.example>',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({
          url,
          auth: new Headers(init.headers).get('authorization'),
          body: JSON.parse(String(init.body)),
        });
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await ok.sendOtp({ to: 'a@x.com', otp: '123456', expiresInMinutes: 10 });
    expect(seen[0]).toMatchObject({ url: 'https://api.resend.com/emails', auth: 'Bearer re_key' });
    expect(seen[0]?.body.to).toEqual(['a@x.com']);
    expect(seen[0]?.body.text).toContain('123456');
    expect(seen[0]?.body.html).toContain('123456');

    const bad = createResendEmailSender({
      apiKey: 'k',
      from: 'f',
      fetchImpl: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch,
    });
    await expect(bad.sendOtp({ to: 'a@x.com', otp: '1', expiresInMinutes: 1 })).rejects.toThrow(
      /500/,
    );
  });
});

describe('logger redaction', () => {
  it('never writes e-mail addresses, codes, tokens or CV text', () => {
    const lines: string[] = [];
    const log = createLogger({
      level: 'info',
      destination: { write: (s: string) => lines.push(s) },
    });
    log.info(
      { email: 'a@x.com', otp: '123456', cvText: 'my cv', user: { email: 'b@x.com', token: 't' } },
      'hello',
    );
    const out = lines.join('');
    for (const secret of ['a@x.com', '123456', 'my cv', 'b@x.com'])
      expect(out).not.toContain(secret);
    expect(out).toContain('[redacted]');
    expect(REDACT_PATHS).toContain('req.headers.cookie');
  });
});

describe('problem bodies', () => {
  it('follows RFC 9457 field names', () => {
    const body = problemBody(404, 'nope', { get: () => 'req-1' } as never);
    expect(body).toMatchObject({
      status: 404,
      title: 'Not found',
      detail: 'nope',
      requestId: 'req-1',
    });
    expect(body.type).toMatch(/^https:/);
  });
});

describe('createPostcodesIoResolver', () => {
  const route = (handlers: Record<string, unknown>) =>
    createPostcodesIoResolver({
      fetchImpl: (async (url: string) => {
        const key = Object.keys(handlers).find((k) => url.includes(k));
        if (!key) return new Response('?', { status: 404 });
        const value = handlers[key];
        return value instanceof Response ? value : new Response(JSON.stringify(value));
      }) as unknown as typeof fetch,
    });

  it('resolves a postcode, keeping the full point for the search but only the outcode as shareable text', async () => {
    const r = route({
      '/postcodes/M1%201AE': {
        result: {
          postcode: 'M1 1AE',
          latitude: 53.4835,
          longitude: -2.2312,
          outcode: 'M1',
          admin_district: 'Manchester',
        },
      },
      '/outcodes/M1': {
        result: {
          outcode: 'M1',
          latitude: 53.4775,
          longitude: -2.2361,
          admin_district: ['Manchester'],
        },
      },
    });
    const out = await r.resolve('m1 1ae');
    expect(out.ok && out.location).toMatchObject({
      kind: 'postcode',
      outcode: 'M1',
      shareableText: 'M1',
      lat: 53.4835,
    });
    if (!out.ok) throw new Error('expected a location');
    const coarse = await r.coarsen(out.location);
    expect(coarse.lat).toBeCloseTo(53.4775, 3);
  });

  it('resolves "Newcastle" to the city, not a Fife suburb', async () => {
    const r = route({
      '/places': {
        result: [
          {
            name_1: 'Newcastle',
            local_type: 'Suburban Area',
            outcode: 'KY6',
            county_unitary: 'Fife',
            region: 'Scotland',
            country: 'Scotland',
            latitude: 56.19,
            longitude: -3.21,
          },
          {
            name_1: 'Newcastle upon Tyne',
            local_type: 'City',
            outcode: 'NE1',
            county_unitary: null,
            region: 'North East',
            country: 'England',
            latitude: 54.97,
            longitude: -1.61,
          },
        ],
      },
    });
    const out = await r.resolve('Newcastle');
    expect(out.ok && out.location.label).toBe('Newcastle upon Tyne, North East');
  });

  it('reports not-found, outside-uk and outages distinctly, and never caches an outage', async () => {
    const notFound = route({ '/places': { result: null } });
    expect(await notFound.resolve('Zzyzx')).toEqual({ ok: false, reason: 'not-found' });
    const abroad = route({
      '/places': {
        result: [{ name_1: 'Paris', local_type: 'City', latitude: 48.85, longitude: 2.35 }],
      },
    });
    expect(await abroad.resolve('Paris')).toEqual({ ok: false, reason: 'outside-uk' });

    let calls = 0;
    const flaky = createPostcodesIoResolver({
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1
          ? new Response('boom', { status: 500 })
          : new Response(
              JSON.stringify({
                result: [{ name_1: 'Leeds', local_type: 'City', latitude: 53.8, longitude: -1.55 }],
              }),
            );
      }) as unknown as typeof fetch,
    });
    expect(await flaky.resolve('Leeds')).toEqual({ ok: false, reason: 'unavailable' });
    expect((await flaky.resolve('Leeds')).ok).toBe(true);
    await flaky.resolve('Leeds');
    expect(calls).toBe(2); // the success IS cached
  });

  it('suggests de-duplicated, UK-only places', async () => {
    const r = route({
      '/places': {
        result: [
          {
            name_1: 'Leeds',
            local_type: 'City',
            county_unitary: null,
            region: 'Yorkshire and the Humber',
            latitude: 53.8,
            longitude: -1.55,
            outcode: 'LS1',
          },
          {
            name_1: 'Leeds',
            local_type: 'Village',
            county_unitary: 'Kent',
            latitude: 51.25,
            longitude: 0.6,
            outcode: 'ME17',
          },
          {
            name_1: 'Leeds',
            local_type: 'City',
            county_unitary: null,
            region: 'Yorkshire and the Humber',
            latitude: 53.8,
            longitude: -1.55,
            outcode: 'LS2',
          },
          { name_1: 'Leeds', local_type: 'Town', latitude: 10, longitude: 10 },
        ],
      },
    });
    const items = await r.suggest('leeds');
    expect(items.map((i) => i.label)).toEqual(['Leeds, Yorkshire and the Humber', 'Leeds, Kent']);
    expect(await r.suggest('l')).toEqual([]);
  });

  it('the static resolver is a no-network stand-in', async () => {
    const r = createStaticResolver({ leeds: { lat: 1, lon: 2 } });
    expect((await r.resolve('Leeds')).ok).toBe(true);
    expect((await r.resolve('nowhere')).ok).toBe(false);
  });
});

describe('federated gateway', () => {
  const card = (id: string, sector: string | null = null) =>
    ({
      id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
      slug: `x-${id}`,
      type: 'job',
      pillar: 'employment',
      title: `Job ${id}`,
      summary: 's',
      organisation: { name: 'Acme', url: null },
      sector,
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
      externalUrl: `https://example.com/${id}`,
      source: {
        providerId: 'p',
        providerName: 'P',
        licence: 'l',
        attribution: 'Jobs by P',
        attributionUrl: 'https://p.example',
        isSample: false,
      },
    }) as never;

  const query = (over: Record<string, unknown> = {}) =>
    ({ q: 'cleaner', page: 1, pageSize: 20, sort: 'relevance', radius: 20, ...over }) as never;

  function gateway(opts: {
    search: (q: unknown) => Promise<{ items: unknown[]; total: number }>;
    now?: () => number;
    cacheSeconds?: number;
  }) {
    let calls = 0;
    const provider = {
      meta: {
        id: 'adzuna',
        name: 'Adzuna',
        licence: 'l',
        attribution: 'Jobs by Adzuna',
        attributionUrl: 'https://adzuna.example',
        storagePolicy: 'cache',
        isSample: false,
        requiresKey: true,
      },
      maxCacheSeconds: 900,
      isConfigured: () => true,
      search: async (q: unknown) => {
        calls += 1;
        return opts.search(q);
      },
    };
    const gw = createFederatedGateway({
      providers: [provider as never],
      env: {},
      http: {} as never,
      logger: createLogger({ level: 'silent' }),
      timeoutMs: 100,
      ...(opts.now ? { now: opts.now } : {}),
      ...(opts.cacheSeconds !== undefined ? { cacheSeconds: opts.cacheSeconds } : {}),
    });
    return { gw, calls: () => calls };
  }

  it('only runs for targeted, job-shaped, first-page searches', () => {
    expect(isEligible(query())).toBe(true);
    expect(isEligible(query({ q: undefined }))).toBe(false); // nothing to search for
    expect(isEligible(query({ page: 2 }))).toBe(false);
    expect(isEligible(query({ type: ['course'] }))).toBe(false);
    expect(isEligible(query({ pillar: ['education'] }))).toBe(false);
    expect(isEligible(query({ free: true }))).toBe(false);
    expect(isEligible(query({ levelMin: 3 }))).toBe(false);
    expect(isEligible(query({ workMode: ['remote'] }))).toBe(false);
    expect(isEligible(query({ type: ['job', 'apprenticeship'] }))).toBe(true);
    expect(isEligible(query({ q: undefined, centre: { lat: 1, lon: 2, label: 'x' } }))).toBe(true);
  });

  it('returns results with attribution and caches them', async () => {
    const { gw, calls } = gateway({
      search: async () => ({ items: [card('1'), card('2')], total: 2 }),
    });
    const first = await gw.search(query(), 'Leeds');
    expect(first.items).toHaveLength(2);
    expect(first.attributions).toEqual([
      { providerName: 'Adzuna', text: 'Jobs by Adzuna', url: 'https://adzuna.example' },
    ]);
    await gw.search(query(), 'Leeds');
    expect(calls()).toBe(1);
  });

  it('a slow or failing partner never fails the search', async () => {
    const slow = gateway({ search: () => new Promise(() => {}) });
    expect(await slow.gw.search(query(), undefined)).toEqual(NO_EXTERNAL);
    const broken = gateway({
      search: async () => {
        throw new Error('502');
      },
    });
    expect(await broken.gw.search(query(), undefined)).toEqual(NO_EXTERNAL);
  });

  it('stops calling a partner that keeps failing, then tries again after a cool-down', async () => {
    let t = 0;
    const { gw, calls } = gateway({
      now: () => t,
      search: async () => {
        throw new Error('down');
      },
    });
    for (let i = 0; i < 6; i++) await gw.search(query({ q: `q${i}` }), undefined);
    expect(calls()).toBe(3); // circuit opened after three failures
    t += 61_000;
    await gw.search(query({ q: 'again' }), undefined);
    expect(calls()).toBe(4);
  });

  it('keeps within the partner call budget', async () => {
    const { gw, calls } = gateway({ search: async () => ({ items: [card('1')], total: 1 }) });
    for (let i = 0; i < 40; i++) await gw.search(query({ q: `unique ${i}` }), undefined);
    expect(calls()).toBeLessThanOrEqual(20); // Adzuna budget: 20 a minute
  });

  it('honours a sector filter by dropping cards that do not match', async () => {
    const { gw } = gateway({
      search: async () => ({
        items: [card('1', 'digital'), card('2', 'care-services'), card('3', null)],
        total: 3,
      }),
    });
    const out = await gw.search(query({ sector: ['digital'] }), undefined);
    expect(out.items).toHaveLength(1);
  });
});
