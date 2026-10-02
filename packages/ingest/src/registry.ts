import { createAtsAdapter } from './adapters/ats';
import { ATS_EMPLOYERS } from './adapters/ats/employers';
import { courseDirectoryAdapter } from './adapters/course-directory';
import { curatedAdapter } from './adapters/curated';
import { faaAdapter } from './adapters/find-an-apprenticeship';
import { giasAdapter } from './adapters/gias';
import { sampleAdapter } from './adapters/sample';
import { teachingVacanciesAdapter } from './adapters/teaching-vacancies';
import type { Env, ProviderAdapter } from './types';

/** Every STORE-policy adapter. (Federated cache/live providers live in ./federated.) */
export const ADAPTERS: readonly ProviderAdapter[] = [
  curatedAdapter,
  teachingVacanciesAdapter,
  giasAdapter,
  createAtsAdapter('greenhouse', ATS_EMPLOYERS),
  createAtsAdapter('lever', ATS_EMPLOYERS),
  createAtsAdapter('ashby', ATS_EMPLOYERS),
  faaAdapter,
  courseDirectoryAdapter,
  sampleAdapter,
];

/**
 * Which adapters a plain `pnpm ingest` runs: the real ones that are configured. Sample data is
 * opt-in (ALLOW_SAMPLE_DATA=true or `--provider sample`), so it can never appear by accident.
 */
export function defaultAdapters(env: Env): ProviderAdapter[] {
  return ADAPTERS.filter(
    (a) => (a.meta.isSample ? env.ALLOW_SAMPLE_DATA === 'true' : true) && a.isConfigured(env),
  );
}

export function findAdapter(id: string): ProviderAdapter | undefined {
  return ADAPTERS.find((a) => a.meta.id === id);
}
