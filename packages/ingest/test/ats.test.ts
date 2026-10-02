import { readFileSync } from 'node:fs';
import { OpportunityInputSchema } from '@unneet/domain';
import { describe, expect, it } from 'vitest';
import {
  type AtsEmployer,
  type AtsRecord,
  atsJobToInput,
  createAtsAdapter,
  isUkJob,
  mapAshby,
  mapGreenhouse,
  mapLever,
  placeFromLocation,
  roleSignals,
  unescapeHtml,
} from '../src/adapters/ats';
import { createGeocoder, nullGeocoder } from '../src/geo';
import { createHttp } from '../src/http';
import { normalise } from '../src/normalise';
import { silentLogger } from '../src/types';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;

const gh = load<{ jobs: unknown[] }>('ats-greenhouse.json').jobs;
const lever = load<unknown[]>('ats-lever.json');
const ashby = load<{ jobs: unknown[] }>('ats-ashby.json').jobs;

const monzo: AtsEmployer = {
  ats: 'greenhouse',
  token: 'monzo',
  name: 'Monzo',
  website: 'https://monzo.com',
};
const palantir: AtsEmployer = { ats: 'lever', token: 'palantir', name: 'Palantir' };
const linear: AtsEmployer = { ats: 'ashby', token: 'linear', name: 'Linear' };

describe('isUkJob', () => {
  it.each([
    ['London', null, true],
    ['London, UK', null, true],
    ['Cardiff, London or Remote (UK)', null, true],
    ['Remote - United Kingdom', null, true],
    ['Leeds, England, United Kingdom', null, true],
    ['Edinburgh', null, true],
    ['Barcelona', null, false],
    ['Dublin, Ireland', null, false],
    ['New York, NY', null, false],
    ['Newport, RI', null, false],
    ['Reading, PA', null, false],
    ['London, Ontario, Canada', null, false],
    ['New South Wales, Australia', null, false],
    ['Berlin or London', null, true],
    ['', null, false],
    // A structured country code beats the text:
    ['Remote', 'GB', true],
    ['London', 'US', false],
    ['Anywhere', 'XX', false],
  ] as const)('%j (country %s) → %s', (text, country, expected) => {
    expect(isUkJob(text, country)).toBe(expected);
  });
});

describe('placeFromLocation', () => {
  it.each([
    ['London', 'London'],
    ['London, UK', 'London'],
    ['Leeds, England, United Kingdom', 'Leeds'],
    ['Cardiff, London or Remote (UK)', 'Cardiff'],
    ['Hybrid - Manchester', 'Manchester'],
    ['London (Hybrid)', 'London'],
    ['Remote (UK)', null],
    ['Remote - United Kingdom', null],
    ['United Kingdom', null],
    ['Berlin', null],
  ] as const)('%j → %s', (text, expected) => {
    expect(placeFromLocation(text)).toBe(expected);
  });
});

describe('roleSignals', () => {
  it('spots apprenticeships, internships, graduate schemes and entry-level roles', () => {
    expect(roleSignals('Software Engineering Apprentice').type).toBe('apprenticeship');
    expect(roleSignals('Level 6 Degree Apprenticeship – Data').tags).toContain('accredited');
    expect(roleSignals('Associate Data Scientist - Intern').type).toBe('internship');
    expect(roleSignals('Spring Week 2027').type).toBe('internship');
    expect(roleSignals('Graduate Programme: Engineering')).toMatchObject({
      type: 'job',
      minEntryLevel: 6,
      experienceRequired: false,
    });
    // "Junior" and "Associate" are not proof of "no experience needed".
    expect(roleSignals('Junior Designer').experienceRequired).toBeNull();
    expect(roleSignals('Associate Solutions Engineer').experienceRequired).toBeNull();
    expect(roleSignals('Trainee Designer').experienceRequired).toBe(false);
    expect(roleSignals('Senior Staff Engineer')).toMatchObject({
      type: 'job',
      minEntryLevel: null,
      experienceRequired: null,
    });
  });
});

describe('unescapeHtml', () => {
  it('unescapes Greenhouse-style entity-escaped HTML exactly once', () => {
    expect(unescapeHtml('&lt;p&gt;Tom &amp;amp; Jerry &quot;ok&quot;&lt;/p&gt;')).toBe(
      '<p>Tom &amp; Jerry "ok"</p>',
    );
  });
});

describe('mapGreenhouse (real Monzo records)', () => {
  const jobs = gh.map((r) => mapGreenhouse(r, monzo));

  it('maps every record and unescapes the description', () => {
    expect(jobs.every(Boolean)).toBe(true);
    for (const j of jobs) expect(j?.description).not.toContain('&lt;');
  });
  it('keeps UK jobs and drops the Barcelona one', () => {
    const uk = jobs
      .filter((j) => j && isUkJob(j.locationText, j.countryCode))
      .map((j) => j?.locationText);
    expect(uk).toContain('London');
    expect(uk).not.toContain('Barcelona');
  });
  it('turns an internship into an internship with the employer link', () => {
    const intern = jobs.find((j) => /Intern/.test(j?.title ?? ''));
    expect(intern).toBeTruthy();
    const input = atsJobToInput(intern as AtsRecord);
    expect('reject' in input).toBe(false);
    expect(input).toMatchObject({ type: 'internship', organisation: { name: 'Monzo' } });
    expect((input as { applyUrl: string }).applyUrl).toMatch(
      /^https:\/\/job-boards\.greenhouse\.io\/monzo\//,
    );
  });
});

describe('mapLever (real Palantir records)', () => {
  const jobs = lever.map((r) => mapLever(r, palantir));
  it('uses the structured country code, so London is UK and Washington is not', () => {
    const uk = jobs.filter((j) => j && isUkJob(j.locationText, j.countryCode));
    expect(uk.length).toBe(2);
    expect(uk.every((j) => j?.locationText.includes('London'))).toBe(true);
  });
  it('links to the hosted posting and carries the posting date', () => {
    for (const j of jobs) {
      expect(j?.url).toMatch(/^https:\/\/jobs\.lever\.co\/palantir\//);
      expect(j?.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
  it('produces valid, normalisable opportunities for UK jobs', () => {
    for (const j of jobs.filter((x) => x && isUkJob(x.locationText, x.countryCode))) {
      const input = atsJobToInput({ ...(j as AtsRecord), _place: 'London' });
      expect('reject' in input).toBe(false);
      expect(OpportunityInputSchema.safeParse(input).success).toBe(true);
      expect(OpportunityInputSchema.safeParse(normalise(input as never).input).success).toBe(true);
    }
  });
  it('reads GBP salary ranges and ignores other currencies', () => {
    const base = lever[0] as Record<string, unknown>;
    const gbp = mapLever(
      {
        ...base,
        salaryRange: { min: 30000, max: 40000, currency: 'GBP', interval: 'per-year-salary' },
      },
      palantir,
    );
    expect(gbp?.pay).toMatchObject({ min: 30000, max: 40000, unit: 'year' });
    const usd = mapLever(
      {
        ...base,
        salaryRange: { min: 100000, max: 140000, currency: 'USD', interval: 'per-year-salary' },
      },
      palantir,
    );
    expect(usd?.pay).toBeNull();
  });
});

describe('mapAshby (real Linear records)', () => {
  const jobs = ashby.map((r) => mapAshby(r, linear));
  it('does not call "Europe" or the US the UK', () => {
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs)
      expect(isUkJob(j?.locationText ?? '', j?.countryCode ?? null)).toBe(false);
  });
  it('recognises a UK address (a real record with the country changed, to cover the UK branch)', () => {
    const real = ashby[0] as Record<string, unknown>;
    const uk = mapAshby(
      {
        ...real,
        location: 'London',
        isRemote: false,
        workplaceType: 'Hybrid',
        address: { postalAddress: { addressCountry: 'United Kingdom', addressLocality: 'London' } },
        compensation: {
          compensationTiers: [
            {
              components: [
                {
                  compensationType: 'Salary',
                  interval: '1 YEAR',
                  currencyCode: 'GBP',
                  minValue: 50000,
                  maxValue: 70000,
                },
              ],
            },
          ],
        },
      },
      linear,
    );
    expect(uk && isUkJob(uk.locationText, uk.countryCode)).toBe(true);
    expect(uk?.workplaceType).toBe('hybrid');
    expect(uk?.pay).toMatchObject({ min: 50000, max: 70000, unit: 'year' });
  });
  it('skips unlisted postings', () => {
    expect(mapAshby({ ...(ashby[0] as object), isListed: false }, linear)).toBeNull();
  });
});

describe('atsJobToInput', () => {
  const base: AtsRecord = {
    employer: monzo,
    id: '123',
    title: 'Customer Support Apprentice',
    description: '<p>Help our customers.</p>',
    url: 'https://job-boards.greenhouse.io/monzo/jobs/123',
    locationText: 'Remote (UK)',
    countryCode: null,
    workplaceType: null,
    postedAt: '2026-09-01T10:00:00-04:00',
    employmentType: null,
    pay: null,
  };

  it('makes an apprenticeship free and 16+, with a namespaced external id', () => {
    const input = atsJobToInput(base);
    expect(input).toMatchObject({
      externalId: 'monzo:123',
      type: 'apprenticeship',
      minAge: 16,
      cost: { kind: 'free' },
      location: { workMode: 'remote', label: 'Remote (UK)' },
    });
  });
  it('uses geocoded coordinates and region when present', () => {
    const input = atsJobToInput({
      ...base,
      locationText: 'London',
      _geo: { lat: 51.5, lon: -0.12, region: 'london', country: 'england', outcode: 'EC1' },
    }) as { location: { lat: number; region: string; label: string } };
    expect(input.location).toMatchObject({ lat: 51.5, region: 'london', label: 'London' });
  });
  it('rejects non-https links and empty titles with a reason', () => {
    expect(atsJobToInput({ ...base, url: 'http://x.example/job' })).toHaveProperty('reject');
    expect(atsJobToInput({ ...base, title: ' ' })).toHaveProperty('reject');
  });
});

describe('createAtsAdapter', () => {
  const employers: AtsEmployer[] = [
    { ats: 'greenhouse', token: 'monzo', name: 'Monzo' },
    { ats: 'greenhouse', token: 'gone', name: 'Gone Ltd' },
    { ats: 'lever', token: 'palantir', name: 'Palantir' },
  ];

  function ctx(routes: Record<string, () => Response>) {
    const http = createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async (url: string) => {
        const key = Object.keys(routes).find((k) => url.includes(k));
        return key ? (routes[key] as () => Response)() : new Response('?', { status: 500 });
      }) as unknown as typeof fetch,
    });
    const geocoder = createGeocoder(
      createHttp({
        minIntervalMs: 0,
        sleep: async () => {},
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              result: [
                {
                  name_1: 'London',
                  local_type: 'City',
                  outcode: 'EC1',
                  region: 'London',
                  country: 'England',
                  latitude: 51.5,
                  longitude: -0.12,
                },
              ],
            }),
          )) as unknown as typeof fetch,
      }),
    );
    return { env: {}, http, geocoder, now: new Date(), logger: silentLogger };
  }

  const collect = async (
    adapter: ReturnType<typeof createAtsAdapter>,
    c: ReturnType<typeof ctx>,
  ) => {
    const out: AtsRecord[] = [];
    for await (const r of adapter.fetch(c)) out.push(r as AtsRecord);
    return out;
  };

  it('only handles its own ATS, keeps only UK jobs, and geocodes them', async () => {
    const adapter = createAtsAdapter('greenhouse', employers);
    expect(adapter.meta.id).toBe('employer-greenhouse');
    const rows = await collect(
      adapter,
      ctx({
        'boards/monzo/': () => new Response(JSON.stringify({ jobs: gh })),
        'boards/gone/': () => new Response('not found', { status: 404 }),
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => isUkJob(r.locationText, r.countryCode))).toBe(true);
    expect(rows.every((r) => r.employer.ats === 'greenhouse')).toBe(true);
    expect(rows.find((r) => r.locationText === 'London')?._geo).toMatchObject({
      lat: 51.5,
      region: 'london',
    });
  });

  it('a board that errors is reported at the END (so nothing is expired), after the others were read', async () => {
    const adapter = createAtsAdapter('greenhouse', employers);
    const seen: AtsRecord[] = [];
    const run = async () => {
      for await (const r of adapter.fetch(
        ctx({
          'boards/monzo/': () => new Response(JSON.stringify({ jobs: gh })),
          'boards/gone/': () => new Response('boom', { status: 500 }),
        }),
      ))
        seen.push(r as AtsRecord);
    };
    await expect(run()).rejects.toThrow(/Could not read 1 board\(s\): gone/);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('is not configured when it has no employers', () => {
    expect(createAtsAdapter('ashby', employers).isConfigured({})).toBe(false);
    expect(createAtsAdapter('lever', employers).isConfigured({})).toBe(true);
  });

  it('maps records and rejects things that are not ATS records', () => {
    const adapter = createAtsAdapter('lever', employers);
    expect(adapter.map('nope', {} as never).ok).toBe(false);
    void nullGeocoder;
  });
});
