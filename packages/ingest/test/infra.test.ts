import { describe, expect, it } from 'vitest';
import { createGeocoder, nullGeocoder } from '../src/geo';
import { createHttp } from '../src/http';
import { parseCsv, parseCsvRecords } from '../src/lib/csv';
import { osgbToWgs84 } from '../src/lib/osgb';

describe('parseCsv', () => {
  it('handles quotes, embedded commas, escaped quotes and embedded newlines', () => {
    const rows = [...parseCsv('a,b,c\n"x, y","say ""hi""","line1\nline2"\n')];
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
    ]);
  });

  it('handles CRLF, a BOM, empty fields and a missing final newline', () => {
    const rows = [...parseCsv('﻿a,b\r\n1,\r\n,2')];
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', ''],
      ['', '2'],
    ]);
  });

  it('skips blank lines and keeps quoted empty strings', () => {
    expect([...parseCsv('a\n\n""\n')]).toEqual([['a'], ['']]);
  });

  it('maps rows to records by header, padding short rows', () => {
    const records = [...parseCsvRecords('id,name,town\n1,Ann\n2,Bob,Leeds\n')];
    expect(records).toEqual([
      { id: '1', name: 'Ann', town: '' },
      { id: '2', name: 'Bob', town: 'Leeds' },
    ]);
  });
});

describe('osgbToWgs84', () => {
  // Ground truth: coordinates published by postcodes.io (ONS/OS data) for real postcodes.
  const cases: Array<[string, number, number, number, number]> = [
    ['M1 1AE Manchester', 384756, 398553, 53.483487, -2.231182],
    ['WC2B 4BA London', 530603, 181260, 51.515177, -0.119179],
    ['EH1 1RE Edinburgh', 325728, 673590, 55.949575, -3.190897],
    ['PL1 2AA Plymouth', 247696, 54383, 50.369569, -4.143034],
  ];
  it.each(cases)('%s is within ~25 m', (_name, e, n, lat, lon) => {
    const got = osgbToWgs84(e, n);
    // 0.0002° ≈ 22 m latitude. The conversion needs only to be good enough for radius search.
    expect(Math.abs(got.lat - lat)).toBeLessThan(0.0002);
    expect(Math.abs(got.lon - lon)).toBeLessThan(0.0003);
  });
});

describe('createGeocoder', () => {
  const bulk = (rows: Record<string, unknown>) =>
    createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async (_url: string, init: RequestInit) => {
        const { postcodes } = JSON.parse(String(init.body)) as { postcodes: string[] };
        return new Response(
          JSON.stringify({
            status: 200,
            result: postcodes.map((q) => ({ query: q, result: rows[q] ?? null })),
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });

  it('looks postcodes up in bulk, normalises keys, and drops unknown or non-UK ones', async () => {
    const geo = createGeocoder(
      bulk({
        'M1 1AE': {
          latitude: 53.48,
          longitude: -2.23,
          region: 'North West',
          country: 'England',
          outcode: 'M1',
        },
        'AB1 2CD': {
          latitude: 10,
          longitude: 10,
          region: null,
          country: 'England',
          outcode: 'AB1',
        },
      }),
    );
    const out = await geo.postcodes(['m11ae', 'ZZ9 9ZZ', 'AB1 2CD', 'not a postcode']);
    expect([...out.keys()]).toEqual(['M1 1AE']);
    expect(out.get('M1 1AE')).toMatchObject({
      region: 'north-west',
      country: 'england',
      outcode: 'M1',
    });
  });

  it('chunks requests at 100 and caches answers', async () => {
    let calls = 0;
    const http = createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async (_u: string, init: RequestInit) => {
        calls += 1;
        const { postcodes } = JSON.parse(String(init.body)) as { postcodes: string[] };
        return new Response(
          JSON.stringify({
            result: postcodes.map((q) => ({
              query: q,
              result: {
                latitude: 52,
                longitude: -1,
                region: 'London',
                country: 'England',
                outcode: 'X',
              },
            })),
          }),
        );
      }) as unknown as typeof fetch,
    });
    const geo = createGeocoder(http);
    const many = Array.from(
      { length: 250 },
      (_, i) => `SW${(i % 19) + 1} ${(i % 9) + 1}A${String.fromCharCode(65 + (i % 26))}`,
    );
    const unique = new Set(many.map((p) => p.toUpperCase())).size;
    await geo.postcodes(many);
    expect(calls).toBe(Math.ceil(unique / 100));
    await geo.postcodes(many);
    expect(calls).toBe(Math.ceil(unique / 100));
  });

  it('never throws when the service is down: it just returns no coordinates', async () => {
    const http = createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch,
    });
    const geo = createGeocoder(http);
    expect((await geo.postcodes(['M1 1AE'])).size).toBe(0);
    expect(await geo.place('Leeds')).toBeNull();
  });

  it('resolves a place name to the largest settlement', async () => {
    const http = createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            result: [
              {
                name_1: 'Newcastle',
                local_type: 'Suburban Area',
                outcode: 'KY6',
                region: 'Scotland',
                country: 'Scotland',
                latitude: 56.19,
                longitude: -3.21,
              },
              {
                name_1: 'Newcastle upon Tyne',
                local_type: 'City',
                outcode: 'NE1',
                region: 'North East',
                country: 'England',
                latitude: 54.97,
                longitude: -1.61,
              },
            ],
          }),
        )) as unknown as typeof fetch,
    });
    const point = await createGeocoder(http).place('Newcastle');
    expect(point).toMatchObject({ outcode: 'NE1', region: 'north-east' });
  });

  it('nullGeocoder knows nothing', async () => {
    expect((await nullGeocoder.postcodes(['M1 1AE'])).size).toBe(0);
    expect(await nullGeocoder.place('Leeds')).toBeNull();
  });
});

describe('http text and post', () => {
  it('getText returns the body and postJson sends JSON', async () => {
    const seen: Array<{ method?: string; body?: unknown; type?: string | null }> = [];
    const http = createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async (_u: string, init: RequestInit) => {
        seen.push({
          ...(init.method ? { method: init.method } : {}),
          body: init.body,
          type: new Headers(init.headers).get('content-type'),
        });
        return new Response(init.method === 'POST' ? '{"ok":true}' : 'plain text');
      }) as unknown as typeof fetch,
    });
    expect(await http.getText('https://x.test/a')).toBe('plain text');
    expect(await http.postJson('https://x.test/b', { a: 1 })).toEqual({ ok: true });
    expect(seen[1]).toMatchObject({ method: 'POST', body: '{"a":1}', type: 'application/json' });
  });
});
