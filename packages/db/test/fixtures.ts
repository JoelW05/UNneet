import type { OpportunityInput, ProviderMeta } from '@unneet/domain';

export const PROVIDER: ProviderMeta = {
  id: 'test',
  name: 'Test provider',
  licence: 'Test licence',
  attribution: 'Test attribution',
  attributionUrl: 'https://example.com/attribution',
  storagePolicy: 'store',
  isSample: false,
  requiresKey: false,
};

export const MANCHESTER = { lat: 53.4808, lon: -2.2426 };
export const LONDON = { lat: 51.5074, lon: -0.1278 };
export const SALFORD = { lat: 53.4875, lon: -2.2901 }; // ~2 miles from Manchester centre

let n = 0;
export function opp(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  n += 1;
  return {
    externalId: `ext-${n}`,
    type: 'job',
    title: `Test role ${n}`,
    description: `A description for test role ${n}. You will help customers and work in a team.`,
    organisation: { name: 'Acme Ltd', url: null },
    applyUrl: `https://example.com/apply/${n}`,
    sector: null,
    level: null,
    minEntryLevel: null,
    location: { label: 'Manchester', ...MANCHESTER, workMode: 'onsite' },
    ...overrides,
  };
}
