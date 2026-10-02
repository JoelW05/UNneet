# UnNEET

**One place to find a job, apprenticeship, course or training opportunity in the UK, built for 16–24s and open to everyone.**

Opportunities in the UK are scattered across Find an apprenticeship, the National Careers Service, colleges, schools,
employers and charities, each with its own search and its own jargon. UnNEET pulls the real listings into one
searchable bank, explains plainly what each one asks of you, and shows how well *you* fit it, so "I don't know what I
want" becomes a short list of realistic next steps.

The name is a play on the government's statistical term NEET (Not in Education, Employment or Training). The word is
the pun and the policy context; the product never labels a person with it.

> **Status:** a working foundation, not a finished product. The data pipeline, API and the core of the web app (home,
> search, opportunity pages, fit and requirements) are built and tested. Several pages (quiz hub, profile, CV screener,
> timeline, saved, sign-in) are still to come. See [HANDOFF.md](./HANDOFF.md) for the exact state and next steps.

## What it does

- **A real opportunity bank, never padded.** Teaching Vacancies, Find an apprenticeship (including NHS and Civil
  Service adverts), the National Careers Service course directory, GIAS colleges/sixth forms/universities, and employer
  job boards (Greenhouse, Lever, Ashby). Each listing has a description and an outbound link. Reed and Adzuna are
  searched live and never added to the catalogue. Sample data is always labelled as such.
- **Filters** for location (with distance), sector, level, and price, plus type, mode and tags.
- **Minimum requirements on every listing.** A conservative, explainable extractor reads each advert for qualifications,
  experience, checks and age, and shows the advert's own words. It will not claim "no experience needed" unless the
  advert says so, and a senior title (head, deputy, manager) is treated as evidence that experience is needed.
- **Traffic-light fit.** Compares a listing's requirements with the user's profile: green, amber or red, with the
  reasons, and "we can't tell" when the advert is silent.
- **CV and skills extraction, interest/values quizzes, personalised pathways and a stage-based timeline** (domain logic
  and API are built; the pages are in progress).

## How it is built

A TypeScript monorepo (pnpm workspaces + Turborepo), Node 22+.

| Package | What it is |
|---|---|
| `packages/domain` | Pure, dependency-light logic: schemas (Zod), taxonomy, matching, requirements extraction, fit, timeline, CV reading |
| `packages/db` | Drizzle ORM schema and migrations for Postgres (PGlite for local dev) |
| `packages/ingest` | Provider adapters, normalisation, geocoding, CLI. Each provider has a storage policy (`store`, `cache`, `live`) that follows its licence |
| `packages/content` | Vetted support and signposting content |
| `packages/api-client` | Typed client generated from the API's OpenAPI document |
| `apps/api` | Hono + OpenAPI REST API, Better Auth (email one-time codes, 16+ gate), rate limiting |
| `apps/web` | Next.js 16, React 19, Tailwind 4, strict nonce-based CSP, WCAG 2.2 AA design tokens |

Tooling: Biome (lint and format, accessibility rules on), TypeScript in strict mode, Vitest.
Design and sourcing notes live in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/DATA-SOURCES.md](./docs/DATA-SOURCES.md)
and [docs/SOURCES.md](./docs/SOURCES.md). Decisions are recorded in [docs/adr](./docs/adr).

## Run it locally

```bash
pnpm install
pnpm db:dev                 # local Postgres (PGlite) on :54329, runs migrations
pnpm ingest -- --provider gias --limit 200      # load some real listings
pnpm --filter @unneet/api dev                   # API on http://localhost:4000 (docs at /docs)
pnpm --filter @unneet/web dev                   # web on http://localhost:3000
pnpm check                                      # lint + typecheck + tests
```

Some providers need free API keys (Find an apprenticeship, Reed, Adzuna). Copy `.env.example` to `.env`, then see
[docs/API-KEYS.md](./docs/API-KEYS.md) for where to get each one. `.env` is git-ignored; never commit it.

## Data and licences

The code is released under the [MIT licence](./LICENSE). The listing data is not covered by it: it belongs to the
sources below and stays under their licences.

Listings come from official open data and public APIs, used within their licences. Government sources are published
under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/);
each provider's attribution is stored and shown with its listings. Test fixtures are real, trimmed records from those
sources with organisation contact details removed. Nothing in the catalogue is invented.
