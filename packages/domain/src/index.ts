/**
 * @unneet/domain — pure domain logic. No I/O, no framework imports, safe to use from the
 * browser, the API and scripts alike.
 *
 * - taxonomy:  sectors, qualification levels, opportunity types, stages, values
 * - schemas:   Zod schemas (validation + types + OpenAPI source of truth)
 * - lib:       geo, math, money, text helpers
 * - quiz:      interest (RIASEC) scoring
 * - skills:    CV → skills/qualifications extraction
 * - classify:  free text → sector
 * - matching:  explainable ranking engine
 * - timeline:  stage-based "what to do when" engine + iCalendar export
 */
export * from './classify/sector';
export * from './fit/assess';
export * from './lib/geo';
export * from './lib/math';
export * from './lib/money';
export * from './lib/places';
export * from './lib/text';
export { DEFAULT_WEIGHTS } from './matching/config';
export { rankMatches, scoreCandidate } from './matching/engine';
export { effectiveGoal } from './matching/features';
export { rankSectors, type SectorScore } from './matching/sectors';
export * from './matching/types';
export * from './quiz/riasec';
export * from './requirements/extract';
export * from './schemas/history';
export * from './schemas/opportunity';
export * from './schemas/pathway';
export * from './schemas/profile';
export * from './schemas/provider';
export * from './schemas/requirements';
export * from './schemas/search';
export * from './schemas/timeline';
export * from './skills/cv';
export * from './skills/matcher';
export * from './taxonomy';
export * from './taxonomy/stages';
export * from './timeline/dates';
export * from './timeline/engine';
export * from './timeline/ics';
export * from './timeline/links';
