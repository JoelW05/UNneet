import { type Database, searchOpportunities } from '@unneet/db';
import {
  type OpportunityCard,
  type ResolvedSearch,
  resolveDefaults,
  type SearchQuery,
  type SearchResponse,
} from '@unneet/domain';
import type { ExternalResults, FederatedGateway } from './federated-gateway';
import { NO_EXTERNAL } from './federated-gateway';
import type { LocationResolver } from './locations';

export interface SearchServices {
  db: Database;
  locations: LocationResolver;
  federated: FederatedGateway;
  now: () => Date;
}

export interface ResolvedQuery {
  resolved: ResolvedSearch;
  locationError: string | null;
  /** The text partner boards may see for the location (outcode level, never a full postcode). */
  locationText: string | undefined;
}

const LOCATION_ERRORS = {
  'not-found': 'We could not find that place. Try a town, city or postcode.',
  'outside-uk': 'That place is outside the UK, so we cannot search near it.',
  unavailable: 'Location search is not working right now. Showing results from everywhere.',
} as const;

/** Turn the free-text `near` into coordinates. A failure never fails the search: it is reported alongside it. */
export async function resolveQuery(
  locations: LocationResolver,
  query: SearchQuery,
): Promise<ResolvedQuery> {
  if (!query.near) {
    return { resolved: resolveDefaults(query), locationError: null, locationText: undefined };
  }
  const result = await locations.resolve(query.near);
  if (!result.ok) {
    return {
      resolved: resolveDefaults({ ...query, near: undefined }),
      locationError: LOCATION_ERRORS[result.reason],
      locationText: undefined,
    };
  }
  const { lat, lon, label, shareableText } = result.location;
  return {
    resolved: resolveDefaults(query, { lat, lon, label }),
    locationError: null,
    locationText: shareableText,
  };
}

export function collectAttributions(
  cards: readonly OpportunityCard[],
  external: ExternalResults['attributions'],
): SearchResponse['attributions'] {
  const seen = new Map<string, SearchResponse['attributions'][number]>();
  for (const card of cards) {
    if (!seen.has(card.source.providerId)) {
      seen.set(card.source.providerId, {
        providerName: card.source.providerName,
        text: card.source.attribution,
        url: card.source.attributionUrl,
      });
    }
  }
  for (const a of external) if (!seen.has(a.providerName)) seen.set(a.providerName, a);
  return [...seen.values()];
}

export async function runSearch(
  services: SearchServices,
  query: SearchQuery,
  options: { external: boolean },
): Promise<SearchResponse> {
  const { resolved, locationError, locationText } = await resolveQuery(services.locations, query);
  const [result, external] = await Promise.all([
    searchOpportunities(services.db, resolved, { now: services.now() }),
    options.external
      ? services.federated.search(resolved, locationText)
      : Promise.resolve(NO_EXTERNAL),
  ]);
  return {
    items: result.items,
    total: result.total,
    page: resolved.page,
    pageSize: resolved.pageSize,
    totalPages: Math.ceil(result.total / resolved.pageSize),
    facets: result.facets,
    centre: resolved.centre ?? null,
    locationError,
    external: external.items,
    attributions: collectAttributions([...result.items, ...external.items], external.attributions),
  };
}

export async function runExternalSearch(
  services: SearchServices,
  query: SearchQuery,
): Promise<ExternalResults & { locationError: string | null }> {
  const { resolved, locationError, locationText } = await resolveQuery(services.locations, query);
  const external = await services.federated.search(resolved, locationText);
  return { ...external, locationError };
}
