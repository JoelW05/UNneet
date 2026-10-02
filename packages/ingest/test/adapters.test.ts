import { type OpportunityInput, OpportunityInputSchema, SECTOR_SLUGS } from '@unneet/domain';
import { describe, expect, it } from 'vitest';
import { curatedAdapter } from '../src/adapters/curated';
import { generateSample, SAMPLE_PROVIDER, sampleAdapter } from '../src/adapters/sample';
import { adzunaProvider, mapAdzunaJob } from '../src/federated/adzuna';
import { toFederatedCard, uuidFrom } from '../src/federated/card';
import { mapReedJob, parseReedDate, reedProvider } from '../src/federated/reed';
import { createHttp, HttpError, redact } from '../src/http';
import { normalise } from '../src/normalise';

const NOW = new Date('2026-10-01T12:00:00Z');

describe('normalise', () => {
  const base = {
    externalId: 'x',
    type: 'job' as const,
    title: 'CARE ASSISTANT',
    description:
      '<p>Support adults in a <b>residential care home</b>. No experience needed.</p><script>alert(1)</script>',
    organisation: { name: 'Acme' },
    applyUrl: 'https://example.com/x',
    location: { label: 'Leeds', workMode: 'onsite' as const },
  };

  it('strips markup, tidies the title and classifies the sector', () => {
    const { input } = normalise(base);
    expect(input.description).toBe(
      'Support adults in a residential care home. No experience needed.',
    );
    expect(input.title).toBe('Care Assistant');
    expect(input.sector).toBe('care-services');
  });

  it('never overrides a sector the provider supplied', () => {
    expect(normalise({ ...base, sector: 'digital' }).input.sector).toBe('digital');
  });

  it('adds helpful tags from the text and keeps provider tags', () => {
    const { input } = normalise({
      ...base,
      tags: ['accredited'],
      description:
        'We are Disability Confident and offer a guaranteed interview. No experience needed.',
    });
    expect(input.tags).toEqual(
      expect.arrayContaining([
        'accredited',
        'no-experience',
        'disability-confident',
        'guaranteed-interview',
      ]),
    );
  });

  describe('"no experience needed" (the bug: senior and loose-wording adverts were passing)', () => {
    const job = (title: string, description: string, extra: Partial<OpportunityInput> = {}) =>
      normalise({ ...base, title, description, ...extra });

    it('only tags an explicit statement, and sets experienceRequired from it', () => {
      const { input } = job(
        'Exam Invigilator',
        'No previous experience is necessary. Full training provided.',
      );
      expect(input.tags).toContain('no-experience');
      expect(input.experienceRequired).toBe(false);
    });

    it('does not tag "full training provided" on its own', () => {
      const { input } = job(
        'Learning Support Assistant',
        'Full training provided. Support pupils in class.',
      );
      expect(input.tags).not.toContain('no-experience');
      expect(input.experienceRequired).toBeNull();
    });

    it.each([
      '2iC Maths (KS5)',
      'Assistant Head of Year',
      'Chair of Governors',
      'Senior Operations Associate',
    ])('never tags a senior role, even when the advert is encouraging: %s', (title) => {
      const { input } = job(
        title,
        'No previous experience is required. Full training is provided.',
        {
          tags: ['no-experience'],
          experienceRequired: false,
        },
      );
      expect(input.tags).not.toContain('no-experience');
      expect(input.experienceRequired).toBe(true);
    });

    it('keeps a provider value when the advert says nothing, and reads the entry level from the text', () => {
      expect(
        job('Warehouse Operative', 'Pick and pack.', { experienceRequired: false }).input
          .experienceRequired,
      ).toBe(false);
      const { input, requirements } = job(
        'Teaching Assistant',
        'About you\n\n• GCSE grade 4 or above in English and Maths\n• Experience of working with children',
      );
      expect(input.minEntryLevel).toBe(2);
      expect(input.experienceRequired).toBe(true);
      expect(requirements.items.map((i) => i.kind)).toEqual(
        expect.arrayContaining(['qualification', 'experience']),
      );
    });

    it('respects a provider minEntryLevel of 0 rather than overriding it', () => {
      const { input } = job('Apprentice', 'You will need:\n\n• GCSE Maths', { minEntryLevel: 0 });
      expect(input.minEntryLevel).toBe(0);
    });
  });

  it('detects skills from the listing text', () => {
    const { skillIds } = normalise({
      ...base,
      description: 'Customer service and working in a team. Full UK driving licence.',
    });
    expect(skillIds).toEqual(
      expect.arrayContaining(['customer-service', 'teamwork', 'driving-licence']),
    );
  });
});

describe('sample adapter', () => {
  const sample = generateSample(NOW);

  it('is deterministic', () => {
    expect(generateSample(NOW)).toEqual(sample);
  });

  it('produces valid listings covering every sector', () => {
    expect(sample.length).toBeGreaterThanOrEqual(80);
    for (const s of sample)
      expect(OpportunityInputSchema.safeParse(s).success, s.externalId).toBe(true);
    expect(new Set(sample.map((s) => s.sector))).toEqual(new Set(SECTOR_SLUGS));
    expect(new Set(sample.map((s) => s.externalId)).size).toBe(sample.length);
  });

  it('is unmistakably labelled sample data', () => {
    expect(SAMPLE_PROVIDER.isSample).toBe(true);
    for (const s of sample) {
      expect(s.organisation.name.startsWith('Sample:')).toBe(true);
      expect(s.description.startsWith('Sample listing for demonstration only')).toBe(true);
      expect(s.applyUrl.startsWith('https://example.com/sample/')).toBe(true);
    }
  });

  it('spans several cities, types and costs so filters have something to filter', () => {
    expect(new Set(sample.map((s) => s.location.label)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(sample.map((s) => s.type)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(sample.map((s) => s.cost?.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('is excluded from production defaults unless explicitly allowed', async () => {
    const { defaultAdapters } = await import('../src/registry');
    expect(defaultAdapters({}).some((a) => a.meta.id === 'sample')).toBe(false);
    expect(defaultAdapters({ ALLOW_SAMPLE_DATA: 'true' }).some((a) => a.meta.id === 'sample')).toBe(
      true,
    );
    expect(sampleAdapter.meta.isSample).toBe(true);
  });
});

describe('curated adapter', () => {
  it('maps every curated record', async () => {
    let n = 0;
    for await (const raw of curatedAdapter.fetch({} as never)) {
      expect(curatedAdapter.map(raw, {} as never).ok).toBe(true);
      n += 1;
    }
    expect(n).toBeGreaterThanOrEqual(40);
  });
});

describe('federated: Reed', () => {
  const reedJob = {
    jobId: 4821,
    employerName: 'Harbour Retail',
    jobTitle: 'Sales Assistant',
    locationName: 'Bristol',
    minimumSalary: 22000,
    maximumSalary: 24000,
    currency: 'GBP',
    expirationDate: '30/11/2026',
    date: '14/09/2026',
    jobDescription: 'Help customers on the shop floor and work on the till.',
    jobUrl: 'https://www.reed.co.uk/jobs/sales-assistant/4821',
  };

  it('parses Reed dd/mm/yyyy dates', () => {
    expect(parseReedDate('14/09/2026')).toBe('2026-09-14T00:00:00.000Z');
    expect(parseReedDate('nonsense')).toBeNull();
    expect(parseReedDate(null)).toBeNull();
  });

  it('maps a job and rejects insecure or malformed ones', () => {
    expect(mapReedJob(reedJob)).toMatchObject({
      externalId: '4821',
      employer: 'Harbour Retail',
      pay: { min: 22000, max: 24000, unit: 'year' },
    });
    expect(mapReedJob({ ...reedJob, jobUrl: 'http://insecure.example/x' })).toBeNull();
    expect(mapReedJob({ nope: true })).toBeNull();
  });

  it('builds a link-out card with attribution and no detail page', () => {
    const job = mapReedJob(reedJob);
    expect(job).not.toBeNull();
    const card = toFederatedCard(job as NonNullable<typeof job>, reedProvider.meta);
    expect(card.externalUrl).toBe('https://www.reed.co.uk/jobs/sales-assistant/4821');
    expect(card.source.attribution).toBe('Jobs from reed.co.uk');
    expect(card.sector).toBe('sales-marketing-procurement');
    expect(card.id).toBe(uuidFrom('reed:4821'));
    expect(card.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sends basic auth with the key as username and the documented parameters', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const http = {
      getJson: async (url: string, opts?: { headers?: Record<string, string> }) => {
        calls.push({ url, headers: opts?.headers ?? {} });
        return { results: [reedJob], totalResults: 1 };
      },
    };
    const result = await reedProvider.search(
      {
        keywords: 'sales',
        location: 'Bristol',
        distanceMiles: 12,
        minSalary: 20000,
        page: 2,
        pageSize: 20,
      },
      { env: { REED_API_KEY: 'secret-key' }, http: http as never, now: NOW },
    );
    expect(result.total).toBe(1);
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from('secret-key:').toString('base64')}`,
    );
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('resultsToSkip')).toBe('20');
    expect(url.searchParams.get('distanceFromLocation')).toBe('12');
    expect(url.searchParams.get('minimumSalary')).toBe('20000');
    expect(url.toString()).not.toContain('secret-key');
  });

  it('is a no-op without a key', async () => {
    expect(reedProvider.isConfigured({})).toBe(false);
    expect(
      await reedProvider.search(
        { page: 1, pageSize: 10 },
        { env: {}, http: {} as never, now: NOW },
      ),
    ).toEqual({ items: [], total: 0 });
  });
});

describe('federated: Adzuna', () => {
  const job = {
    id: '5512',
    title: 'Warehouse Operative',
    description: 'Pick and pack orders in a busy warehouse.',
    created: '2026-09-30T08:00:00Z',
    redirect_url: 'https://www.adzuna.co.uk/jobs/land/ad/5512',
    company: { display_name: 'Millbrook Logistics' },
    location: { display_name: 'Sheffield, South Yorkshire' },
    latitude: 53.38,
    longitude: -1.47,
    salary_min: 23000,
    salary_max: 23000,
    salary_is_predicted: '1',
    contract_time: 'full_time',
  };

  it('maps salary estimates and flags them as estimates', () => {
    const mapped = mapAdzunaJob(job);
    expect(mapped?.pay).toMatchObject({ min: 23000, unit: 'year', isEstimate: true });
    expect(mapped?.lat).toBe(53.38);
    expect(mapAdzunaJob({ ...job, redirect_url: 'http://x' })).toBeNull();
  });

  it('converts miles to km and carries the required attribution', async () => {
    const calls: string[] = [];
    const http = {
      getJson: async (url: string) => {
        calls.push(url);
        return { results: [job], count: 1 };
      },
    };
    const result = await adzunaProvider.search(
      { keywords: 'warehouse', distanceMiles: 10, page: 1, pageSize: 10 },
      { env: { ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' }, http: http as never, now: NOW },
    );
    expect(new URL(calls[0] ?? '').searchParams.get('distance')).toBe('16');
    expect(result.items[0]?.source.attribution).toBe('Jobs by Adzuna');
    expect(result.items[0]?.sector).toBe('transport-logistics');
  });

  it('declares itself cache-only, never stored', () => {
    expect(adzunaProvider.meta.storagePolicy).toBe('cache');
    expect(reedProvider.meta.storagePolicy).toBe('cache');
  });
});

describe('http client', () => {
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('retries 5xx with backoff, then succeeds', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const http = createHttp({
      fetchImpl: (async () => {
        calls += 1;
        return calls < 3 ? new Response('', { status: 503 }) : ok({ fine: true });
      }) as never,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(await http.getJson('https://x.test/')).toEqual({ fine: true });
    expect(calls).toBe(3);
    expect(sleeps.length).toBe(2);
    expect(sleeps[1] ?? 0).toBeGreaterThan(sleeps[0] ?? 0);
  });

  it('honours Retry-After on 429', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const http = createHttp({
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1
          ? new Response('', { status: 429, headers: { 'retry-after': '7' } })
          : ok({});
      }) as never,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await http.getJson('https://x.test/');
    expect(sleeps).toContain(7000);
  });

  it('does not retry 4xx and never leaks keys in errors', async () => {
    let calls = 0;
    const http = createHttp({
      fetchImpl: (async () => {
        calls += 1;
        return new Response('', { status: 404 });
      }) as never,
      sleep: async () => {},
    });
    const error = await http.getJson('https://x.test/?app_key=SECRET&a=1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
    expect((error as Error).message).not.toContain('SECRET');
    expect(redact('https://x.test/?app_key=SECRET&a=1')).toContain('app_key=***');
  });

  it('gives up after the retry budget', async () => {
    let calls = 0;
    const http = createHttp({
      fetchImpl: (async () => {
        calls += 1;
        return new Response('', { status: 500 });
      }) as never,
      sleep: async () => {},
    });
    await expect(http.getJson('https://x.test/', { retries: 2 })).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(3);
  });
});
