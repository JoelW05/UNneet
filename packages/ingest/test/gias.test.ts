import { OpportunityInputSchema } from '@unneet/domain';
import { describe, expect, it } from 'vitest';
import { classify, GiasRowSchema, mapGiasRecord, selectRows } from '../src/adapters/gias';
import { websiteUrl } from '../src/lib/url';

const row = (over: Record<string, string>) =>
  GiasRowSchema.parse({
    URN: '100001',
    EstablishmentName: 'Test Place',
    'EstablishmentStatus (name)': 'Open',
    'TypeOfEstablishment (name)': 'Community school',
    'EstablishmentTypeGroup (name)': 'Local authority maintained schools',
    Town: 'Leeds',
    Postcode: 'LS1 4AP',
    SchoolWebsite: 'www.testplace.ac.uk',
    Easting: '430000',
    Northing: '433000',
    'GOR (name)': 'Yorkshire and the Humber',
    ...over,
  });

describe('GIAS classify', () => {
  it('lists FE and sixth form colleges, post-16 academies, technical colleges and universities', () => {
    expect(
      classify(
        row({
          'TypeOfEstablishment (name)': 'Further education',
          'FurtherEducationType (name)': 'General Further Education College',
        }),
      ),
    ).toBe('general-college');
    expect(
      classify(
        row({
          'TypeOfEstablishment (name)': 'Further education',
          'FurtherEducationType (name)': 'Sixth Form College (General)',
        }),
      ),
    ).toBe('sixth-form-college');
    expect(
      classify(
        row({
          'TypeOfEstablishment (name)': 'Further education',
          'FurtherEducationType (name)': 'Land-Based College',
        }),
      ),
    ).toBe('specialist-college');
    expect(classify(row({ 'TypeOfEstablishment (name)': 'Academy 16-19 converter' }))).toBe(
      'post-16-academy',
    );
    expect(classify(row({ 'TypeOfEstablishment (name)': 'University technical college' }))).toBe(
      'technical-college',
    );
    expect(classify(row({ 'TypeOfEstablishment (name)': 'Special post 16 institution' }))).toBe(
      'special-post-16',
    );
    expect(classify(row({ 'TypeOfEstablishment (name)': 'Higher education institutions' }))).toBe(
      'university',
    );
  });

  it('lists state school sixth forms but not independent, special, Welsh or overseas ones', () => {
    const sixth = { 'OfficialSixthForm (name)': 'Has a sixth form' };
    expect(classify(row(sixth))).toBe('school-sixth-form');
    expect(
      classify(row({ ...sixth, 'EstablishmentTypeGroup (name)': 'Independent schools' })),
    ).toBeNull();
    expect(
      classify(row({ ...sixth, 'EstablishmentTypeGroup (name)': 'Special schools' })),
    ).toBeNull();
    expect(
      classify(row({ ...sixth, 'EstablishmentTypeGroup (name)': 'Welsh schools' })),
    ).toBeNull();
    expect(classify(row({ 'OfficialSixthForm (name)': 'Does not have a sixth form' }))).toBeNull();
  });

  it('skips closed establishments but keeps "open, but proposed to close"', () => {
    const college = {
      'TypeOfEstablishment (name)': 'Further education',
      'FurtherEducationType (name)': 'General Further Education College',
    };
    expect(classify(row({ ...college, 'EstablishmentStatus (name)': 'Closed' }))).toBeNull();
    expect(
      classify(row({ ...college, 'EstablishmentStatus (name)': 'Open, but proposed to close' })),
    ).toBe('general-college');
  });
});

describe('websiteUrl', () => {
  it('adds https, upgrades http, and rejects junk', () => {
    expect(websiteUrl('www.citylit.ac.uk')).toBe('https://www.citylit.ac.uk/');
    expect(websiteUrl('http://www.haverstock.camden.sch.uk/')).toBe(
      'https://www.haverstock.camden.sch.uk/',
    );
    expect(websiteUrl('  https://x.ac.uk/path  ')).toBe('https://x.ac.uk/path');
    expect(websiteUrl('')).toBeNull();
    expect(websiteUrl('not a url')).toBeNull();
    expect(websiteUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('mapGiasRecord', () => {
  it('maps a college to a valid, honest listing with coordinates from its grid reference', () => {
    const mapped = mapGiasRecord(
      row({
        URN: '130401',
        EstablishmentName: 'City Lit',
        'TypeOfEstablishment (name)': 'Further education',
        'FurtherEducationType (name)': 'General Further Education College',
        Town: 'London',
        Postcode: 'WC2B 4BA',
        SchoolWebsite: 'www.citylit.ac.uk',
        Easting: '530603',
        Northing: '181260',
        'GOR (name)': 'London',
      }),
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const input = mapped.input;
    expect(OpportunityInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      externalId: '130401',
      type: 'course',
      title: 'Study at City Lit',
      applyUrl: 'https://www.citylit.ac.uk/',
      sector: null,
      minAge: 16,
      cost: { kind: 'funded' },
    });
    expect(input.location.lat).toBeCloseTo(51.515, 2);
    expect(input.location.lon).toBeCloseTo(-0.119, 2);
    expect(input.location.region).toBe('london');
    expect(input.description).toContain('Check the college website');
  });

  it('falls back to the official GIAS page when there is no website', () => {
    const mapped = mapGiasRecord(
      row({
        URN: '999',
        'TypeOfEstablishment (name)': 'Further education',
        'FurtherEducationType (name)': 'General Further Education College',
        SchoolWebsite: '',
      }),
    );
    expect(mapped.ok && mapped.input.applyUrl).toBe(
      'https://get-information-schools.service.gov.uk/Establishments/Establishment/Details/999',
    );
  });

  it('uses geocoded coordinates when there is no grid reference', () => {
    const mapped = mapGiasRecord({
      ...row({ 'OfficialSixthForm (name)': 'Has a sixth form', Easting: '', Northing: '' }),
      _geo: {
        lat: 53.8,
        lon: -1.55,
        region: 'yorkshire-and-the-humber',
        country: 'england',
        outcode: 'LS1',
      },
    });
    expect(mapped.ok && mapped.input.location.lat).toBe(53.8);
  });

  it('describes universities as paid degrees and school sixth forms as free level 3 study', () => {
    const uni = mapGiasRecord(
      row({ 'TypeOfEstablishment (name)': 'Higher education institutions' }),
    );
    expect(uni.ok && uni.input).toMatchObject({ type: 'degree', cost: { kind: 'paid' } });
    const sixth = mapGiasRecord(row({ 'OfficialSixthForm (name)': 'Has a sixth form' }));
    expect(sixth.ok && sixth.input).toMatchObject({
      title: 'Sixth form at Test Place',
      level: 3,
      minAge: 16,
      maxAge: 19,
    });
  });

  it('never invents specifics: no course names, no "offers T Levels" certainty', () => {
    const mapped = mapGiasRecord(
      row({
        'TypeOfEstablishment (name)': 'Further education',
        'FurtherEducationType (name)': 'General Further Education College',
      }),
    );
    expect(mapped.ok && mapped.input.description).toMatch(/typically/);
  });

  it('rejects rows that are not listed kinds', () => {
    expect(mapGiasRecord(row({})).ok).toBe(false);
    expect(mapGiasRecord('nope').ok).toBe(false);
  });
});

describe('selectRows', () => {
  it('streams only the providers worth listing from a CSV', () => {
    const header =
      'URN,EstablishmentName,TypeOfEstablishment (name),EstablishmentTypeGroup (name),EstablishmentStatus (name),FurtherEducationType (name),OfficialSixthForm (name),Town,Postcode,SchoolWebsite,Easting,Northing,GOR (name),Other';
    const csv = [
      header,
      '1,"Leeds City College, Park Lane",Further education,Colleges,Open,General Further Education College,Not applicable,Leeds,LS3 1AA,www.lcc.ac.uk,429000,434000,Yorkshire and the Humber,x',
      '2,Primary School,Community school,Local authority maintained schools,Open,,Does not have a sixth form,Leeds,LS1 1AA,,,,,x',
      '3,Closed College,Further education,Colleges,Closed,General Further Education College,,Leeds,LS1 1AA,,,,,x',
    ].join('\n');
    const rows = [...selectRows(csv)];
    expect(rows.map((r) => r.URN)).toEqual(['1']);
    expect(rows[0]?.EstablishmentName).toBe('Leeds City College, Park Lane');
  });
});
