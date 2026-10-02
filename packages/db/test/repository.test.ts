import { type ResolvedSearch, resolveDefaults, type SearchQuery } from '@unneet/domain';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPartner,
  createReport,
  deleteUserData,
  expireUnseen,
  exportUserData,
  findPartnerByKey,
  getOpportunityBySlug,
  getProfile,
  listSaved,
  putProfile,
  saveOpportunity,
  searchOpportunities,
  similarOpportunities,
  unsaveOpportunity,
  upsertOpportunities,
  upsertProvider,
  upsertSkills,
} from '../src';
import { authUser, opportunities } from '../src/schema';
import { LONDON, MANCHESTER, opp, PROVIDER, SALFORD } from './fixtures';
import { startTestDb, type TestDb } from './helpers';

const NOW = new Date('2026-10-01T12:00:00Z');
let t: TestDb;

const search = (
  q: SearchQuery = {},
  centre?: ResolvedSearch['centre'],
): Promise<Awaited<ReturnType<typeof searchOpportunities>>> =>
  searchOpportunities(t.db, resolveDefaults(q, centre), { now: NOW });
const titles = (r: { items: Array<{ title: string }> }) => r.items.map((i) => i.title);

beforeAll(async () => {
  t = await startTestDb();
  await upsertProvider(t.db, PROVIDER);
  await upsertSkills(t.db, [
    { id: 'customer-service', label: 'Customer service', category: 'people', aliases: [] },
    { id: 'teamwork', label: 'Teamwork', category: 'people', aliases: [] },
  ]);

  const items = [
    // jobs
    opp({
      externalId: 'care-job',
      title: 'Care Assistant',
      sector: 'care-services',
      description: 'Support adults in a residential care home. Kind and patient people welcome.',
      minEntryLevel: 0,
      level: 0,
      pay: { min: 12.5, max: 13.5, unit: 'hour', isEstimate: false },
      postedAt: '2026-09-28T09:00:00Z',
      location: { label: 'Salford', ...SALFORD, workMode: 'onsite' },
      tags: ['no-experience'],
      experienceRequired: false,
    }),
    opp({
      externalId: 'digital-job',
      title: 'Junior Web Developer',
      sector: 'digital',
      level: 3,
      minEntryLevel: 3,
      pay: { min: 28000, max: 32000, unit: 'year', isEstimate: false },
      postedAt: '2026-09-20T09:00:00Z',
      location: { label: 'Manchester', ...MANCHESTER, workMode: 'hybrid' },
    }),
    opp({
      externalId: 'london-job',
      title: 'Warehouse Operative',
      sector: 'transport-logistics',
      level: 1,
      minEntryLevel: 0,
      pay: { min: 11.5, max: null, unit: 'hour', isEstimate: false },
      postedAt: '2026-09-25T09:00:00Z',
      location: { label: 'London', ...LONDON, workMode: 'onsite' },
    }),
    opp({
      externalId: 'remote-job',
      title: 'Customer Support Advisor',
      sector: 'business-administration',
      level: 2,
      minEntryLevel: 2,
      pay: { min: 24000, max: 24000, unit: 'year', isEstimate: false },
      postedAt: '2026-09-29T09:00:00Z',
      location: { label: 'Online', workMode: 'remote' },
      skills: ['x'],
    }),
    opp({
      externalId: 'closed-job',
      title: 'Closed Barista Role',
      sector: 'catering-hospitality',
      postedAt: '2026-08-01T09:00:00Z',
      closesAt: '2026-09-15T00:00:00Z',
    }),
    // apprenticeship (keyword test: title does NOT contain the word)
    opp({
      externalId: 'apprentice',
      type: 'apprenticeship',
      title: 'Business Administrator (Level 3)',
      sector: 'business-administration',
      level: 3,
      minEntryLevel: 2,
      minAge: 16,
      pay: { min: 7.55, max: 9, unit: 'hour', isEstimate: false },
      cost: { kind: 'free', amount: null },
      postedAt: '2026-09-27T09:00:00Z',
      location: { label: 'Manchester', ...MANCHESTER, workMode: 'onsite' },
    }),
    // courses
    opp({
      externalId: 'free-course',
      type: 'course',
      title: 'Free Digital Skills Course',
      sector: 'digital',
      level: 2,
      minEntryLevel: 0,
      cost: { kind: 'free', amount: null },
      postedAt: '2026-09-10T09:00:00Z',
      location: { label: 'Online', workMode: 'remote' },
    }),
    opp({
      externalId: 'paid-course',
      type: 'course',
      title: 'Advanced Accounting Diploma',
      sector: 'legal-finance-accounting',
      level: 4,
      minEntryLevel: 3,
      cost: { kind: 'paid', amount: 2400 },
      postedAt: '2026-09-12T09:00:00Z',
      location: { label: 'Manchester', ...MANCHESTER, workMode: 'onsite' },
    }),
    opp({
      externalId: 'support',
      type: 'support',
      title: 'Free Careers Advice',
      cost: { kind: 'free', amount: null },
      minEntryLevel: 0,
      location: { label: 'UK-wide', workMode: 'nationwide' },
      minAge: 13,
    }),
    opp({
      externalId: 'young-only',
      type: 'programme',
      title: 'Youth Hub Support (16 to 24)',
      cost: { kind: 'free', amount: null },
      minAge: 16,
      maxAge: 24,
      location: { label: 'UK-wide', workMode: 'nationwide' },
    }),
  ];
  // Give the remote job real skills (links) to exercise the join + keywords.
  items[3] = { ...(items[3] as (typeof items)[number]), skills: ['customer-service'] };
  const withSkills = items.map((input) => ({
    input,
    skillIds: input.externalId === 'remote-job' ? ['customer-service', 'teamwork'] : [],
  }));
  await upsertOpportunities(t.db, PROVIDER, withSkills, {
    now: NOW,
    skillLabels: new Map([
      ['customer-service', 'Customer service'],
      ['teamwork', 'Teamwork'],
    ]),
  });
}, 90_000);

afterAll(async () => {
  await t?.stop();
});

describe('upsertOpportunities', () => {
  it('is idempotent: same data → unchanged; changed data → updated; slug stays stable', async () => {
    const input = opp({
      externalId: 'idem-1',
      title: 'Idempotent Role',
      description: 'Original description text.',
    });
    const first = await upsertOpportunities(t.db, PROVIDER, [{ input, skillIds: [] }], {
      now: NOW,
    });
    expect(first).toEqual({ seen: 1, created: 1, updated: 0, unchanged: 0 });
    const [row1] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'idem-1'));

    const second = await upsertOpportunities(t.db, PROVIDER, [{ input, skillIds: [] }], {
      now: NOW,
    });
    expect(second).toEqual({ seen: 1, created: 0, updated: 0, unchanged: 1 });

    const changed = { ...input, description: 'A brand new description.' };
    const third = await upsertOpportunities(t.db, PROVIDER, [{ input: changed, skillIds: [] }], {
      now: NOW,
    });
    expect(third).toEqual({ seen: 1, created: 0, updated: 1, unchanged: 0 });
    const [row2] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'idem-1'));
    expect(row2?.slug).toBe(row1?.slug);
    expect(row2?.description).toBe('A brand new description.');
  });

  it('collapses duplicate external ids within a batch (last wins)', async () => {
    const a = opp({ externalId: 'dup-1', title: 'Dup One First' });
    const b = { ...a, title: 'Dup One Second' };
    const stats = await upsertOpportunities(
      t.db,
      PROVIDER,
      [
        { input: a, skillIds: [] },
        { input: b, skillIds: [] },
      ],
      { now: NOW },
    );
    expect(stats.created).toBe(1);
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'dup-1'));
    expect(row?.title).toBe('Dup One Second');
  });

  it('expires unseen listings and resurrects them when they return', async () => {
    const input = opp({ externalId: 'expire-1', title: 'Expiring Listing' });
    await upsertOpportunities(t.db, PROVIDER, [{ input, skillIds: [] }], {
      now: new Date('2026-01-01'),
    });
    const expired = await expireUnseen(t.db, PROVIDER.id, new Date('2026-06-01'));
    expect(expired).toBeGreaterThanOrEqual(1);
    const [gone] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'expire-1'));
    expect(gone?.status).toBe('expired');

    await upsertOpportunities(t.db, PROVIDER, [{ input, skillIds: [] }], { now: NOW });
    const [back] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'expire-1'));
    expect(back?.status).toBe('live');
  });

  it('derives pillar, annual pay, isFree and keywords', async () => {
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'apprentice'));
    expect(row?.pillar).toBe('training');
    expect(row?.isFree).toBe(true);
    expect(row?.annualPayMax).toBe(17550); // £9/h × 37.5 × 52
    expect(row?.keywords).toMatch(/Apprenticeship/);
    expect(row?.keywords).toMatch(/Business and administration/);
  });
});

describe('searchOpportunities: filters', () => {
  it('excludes closed and non-live listings by default, includes closed on request', async () => {
    const open = await search();
    expect(titles(open)).not.toContain('Closed Barista Role');
    const all = await search({ openOnly: false });
    expect(titles(all)).toContain('Closed Barista Role');
  });

  it('filters by pillar, type and sector', async () => {
    expect(titles(await search({ type: ['apprenticeship'] }))).toEqual([
      'Business Administrator (Level 3)',
    ]);
    const training = await search({ pillar: ['training'] });
    expect(titles(training)).toContain('Business Administrator (Level 3)');
    expect(titles(await search({ sector: ['digital'] })).sort()).toEqual([
      'Free Digital Skills Course',
      'Junior Web Developer',
    ]);
  });

  it('filters by level range and treats unknown level as non-matching', async () => {
    const r = await search({ levelMin: 3, levelMax: 3 });
    expect(titles(r).sort()).toEqual(['Business Administrator (Level 3)', 'Junior Web Developer']);
    expect((await search({ levelMax: 0 })).items.every((i) => i.level === 0)).toBe(true);
  });

  it('"I have qualifications up to…" keeps unknown/no requirement and what I can start', async () => {
    const r = await search({ qualified: 2 });
    expect(titles(r)).not.toContain('Junior Web Developer'); // needs Level 3
    expect(titles(r)).not.toContain('Advanced Accounting Diploma'); // needs Level 3
    expect(titles(r)).toContain('Care Assistant');
    expect(titles(r)).toContain('Business Administrator (Level 3)'); // needs Level 2
  });

  it('filters free / max cost', async () => {
    const free = await search({ free: true });
    expect(free.items.every((i) => i.cost.kind === 'free' || i.cost.kind === 'funded')).toBe(true);
    expect(titles(free)).not.toContain('Advanced Accounting Diploma');
    expect(titles(await search({ costMax: 3000, type: ['course'] }))).toContain(
      'Advanced Accounting Diploma',
    );
    expect(titles(await search({ costMax: 1000, type: ['course'] }))).not.toContain(
      'Advanced Accounting Diploma',
    );
  });

  it('filters by minimum annual pay across units', async () => {
    // £12.50–13.50/h ≈ £25,350 a year; £28–32k; £24k
    const r = await search({ payMin: 25_000 });
    expect(titles(r).sort()).toEqual(['Care Assistant', 'Junior Web Developer']);
  });

  it('filters by age eligibility', async () => {
    expect(titles(await search({ age: 15 }))).not.toContain('Youth Hub Support (16 to 24)');
    expect(titles(await search({ age: 20 }))).toContain('Youth Hub Support (16 to 24)');
    expect(titles(await search({ age: 30 }))).not.toContain('Youth Hub Support (16 to 24)');
  });

  it('filters by work mode and "no experience needed"', async () => {
    expect(titles(await search({ workMode: ['remote'] })).sort()).toEqual([
      'Customer Support Advisor',
      'Free Digital Skills Course',
    ]);
    expect(titles(await search({ noExperience: true }))).toEqual(['Care Assistant']);
  });
});

describe('searchOpportunities: text', () => {
  it('ranks title matches above description-only matches', async () => {
    const r = await search({ q: 'care assistant' });
    expect(r.items[0]?.title).toBe('Care Assistant');
  });

  it('tolerates typos via trigram similarity', async () => {
    const r = await search({ q: 'asistant care' });
    expect(titles(r)).toContain('Care Assistant');
  });

  it('matches derived keywords (type label, sector words) not present in the title', async () => {
    expect(titles(await search({ q: 'apprenticeship' }))).toContain(
      'Business Administrator (Level 3)',
    );
    expect(titles(await search({ q: 'teamwork' }))).toContain('Customer Support Advisor');
  });

  it('is safe against hostile input', async () => {
    const hostile = [
      '"; DROP TABLE opportunities; --',
      "' OR 1=1 --",
      '((((',
      'a & | ! :* <->',
      '\\',
    ];
    for (const q of hostile) {
      await expect(search({ q })).resolves.toBeDefined();
    }
    const counted = await t.db.execute(sql`select count(*)::int as n from opportunities`);
    expect((counted.rows[0] as { n: number } | undefined)?.n).toBeGreaterThan(5);
  });
});

describe('searchOpportunities: location', () => {
  const centre = { ...MANCHESTER, label: 'Manchester' };

  it('keeps things within the radius, plus remote/nationwide, and drops far-away listings', async () => {
    const r = await search({ radius: 10 }, centre);
    const ts = titles(r);
    expect(ts).toContain('Care Assistant'); // Salford ~3 mi
    expect(ts).toContain('Junior Web Developer');
    expect(ts).toContain('Customer Support Advisor'); // remote
    expect(ts).toContain('Free Careers Advice'); // nationwide
    expect(ts).not.toContain('Warehouse Operative'); // London
  });

  it('reports distance and sorts nearest-first', async () => {
    const r = await search({ radius: 10, sort: 'distance' }, centre);
    const withDistance = r.items.filter((i) => i.distanceMiles !== null);
    expect(withDistance.length).toBeGreaterThan(0);
    const distances = withDistance.map((i) => i.distanceMiles as number);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    const care = r.items.find((i) => i.title === 'Care Assistant');
    // Salford is ~2 miles from the Manchester centre point
    expect(care?.distanceMiles).toBeGreaterThan(1);
    expect(care?.distanceMiles).toBeLessThan(3);
  });

  it('includes far listings when the radius is wide enough', async () => {
    expect(titles(await search({ radius: 250 }, centre))).toContain('Warehouse Operative');
  });
});

describe('searchOpportunities: facets', () => {
  it('counts each facet disjunctively: selecting one sector still shows the others', async () => {
    const r = await search({ sector: ['digital'] });
    const sectors = Object.fromEntries(r.facets.sector.map((b) => [b.value, b.count]));
    expect(sectors.digital).toBe(2);
    expect(sectors['care-services']).toBe(1); // still visible, though filtered out of the results
    expect(r.total).toBe(2);
  });

  it('applies other filters to a facet’s counts', async () => {
    const r = await search({ type: ['course'] });
    const sectors = Object.fromEntries(r.facets.sector.map((b) => [b.value, b.count]));
    expect(sectors.digital).toBe(1); // only the course, not the web developer job
    expect(sectors['care-services']).toBeUndefined();
  });

  it('reports free counts and orders levels numerically', async () => {
    const r = await search();
    expect(r.facets.free).toBeGreaterThanOrEqual(4);
    const levels = r.facets.level.map((b) => Number(b.value));
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('skips facet queries on request', async () => {
    const r = await searchOpportunities(t.db, resolveDefaults({}), { now: NOW, facets: false });
    expect(r.facets.sector).toEqual([]);
  });
});

describe('searchOpportunities: sorting and paging', () => {
  it('sorts by pay and by newest', async () => {
    const pay = await search({ sort: 'pay', type: ['job'] });
    expect(pay.items[0]?.title).toBe('Junior Web Developer');
    const newest = await search({ sort: 'newest', type: ['job'] });
    expect(newest.items[0]?.title).toBe('Customer Support Advisor');
  });

  it('pages without overlap and reports the total', async () => {
    const p1 = await search({ page: 1, pageSize: 3 });
    const p2 = await search({ page: 2, pageSize: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p1.total).toBeGreaterThan(3);
    const ids1 = new Set(p1.items.map((i) => i.id));
    expect(p2.items.every((i) => !ids1.has(i.id))).toBe(true);
  });
});

describe('detail and similar', () => {
  it('loads a listing with source and skills, and null for unknown slugs', async () => {
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'remote-job'));
    const detail = await getOpportunityBySlug(t.db, row?.slug ?? '');
    expect(detail?.title).toBe('Customer Support Advisor');
    expect(detail?.skills.map((s) => s.label).sort()).toEqual(['Customer service', 'Teamwork']);
    expect(detail?.source.providerName).toBe('Test provider');
    expect(detail?.status).toBe('live');
    expect(await getOpportunityBySlug(t.db, 'nope')).toBeNull();
  });

  it('finds similar listings, never including itself', async () => {
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'digital-job'));
    const similar = await similarOpportunities(t.db, row?.slug ?? '', 5, NOW);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.some((s) => s.slug === row?.slug)).toBe(false);
    expect(similar[0]?.sector).toBe('digital');
  });
});

describe('user data (UK GDPR)', () => {
  const userId = 'user-1';

  beforeAll(async () => {
    await t.db
      .insert(authUser)
      .values({ id: userId, name: 'Test User', email: 'test@example.com' });
  });

  it('stores and parses a profile document with defaults', async () => {
    await putProfile(t.db, userId, {
      highestLevel: 2,
      skills: [],
      jobTitles: [],
      values: [],
      sectorsInterested: ['digital'],
      budget: 'any',
      education: [],
      experience: [],
      achievements: [],
      doneTimelineIds: [],
    });
    const profile = await getProfile(t.db, userId);
    expect(profile?.highestLevel).toBe(2);
    expect(profile?.sectorsInterested).toEqual(['digital']);
    expect(await getProfile(t.db, 'nobody')).toBeNull();
  });

  it('saves, lists and un-saves opportunities; rejects unknown ids', async () => {
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'care-job'));
    const id = row?.id ?? '';
    expect(await saveOpportunity(t.db, userId, id)).toBe(true);
    expect(await saveOpportunity(t.db, userId, id)).toBe(true); // idempotent
    expect(await saveOpportunity(t.db, userId, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect((await listSaved(t.db, userId)).map((o) => o.title)).toEqual(['Care Assistant']);
    await unsaveOpportunity(t.db, userId, id);
    expect(await listSaved(t.db, userId)).toEqual([]);
  });

  it('exports everything and erases everything', async () => {
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'care-job'));
    await saveOpportunity(t.db, userId, row?.id ?? '');
    const exported = await exportUserData(t.db, userId);
    expect(exported?.account.email).toBe('test@example.com');
    expect(exported?.profile?.highestLevel).toBe(2);
    expect(exported?.saved).toHaveLength(1);

    expect(await deleteUserData(t.db, userId)).toBe(true);
    expect(await exportUserData(t.db, userId)).toBeNull();
    expect(await getProfile(t.db, userId)).toBeNull();
    expect(await listSaved(t.db, userId)).toEqual([]);
  });
});

describe('reports and partners', () => {
  it('records a report against a real listing only', async () => {
    const [row] = await t.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.externalId, 'care-job'));
    expect(
      await createReport(t.db, {
        slug: row?.slug ?? '',
        reason: 'closed',
        note: 'No longer taking applications',
      }),
    ).toBe(true);
    expect(await createReport(t.db, { slug: 'missing', reason: 'scam' })).toBe(false);
  });

  it('issues a partner key once and authenticates by hash', async () => {
    const { apiKey } = await createPartner(t.db, { providerId: PROVIDER.id, name: 'Test College' });
    expect(apiKey.startsWith('unn_')).toBe(true);
    const found = await findPartnerByKey(t.db, apiKey);
    expect(found?.name).toBe('Test College');
    expect(found?.provider.id).toBe(PROVIDER.id);
    expect(await findPartnerByKey(t.db, 'unn_wrong')).toBeNull();
  });
});
