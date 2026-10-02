# ADR-0001: pnpm/Turborepo monorepo with a separate Hono API

- Status: accepted · Date: 2026-10-01

## Context
We need a SEO-friendly web UI, a documented API that partners (schools, Jobcentres, charities) can
embed, scheduled ingestion workers, and strong isolation between untrusted rendering code and the
database. Next.js documents three data-access patterns and recommends not mixing them; for
organisations with an existing/independent API it recommends HTTP APIs under a zero-trust model
([data security guide](https://nextjs.org/docs/app/guides/data-security)).

## Decision
- One monorepo (pnpm workspaces + Turborepo) with `apps/web`, `apps/api` and shared `packages/*`.
- The web app talks **only** to the API over HTTP using a client generated from the API's OpenAPI document.
- The API is Hono + `@hono/zod-openapi` ([comparison](https://encore.dev/articles/nestjs-vs-fastify-vs-hono)).

## Consequences
+ Hard trust boundary; independent scaling/deploys; API is a product; contract-first.
+ Domain logic (matching, scoring) is shared as a pure package, not duplicated.
− Extra deployable and network hop; mitigated by same-region hosting and HTTP caching.
− Must keep the OpenAPI client in sync → CI drift check.
