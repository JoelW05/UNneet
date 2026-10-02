import { readFileSync } from 'node:fs';
import { OpportunityInputSchema } from '@unneet/domain';
import { describe, expect, it } from 'vitest';
import {
  jobIdFromUrl,
  mapTvJob,
  parseTvSalary,
  type TvRecord,
  teachingVacanciesAdapter,
} from '../src/adapters/teaching-vacancies';
import { createGeocoder } from '../src/geo';
import { createHttp } from '../src/http';
import { normalise } from '../src/normalise';
import { silentLogger } from '../src/types';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/teaching-vacancies.json', import.meta.url), 'utf8'),
) as { data: TvRecord[] };

const byTitle = (title: string) => {
  const job = fixture.data.find((j) => j.title === title);
  if (!job) throw new Error(`fixture has no job titled ${title}`);
  return job;
};

const mapped = (title: string) => {
  const result = mapTvJob(byTitle(title));
  if (!result.ok) throw new Error(`could not map ${title}: ${result.reason}`);
  return result.input;
};

describe('mapTvJob (real recorded records)', () => {
  it('maps every fixture record to a schema-valid opportunity, even after normalisation', () => {
    for (const job of fixture.data) {
      const result = mapTvJob(job);
      expect(result.ok, `${job.title}`).toBe(true);
      if (!result.ok) continue;
      expect(OpportunityInputSchema.safeParse(result.input).success, job.title).toBe(true);
      expect(OpportunityInputSchema.safeParse(normalise(result.input).input).success).toBe(true);
    }
  });

  it('keeps the links https and points at the school job page', () => {
    for (const job of fixture.data) {
      const r = mapTvJob(job);
      if (!r.ok) continue;
      expect(r.input.applyUrl).toMatch(/^https:\/\/teaching-vacancies\.service\.gov\.uk\/jobs\//);
      if (r.input.organisation.url) expect(r.input.organisation.url).toMatch(/^https:\/\//);
    }
  });

  it('treats an "Apprentice" role as an apprenticeship: free, accredited, 16+', () => {
    const input = mapped('Apprentice Teaching Assistant');
    expect(input.type).toBe('apprenticeship');
    expect(input.minAge).toBe(16);
    expect(input.cost?.kind).toBe('free');
    expect(input.tags).toEqual(expect.arrayContaining(['accredited', 'government-funded']));
  });

  it('does not mistake a job that supports apprenticeships for one', () => {
    const input = mapTvJob({
      title: 'Apprenticeship Trainer - Electrical',
      url: 'https://teaching-vacancies.service.gov.uk/jobs/apprenticeship-trainer-x',
    });
    expect(input.ok && input.input.type).toBe('job');
  });

  it('flags a degree for school teachers but not for lecturers, assistants or cleaners', () => {
    expect(mapped('Teacher of Social Science').minEntryLevel).toBe(6);
    expect(mapped('Agricultural Engineering Lecturer').minEntryLevel).toBeNull();
    expect(mapped('Learning Support Assistant (Maternity cover)').minEntryLevel).toBeNull();
    expect(mapped('Cleaner').minEntryLevel).toBeNull();
  });

  it('assigns a sector where the feed category is clear and leaves the rest to the classifier', () => {
    expect(mapped('Teacher of Social Science').sector).toBe('education-early-years');
    expect(mapped('Administrative Assistant').sector).toBe('business-administration');
    expect(mapped('ICT Technician').sector).toBe('digital');
    expect(mapped('Cleaner').sector).toBeUndefined();
  });

  it('turns clear salary text into pay and keeps the advertised wording', () => {
    const pay = mapped('Education Support Assistant').pay;
    expect(pay).toMatchObject({ min: 29542, max: 33119, unit: 'year', isEstimate: false });
    expect(pay?.note).toContain('As advertised: From £29,542 - £33,119 FTE');
    expect(mapped('Apprentice Teaching Assistant').pay).toMatchObject({
      min: 12.42,
      max: 12.42,
      unit: 'hour',
    });
  });

  it('gives NO pay for pay scales without figures, rather than guessing', () => {
    expect(mapped('Assistant Head').pay).toBeNull();
    expect(mapped('Teacher of Science - Fixed Perm').pay).toBeNull();
  });

  it('tags part-time-only roles and marks temporary ones', () => {
    const job = fixture.data.find(
      (j) => JSON.stringify(j.employmentType) === '["PART_TIME","TEMPORARY"]',
    );
    const r = mapTvJob(job);
    expect(r.ok && r.input.tags).toContain('part-time');
    expect(r.ok && r.input.duration).toBe('Temporary or fixed term');
  });

  it('copes with a missing postcode and a missing organisation website', () => {
    const noPostcode = fixture.data.find((j) => !j.jobLocation?.address?.postalCode);
    const r = mapTvJob(noPostcode);
    expect(r.ok).toBe(true);
    expect(r.ok && r.input.location.postcode).toBeUndefined();
    const noSite = fixture.data.find((j) => !j.hiringOrganization?.sameAs);
    const r2 = mapTvJob(noSite);
    expect(r2.ok && r2.input.organisation.url).toBeNull();
  });

  it('caps enormous descriptions so they pass schema validation', () => {
    const huge = { ...fixture.data[0], description: `<p>${'word '.repeat(200_000)}</p>` };
    const r = mapTvJob(huge);
    expect(r.ok).toBe(true);
    expect(r.ok && r.input.description.length).toBeLessThanOrEqual(20_000);
    expect(OpportunityInputSchema.safeParse(r.ok && r.input).success).toBe(true);
  });

  it('rejects rows without a usable URL or title, with a reason', () => {
    expect(mapTvJob({ title: 'x' }).ok).toBe(false);
    expect(mapTvJob({ title: 'Teacher', url: 'https://evil.example/jobs/x' }).ok).toBe(false);
    expect(mapTvJob({ url: 'https://teaching-vacancies.service.gov.uk/jobs/a-b' }).ok).toBe(false);
    expect(mapTvJob('nope').ok).toBe(false);
  });

  it('uses coordinates and region from the geocoder when present', () => {
    const job = {
      ...byTitle('Cleaner'),
      _geo: { lat: 52.9, lon: -1.2, region: 'east-midlands', country: 'england', outcode: 'NG9' },
    } as TvRecord;
    const r = mapTvJob(job);
    expect(r.ok && r.input.location).toMatchObject({
      lat: 52.9,
      lon: -1.2,
      region: 'east-midlands',
    });
  });
});

describe('parseTvSalary (real phrasings)', () => {
  const cases: Array<
    [string, string | undefined, { min: number | null; max: number | null; unit: string } | null]
  > = [
    ['£31,086', 'YEAR', { min: 31086, max: 31086, unit: 'year' }],
    ['£28,876 per annum', 'YEAR', { min: 28876, max: 28876, unit: 'year' }],
    ['From £29,542 - £33,119 FTE', 'YEAR', { min: 29542, max: 33119, unit: 'year' }],
    ['£42,317- £54,300', 'YEAR', { min: 42317, max: 54300, unit: 'year' }],
    ['£34,069 to £52,835', 'YEAR', { min: 34069, max: 52835, unit: 'year' }],
    ['32,916.00 - 45,352.00', 'YEAR', { min: 32916, max: 45352, unit: 'year' }],
    ['Between £30,000 and £35,000', 'YEAR', { min: 30000, max: 35000, unit: 'year' }],
    ['Up to £39,201', 'YEAR', { min: null, max: 39201, unit: 'year' }],
    ['Starting from £20,957.19 per annum', 'YEAR', { min: 20957.19, max: null, unit: 'year' }],
    ['£12.42 per hour', 'HOUR', { min: 12.42, max: 12.42, unit: 'hour' }],
    ['14.80 per hour', 'HOUR', { min: 14.8, max: 14.8, unit: 'hour' }],
    ['£13.11 Hourly', 'YEAR', { min: 13.11, max: 13.11, unit: 'hour' }],
    [
      '£21,934.57 - £22,278.76 Annually (Actual)\n\rGrade 2, Points 3 to 4 (37 hours / 5 days per week)',
      'YEAR',
      { min: 21934.57, max: 22278.76, unit: 'year' },
    ],
    ['Grade 2, Points 3 to 4 £22,000', 'YEAR', { min: 22000, max: 22000, unit: 'year' }],
    // No usable figure:
    ['Leadership Group L6 - L10', 'YEAR', null],
    ['MPS (no figures)', 'YEAR', null],
    ['Teacher Main or Upper Pay Scale', 'YEAR', null],
    ['£12.85 Annually (Actual)', 'YEAR', null],
    ['2,907.53', 'YEAR', null],
    ['£50,000', undefined, null],
    ['', 'YEAR', null],
  ];
  it.each(cases)('%j (%s)', (text, unit, expected) => {
    const pay = parseTvSalary(text, unit);
    if (expected === null) expect(pay).toBeNull();
    else expect(pay).toMatchObject(expected);
  });
});

describe('jobIdFromUrl', () => {
  it('extracts the slug from job pages only', () => {
    expect(jobIdFromUrl('https://teaching-vacancies.service.gov.uk/jobs/cleaner-some-school')).toBe(
      'cleaner-some-school',
    );
    expect(
      jobIdFromUrl('https://teaching-vacancies.service.gov.uk/jobs/cleaner-some-school/'),
    ).toBe('cleaner-some-school');
    expect(jobIdFromUrl('https://teaching-vacancies.service.gov.uk/organisations/x')).toBeNull();
    expect(jobIdFromUrl('https://example.com/jobs/x')).toBeNull();
    expect(jobIdFromUrl('nonsense')).toBeNull();
    expect(jobIdFromUrl(undefined)).toBeNull();
  });
});

describe('teachingVacanciesAdapter.fetch', () => {
  const job = (slug: string, postcode: string) => ({
    title: `Job ${slug}`,
    url: `https://teaching-vacancies.service.gov.uk/jobs/${slug}`,
    jobLocation: { address: { postalCode: postcode, addressLocality: 'Leeds' } },
  });

  function makeCtx(pages: Array<{ data: unknown[]; next: boolean }>, count: number) {
    const requested: string[] = [];
    const referers: Array<string | null> = [];
    const http = createHttp({
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async (url: string, init: RequestInit) => {
        requested.push(url);
        referers.push(new Headers(init.headers).get('referer'));
        const n = Number(new URL(url).searchParams.get('page'));
        const page = pages[n - 1];
        return new Response(
          JSON.stringify({
            data: page?.data ?? [],
            meta: { totalPages: pages.length, count },
            links: { next: page?.next ? 'https://next.example' : null },
          }),
        );
      }) as unknown as typeof fetch,
    });
    const geocoder = createGeocoder(
      createHttp({
        minIntervalMs: 0,
        sleep: async () => {},
        fetchImpl: (async (_u: string, init: RequestInit) => {
          const { postcodes } = JSON.parse(String(init.body)) as { postcodes: string[] };
          return new Response(
            JSON.stringify({
              result: postcodes.map((q) => ({
                query: q,
                result: {
                  latitude: 53.8,
                  longitude: -1.55,
                  region: 'Yorkshire and the Humber',
                  country: 'England',
                  outcode: 'LS1',
                },
              })),
            }),
          );
        }) as unknown as typeof fetch,
      }),
    );
    return {
      ctx: { env: {}, http, geocoder, now: new Date('2026-10-01T00:00:00Z'), logger: silentLogger },
      requested,
      referers,
    };
  }

  const collect = async (ctx: ReturnType<typeof makeCtx>['ctx']) => {
    const out: TvRecord[] = [];
    for await (const r of teachingVacanciesAdapter.fetch(ctx)) out.push(r as TvRecord);
    return out;
  };

  it('pages through the feed, sends a Referer, de-duplicates repeats and attaches coordinates', async () => {
    const { ctx, requested, referers } = makeCtx(
      [
        { data: [job('a', 'LS1 4AP'), job('b', 'LS1 4AP')], next: true },
        { data: [job('b', 'LS1 4AP'), job('c', 'LS2 9JT')], next: false },
      ],
      4,
    );
    const rows = await collect(ctx);
    expect(requested).toHaveLength(2);
    expect(referers.every((r) => r === 'https://unneet.example/')).toBe(true);
    expect(rows.map((r) => jobIdFromUrl(r.url))).toEqual(['a', 'b', 'c']);
    expect(rows[0]?._geo).toMatchObject({ lat: 53.8, region: 'yorkshire-and-the-humber' });
  });

  it('fails loudly when the crawl is clearly incomplete, so nothing is expired on bad data', async () => {
    const { ctx } = makeCtx([{ data: [job('a', 'LS1 4AP')], next: false }], 100);
    await expect(collect(ctx)).rejects.toThrow(/incomplete: received 1 of 100/);
  });

  it('declares itself a complete, key-free, OGL feed', () => {
    expect(teachingVacanciesAdapter.fullFeed).toBe(true);
    expect(teachingVacanciesAdapter.isConfigured({})).toBe(true);
    expect(teachingVacanciesAdapter.meta.licence).toMatch(/Open Government Licence/);
  });
});
