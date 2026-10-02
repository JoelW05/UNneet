# ADR-0003: Per-provider storage policy (`store` / `cache` / `live`)

- Status: accepted · Date: 2026-10-01

## Context
The product promises "a full bank of opportunities", but the legally and commercially available data
differs by source. Adzuna requires a licence for commercial use and forbids using/aggregating data in
its original form without authorisation, and mandates attribution
([terms](https://developer.adzuna.com/docs/terms_of_service)). Reed's terms are not published in its
docs. DfE's Find an Apprenticeship API and Skills England's maps are published under OGL v3
([DfE](https://beta-find-and-use-an-api.education.gov.uk/api/display-advert-api-2),
[Skills England](https://occupational-maps.skillsengland.education.gov.uk/public-api/)).
DWP Find a Job has no public read API (bulk upload spec only).

## Decision
Every provider adapter declares:

```ts
{ id, name, licence, attribution: { text, url, badge? }, storagePolicy: 'store'|'cache'|'live',
  rateLimit, requiresKey }
```

- `store` → scheduled ingest into Postgres.
- `cache` → federated request-time query, TTL cache ≤ provider limit, results merged into the response
  and never written to `opportunity`.
- `live` → pass-through only.
All results expose `source` and an outbound `applyUrl`. Attribution is rendered wherever a result is shown.

## Consequences
+ Legal posture is explicit, auditable and testable (a contract test fails if a `cache` provider writes rows).
+ Adding/removing a source is a config change.
− Federated results can't be globally re-ranked in SQL; they're merged in the TS stage and flagged.
− Commercial launch requires obtaining the Adzuna licence / confirming Reed terms (tracked in DATA-SOURCES.md).
