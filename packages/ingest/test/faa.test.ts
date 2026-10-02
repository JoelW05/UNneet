import { readFileSync } from 'node:fs';
import { type OpportunityInput, OpportunityInputSchema } from '@unneet/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  faaAdapter,
  mapFaaVacancy,
  parseFaaWage,
  placeLabel,
} from '../src/adapters/find-an-apprenticeship';
import type { GeoPoint } from '../src/geo';
import type { AdapterContext } from '../src/types';

/**
 * These tests run against REAL vacancies recorded from the live Display Advert API on
 * 2026-10-01 (see the fixture's own comment), not hand-written ones. The awkward shapes were
 * picked on purpose: several addresses, scheme-less URLs, national vacancies, competitive pay,
 * and the sparse NHS and Civil Service adverts the API adds with its AdditionalDataSources header.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/faa-vacancies.json', import.meta.url), 'utf8'),
) as { vacancies: Array<Record<string, any>> };

const byRef = (ref: string): Record<string, any> => {
  const v = fixture.vacancies.find((x) => x.vacancyReference === ref);
  if (!v) throw new Error(`fixture is missing ${ref}`);
  return v;
};
const map = (ref: string): OpportunityInput => {
  const r = mapFaaVacancy(byRef(ref));
  if (!r.ok) throw new Error(`${ref} was rejected: ${r.reason}`);
  return r.input;
};

const FAA_URL = 'https://www.findapprenticeship.service.gov.uk/apprenticeship/reference';

describe('every recorded vacancy', () => {
  it('maps, validates against the canonical schema, and links to Find an apprenticeship', () => {
    expect(fixture.vacancies.length).toBeGreaterThanOrEqual(16);
    for (const v of fixture.vacancies) {
      const input = map(v.vacancyReference);
      expect(OpportunityInputSchema.safeParse(input).success, v.vacancyReference).toBe(true);
      expect(input.type).toBe('apprenticeship');
      expect(input.applyUrl).toBe(`${FAA_URL}/${v.vacancyReference}`);
      expect(input.cost?.kind).toBe('free');
      expect(input.minAge).toBe(16);
      expect(input.location.country).toBe('england');
    }
  });

  it('leaves no markup or entities in anything a person reads', () => {
    for (const v of fixture.vacancies) {
      const input = map(v.vacancyReference);
      for (const text of [input.title, input.description, input.organisation.name]) {
        expect(text, v.vacancyReference).not.toMatch(/<[a-z!/][^>]*>/i);
        expect(text, v.vacancyReference).not.toMatch(/&(?:amp|nbsp|rsquo|pound|bull|ndash);/);
      }
    }
  });

  it('keeps bullet lists together and starts each section on its own paragraph', () => {
    const d = map('1000270243').description;
    expect(d).toContain("What you'll do:\n\n");
    expect(d).toMatch(
      /Key details:\n\n• Pay: Apprenticeship minimum wage: £16,640 a year\n• Working week:/,
    );
  });

  it('never carries employer contact details, even if the API sends them', () => {
    const raw = {
      ...byRef('1000270243'),
      employerContactName: 'Jo Bloggs',
      employerContactEmail: 'jo.bloggs@example.com',
      employerContactPhone: '07700 900123',
    };
    const r = mapFaaVacancy(raw);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toContain('Jo Bloggs');
    expect(json).not.toContain('jo.bloggs@example.com');
    expect(json).not.toContain('07700');
  });
});

describe('standard adverts', () => {
  it('maps a full advert: place, pay, level, sector, duration and dates', () => {
    const v = map('1000270243');
    expect(v.title).toBe('Apprentice Maintenance Engineer');
    expect(v.organisation.name).toBe(
      'North Staffordshire Engineering Group Training Association Limited',
    );
    expect(v.organisation.url).toBeNull();
    expect(v.location).toMatchObject({
      label: 'Stoke-On-Trent, Staffordshire',
      postcode: 'ST1 5HR',
      lat: 53.02715,
      lon: -2.17969,
      workMode: 'onsite',
    });
    expect(v.pay).toEqual({
      min: 16640,
      max: 16640,
      unit: 'year',
      isEstimate: false,
      note: 'Apprenticeship minimum wage',
    });
    expect(v.level).toBe(2);
    expect(v.minEntryLevel).toBe(0);
    expect(v.sector).toBe('engineering-manufacturing');
    expect(v.duration).toBe('1 year 7 months');
    expect(v.closesAt).toBe('2026-10-30T23:59:59.000Z');
    expect(v.startsAt).toBe('2026-11-01T00:00:00.000Z');
    expect(v.tags).toEqual(['accredited', 'government-funded']);
  });

  it('reads the national minimum wage range', () => {
    const v = map('1000345627');
    expect(v.pay).toMatchObject({ min: 12480, max: 19827.6, unit: 'year' });
    expect(v.pay?.note).toMatch(/depends on your age/);
    expect(v.location.label).toBe('Southcote, Reading');
    expect(v.organisation.url).toBe('https://www.thegrangepre-school.org.uk/');
  });

  it('takes the entry level from what the employer marks essential, not from the course level', () => {
    expect(map('1000345627').minEntryLevel).toBe(2); // essential: NVQ Level 2
    expect(map('2000012036').minEntryLevel).toBe(2); // essential: GCSE
    expect(map('2000039298').minEntryLevel).toBe(3); // essential: GCSE and an A level
    expect(map('2000036533').minEntryLevel).toBe(3); // essential: "Level 3 Early Years"
    expect(map('1000349586').minEntryLevel).toBe(0); // GCSEs are only desired
  });

  it('describes qualifications as you will need versus helpful', () => {
    const d = map('2000039298').description;
    expect(d).toContain('You will need:');
    expect(d).toMatch(/A Level/);
    expect(map('1000349586').description).toContain('Helpful, but not required:');
  });

  it('reads higher and degree levels, and foundation apprenticeships', () => {
    expect(map('2000036533').level).toBe(5);
    expect(map('2000039298').level).toBe(6);
    expect(map('2000050062').level).toBe(2);
  });

  it('tags Disability Confident employers and part-time hours', () => {
    expect(map('2000031877').tags).toEqual(
      expect.arrayContaining(['disability-confident', 'part-time']),
    );
    expect(map('1000270243').tags).not.toContain('part-time');
  });

  it('adds https to bare employer websites and never uses the scheme-less applicationUrl', () => {
    const v = map('2000012036');
    expect(v.organisation.url).toBe('https://www.whitfieldplumbing.co.uk/');
    expect(v.applyUrl).toBe(`${FAA_URL}/2000012036`);
    expect(map('2000039298').organisation.url).toBe('https://parkinsonre.com/');
  });

  it('lists other sites by place name', () => {
    expect(map('2000028617').description).toContain('Also available in: Hounslow');
  });

  it('does not invent pay for a competitive salary', () => {
    const v = map('2000036533');
    expect(v.pay).toBeNull();
    expect(v.description).toContain('Pay: Competitive salary');
    expect(v.description).not.toContain('Competitive salary: Competitive');
  });

  it('marks nationwide adverts and keeps their detail text', () => {
    const v = map('2000039857');
    expect(v.location.workMode).toBe('nationwide');
    expect(v.location.label).toBe('Across England');
    expect(v.location.lat ?? null).toBeNull();
    expect(v.description).toContain('Open to people anywhere in England');
    expect(v.description).toContain('Where you can work:');
  });

  it('uses the geocoder for the region and for a place name when the address has none', () => {
    const raw = byRef('2000023340'); // street-only address, no town line
    const without = mapFaaVacancy(raw);
    expect(without.ok && without.input.location.label).toBe('LA14 1NB');
    const withGeo = mapFaaVacancy({
      ...raw,
      _geo: { lat: 54.1, lon: -3.2, region: 'north-west', district: 'Barrow-in-Furness' },
    });
    expect(withGeo.ok && withGeo.input.location).toMatchObject({
      label: 'Barrow-in-Furness',
      region: 'north-west',
    });
  });
});

describe('NHS and Civil Service adverts (sparse by nature)', () => {
  it('reads a bare wage figure using wageUnit, and finds the town in the last address line', () => {
    const v = map('C9274-26-0349');
    expect(v.pay).toMatchObject({ min: 15600, max: 15600, unit: 'year' });
    expect(v.location.label).toBe('Lincoln');
    expect(v.level).toBeNull();
    expect(v.duration).toBeNull();
    expect(v.description).toContain('Pay: £15,600 a year');
  });

  it('reads a range written with a dash and no currency symbol', () => {
    expect(map('467350').pay).toMatchObject({ min: 19514, max: 19514, unit: 'year' });
  });

  it('says plainly when an advert has no text, instead of showing a blank', () => {
    expect(map('467350').description).toMatch(
      /^UK Research and Innovation is recruiting an apprentice in Swindon\. This advert is short/,
    );
  });

  it('refuses to guess an ambiguous wage ("£9.00" with an annual unit) and says why', () => {
    const v = map('A3309-26-0049');
    expect(v.pay).toBeNull();
    expect(v.description).toContain('the advert does not say per what');
  });
});

describe('parseFaaWage', () => {
  const wage = (text: string, unit = 'Annually', extra: Record<string, unknown> = {}) => ({
    wageType: 'Custom',
    wageUnit: unit,
    wageAdditionalInformation: text,
    ...extra,
  });

  it.each([
    ['£16,640 a year', 16640, 16640, 'year'],
    ['£12,480 to £19,827.60 a year', 12480, 19827.6, 'year'],
    ['£15600.00', 15600, 15600, 'year'],
    ['19514.00 - 19514.00', 19514, 19514, 'year'],
    ['£25760.00 to £27476.00', 25760, 27476, 'year'],
    ['£420 a week', 420, 420, 'week'],
  ])('reads %s', (text, min, max, unit) => {
    expect(parseFaaWage(wage(text))).toMatchObject({ min, max, unit });
  });

  it('uses wageAmount and wageUnit when the API does supply them', () => {
    expect(parseFaaWage(wage('see advert', 'Monthly', { wageAmount: 1500 }))).toMatchObject({
      min: 1500,
      max: 1500,
      unit: 'month',
    });
  });

  it.each(['Competitive', 'Negotiable', '', '£9.00', '£8.00', '37.5 hours', '£2,000,000 a year'])(
    'returns no pay for %j rather than guessing',
    (text) => {
      expect(parseFaaWage(wage(text))).toBeNull();
    },
  );

  it('returns null with no wage block at all', () => {
    expect(parseFaaWage(null)).toBeNull();
    expect(parseFaaWage(undefined)).toBeNull();
  });
});

describe('placeLabel', () => {
  const addr = (
    l1: string | null,
    l2: string | null,
    l3: string | null,
    l4: string | null,
    pc = 'AB1 2CD',
  ) => ({
    addressLine1: l1,
    addressLine2: l2,
    addressLine3: l3,
    addressLine4: l4,
    postcode: pc,
  });

  it.each([
    [
      addr('Hanley Technical Institute', 'Hanley', 'Stoke-On-Trent', 'Staffordshire'),
      'Stoke-On-Trent, Staffordshire',
    ],
    [addr('Hewshott Farm', 'Hewshott Lane', 'Liphook', null), 'Liphook'],
    [addr('15-19 CHISWICK HIGH ROAD', 'LONDON', null, null), 'London'],
    [addr('1 The Drive', null, 'London', null), 'London'],
    // Units and business parks push the town to the last line.
    [addr('UNIT 2', 'DUNLOP WAY', 'QUEENSWAY BUSINESS PARK', 'SCUNTHORPE'), 'Scunthorpe'],
    [addr('1 Stone Cottages', 'Lewes Road', 'Forest Row', null), 'Forest Row'],
    [
      addr('Basepoint', 'The Old Rectory', 'Springhead Enterprise Park', 'NORTHFLEET'),
      'Northfleet',
    ],
  ])('finds the town in %j', (address, expected) => {
    expect(placeLabel(address)).toBe(expected);
  });

  it('falls back to the local authority, then the postcode, never to a street', () => {
    const streetOnly = addr('358 Warrington Road', null, null, null, 'WN4 9PH');
    expect(placeLabel(streetOnly, 'Wigan')).toBe('Wigan');
    expect(placeLabel(streetOnly)).toBe('WN4 9PH');
    expect(
      placeLabel(addr('Oaklands', 'Huddersfield Road', null, 'United Kingdom'), 'Kirklees'),
    ).toBe('Kirklees');
    expect(placeLabel(undefined)).toBe('England');
  });
});

describe('faaAdapter.fetch', () => {
  const geoPoint: GeoPoint = {
    lat: 53.0,
    lon: -2.1,
    region: 'west-midlands',
    country: 'england',
    outcode: 'ST1',
    district: 'Stoke-on-Trent',
  };
  const vac = (ref: string, postcode = 'ST1 5HR') => ({
    vacancyReference: ref,
    title: `Apprentice ${ref}`,
    vacancyUrl: `${FAA_URL}/${ref}`,
    addresses: [{ addressLine3: 'Stoke-On-Trent', postcode }],
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(
    pages: Array<Record<string, unknown>>,
    env: Record<string, string | undefined> = { FAA_API_KEY: 'test-key' },
  ) {
    const getJson = vi.fn(async (url: string) => {
      const page = Number(/PageNumber=(\d+)/.exec(url)?.[1] ?? 1);
      return pages[page - 1] ?? { vacancies: [], totalPages: pages.length };
    });
    const postcodes = vi.fn(async () => new Map([['ST1 5HR', geoPoint]]));
    const ctx = {
      env,
      http: { getJson },
      geocoder: { postcodes, place: async () => null },
      now: new Date('2026-10-01T12:00:00Z'),
      logger: { info() {}, warn() {}, error() {} },
    } as unknown as AdapterContext;
    const collect = async () => {
      const out: unknown[] = [];
      // Capture a failure the moment it happens, so it is never "unhandled" while timers run.
      const failure = (async () => {
        try {
          for await (const r of faaAdapter.fetch(ctx)) out.push(r);
          return null;
        } catch (error) {
          return error as Error;
        }
      })();
      await vi.runAllTimersAsync();
      const error = await failure;
      if (error) throw error;
      return out;
    };
    return { getJson, postcodes, collect };
  }

  it('is configured only when a key is present', () => {
    expect(faaAdapter.isConfigured({ FAA_API_KEY: 'x' })).toBe(true);
    expect(faaAdapter.isConfigured({})).toBe(false);
    expect(faaAdapter.isConfigured({ FAA_API_KEY: '' })).toBe(false);
  });

  it('does nothing without a key', async () => {
    const { getJson, collect } = setup([], {});
    expect(await collect()).toEqual([]);
    expect(getJson).not.toHaveBeenCalled();
  });

  it('sends the key, version and data-source headers and asks for full details', async () => {
    const { getJson, collect } = setup([
      { vacancies: [vac('1')], total: 1, totalFiltered: 1, totalPages: 1 },
    ]);
    await collect();
    const [url, options] = getJson.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toContain('https://api.apprenticeships.education.gov.uk/vacancies/vacancy?');
    expect(url).toContain('PageSize=100');
    expect(url).toContain('IncludeDetails=true');
    expect(options.headers).toMatchObject({
      'Ocp-Apim-Subscription-Key': 'test-key',
      'X-Version': '2',
      AdditionalDataSources: 'Nhs,Csj',
    });
  });

  it('pages through the catalogue, skips repeats, and attaches region and district', async () => {
    const { getJson, postcodes, collect } = setup([
      { vacancies: [vac('1'), vac('2')], totalFiltered: 3, totalPages: 2 },
      // The list moves while we read it: '2' shows up again.
      { vacancies: [vac('2'), vac('3')], totalFiltered: 3, totalPages: 2 },
    ]);
    const out = (await collect()) as Array<{ vacancyReference: string; _geo?: GeoPoint }>;
    expect(out.map((v) => v.vacancyReference)).toEqual(['1', '2', '3']);
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(postcodes).toHaveBeenCalledTimes(2);
    expect(out[0]?._geo).toMatchObject({ region: 'west-midlands', district: 'Stoke-on-Trent' });
  });

  it('fails loudly on an incomplete crawl so nothing is expired on a partial read', async () => {
    const { collect } = setup([
      { vacancies: [vac('1')], total: 100, totalFiltered: 100, totalPages: 1 },
    ]);
    await expect(collect()).rejects.toThrow(/crawl incomplete: received 1 of 100/);
  });
});
