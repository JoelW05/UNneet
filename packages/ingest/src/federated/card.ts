import { createHash } from 'node:crypto';
import {
  classifySector,
  htmlToText,
  type OpportunityCard,
  type Pay,
  type ProviderMeta,
  summarise,
  tidyTitle,
} from '@unneet/domain';

/** Deterministic UUID (v5-shaped) so the same external job always gets the same id. */
export function uuidFrom(name: string): string {
  const h = createHash('sha1').update(name).digest();
  h[6] = ((h[6] as number) & 0x0f) | 0x50;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface FederatedJob {
  externalId: string;
  title: string;
  description: string;
  employer: string;
  url: string;
  locationLabel: string;
  lat?: number | null;
  lon?: number | null;
  pay: Pay | null;
  postedAt: string | null;
  closesAt: string | null;
  fullTime?: boolean | null;
}

/** Build a UI-ready card from a federated job. Not stored; links straight out. */
export function toFederatedCard(job: FederatedJob, provider: ProviderMeta): OpportunityCard {
  const text = job.description.includes('<') ? htmlToText(job.description) : job.description;
  const title = tidyTitle(job.title);
  const sector = classifySector(title, text).sector;
  return {
    id: uuidFrom(`${provider.id}:${job.externalId}`),
    slug: `${provider.id}-${job.externalId}`,
    type: 'job',
    pillar: 'employment',
    title,
    summary: summarise(text, 220),
    organisation: { name: job.employer, url: null },
    sector,
    level: null,
    minEntryLevel: null,
    location: {
      label: job.locationLabel,
      lat: job.lat ?? null,
      lon: job.lon ?? null,
      workMode: 'onsite',
    },
    pay: job.pay,
    cost: { kind: 'unknown', amount: null },
    duration: null,
    postedAt: job.postedAt,
    closesAt: job.closesAt,
    startsAt: null,
    minAge: null,
    maxAge: null,
    tags: job.fullTime === false ? ['part-time'] : [],
    skills: [],
    experienceRequired: null,
    distanceMiles: null,
    externalUrl: job.url,
    source: {
      providerId: provider.id,
      providerName: provider.name,
      licence: provider.licence,
      attribution: provider.attribution,
      attributionUrl: provider.attributionUrl,
      isSample: false,
    },
  };
}
