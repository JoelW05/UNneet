export { ADZUNA_PROVIDER, adzunaProvider, mapAdzunaJob } from './adzuna';
export { type FederatedJob, toFederatedCard, uuidFrom } from './card';
export { mapReedJob, parseReedDate, REED_PROVIDER, reedProvider } from './reed';
export type {
  FederatedContext,
  FederatedProvider,
  FederatedQuery,
  FederatedResult,
} from './types';

import { adzunaProvider } from './adzuna';
import { reedProvider } from './reed';
import type { FederatedProvider } from './types';

export const FEDERATED_PROVIDERS: readonly FederatedProvider[] = [reedProvider, adzunaProvider];
