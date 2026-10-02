# UnNEET — Architecture

> One place for anyone in the UK — especially 16–24s — to find a job, apprenticeship, course or
> training opportunity that fits their experience and what they want from life.

This document explains **what we are building, why it is shaped this way, and where each decision
came from**. Every non-obvious choice links to a source in [`SOURCES.md`](./SOURCES.md) or an
[ADR](./adr). If you change a decision, update the ADR.

- Status: foundation + vertical slice (see [Roadmap](#14-roadmap))
- Audience: engineers joining the project, reviewers, partners doing due diligence

---

## 1. Why this exists

ONS estimates **981,000 people aged 16–24 (13.0%) were NEET** in April–June 2026, up 30,000 on the
year; 588,000 of them are economically inactive rather than actively looking for work
([ONS, Aug 2026](https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/bulletins/youngpeoplenotineducationemploymentortrainingneet/august2026)).
The government's Milburn review found the first rung of the ladder is "out of reach" for many, with
mental health, SEND and disability the dominant risk factors
([Learning & Work Institute](https://learningandwork.org.uk/responding-to-the-governments-announcement-on-expanding-opportunities-for-young-people/)).
Youth Futures Foundation (the What Works Centre for youth employment) reports poor mental health
has the largest effect on employment prospects
([strategy 2025–28](https://youthfuturesfoundation.org/strategy-2025-2028/)).

Opportunities exist, but they are scattered across Find a Job, Find an Apprenticeship, the National
Careers Service, colleges, charities and employers — each with different search UX, vocabulary and
eligibility rules. **The product is a single, trustworthy, plain-English front door** that
(a) aggregates and links to all of it, and (b) turns "I don't know what I want" into a short list of
realistic next steps.

### Product principles

1. **Never label the user.** "NEET" is a statistical category, not an identity. The word appears in
   the brand pun and in policy copy, never as a thing we call a person.
2. **Start from where they are.** Nothing needs an account; the quiz, matching and search all work
   anonymously. An account only syncs and saves.
3. **Explain every suggestion.** Each match shows *why* ("uses 3 skills from your CV", "12 miles
   away", "no qualifications needed"). No black boxes.
4. **Show the whole landscape, not a stereotype.** Interest quizzes reproduce gender stereotypes
   ([arXiv 2106.07112](https://arxiv.org/abs/2106.07112)); results always include "stretch" options and a
   "show me everything" path.
5. **Cost and money are first-class.** Free vs paid, pay vs wage, travel — young people with no income
   filter on these first.
6. **Mobile-first.** 96% of 16–24s go online on a handheld device
   ([Ofcom](https://www.ispreview.co.uk/index.php/2025/05/ofcom-find-internet-access-levels-in-the-uk-remain-stable-in-2024.html));
   18% of UK internet users are smartphone-only.
7. **Safe by default for children and vulnerable users.** The ICO Children's Code applies to anyone
   under 18 ([ICO](https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/age-appropriate-design/profiling));
   we design to it for everyone.
8. **Right thing, right time.** Most opportunities are missed by timing, not ability: the summer
   internship that closed in November, the UCAS deadline, the apprenticeship window. The product
   tells people *what to do next and by when* for where they are now (see [§8a Timeline](#8a-timeline--nudges)).

---

## 2. System context

```
                         ┌───────────────────────────────┐
   Browser / phone ────▶ │  apps/web  (Next.js 16, RSC)  │  SSR + SEO + UI. No DB access.
                         └──────────────┬────────────────┘
                                        │ typed REST (OpenAPI contract)
                         ┌──────────────▼────────────────┐
                         │  apps/api  (Hono + zod-openapi)│  validation, auth, rate limit,
                         │  Better Auth · Drizzle         │  search, matching, CV extraction
                         └───┬───────────────┬───────────┘
                             │               │
                  ┌──────────▼───┐    ┌──────▼────────────────────────┐
                  │  PostgreSQL   │    │ Federated providers (live)    │
                  │  FTS+trgm+    │    │ Reed · Adzuna  (link-out only)│
                  │  earthdistance│    └───────────────────────────────┘
                  └──────▲───────┘
                         │ upserts (scheduled)
                  ┌──────┴────────────────────────────────────────────┐
                  │ packages/ingest — provider adapters + pipeline     │
                  │ Find an Apprenticeship · Skills England · ESCO ·    │
                  │ curated programmes · partner JSON/CSV feeds         │
                  └────────────────────────────────────────────────────┘
        Outside services: postcodes.io (geocoding, no key) · SMTP/Resend (auth e-mail)
```

### Why a separate API instead of Next.js route handlers only?

Next.js' own guidance for new projects is a Data Access Layer; for organisations with separate
backend teams or an existing API it recommends calling HTTP APIs under a **zero-trust** model
([Next.js data security](https://nextjs.org/docs/app/guides/data-security)). We chose the second because:

- The API is a **product surface in its own right**: schools, Jobcentres, youth charities and
  partner sites will want to embed search/matching. A documented OpenAPI service is that product.
- It gives a hard **trust boundary**: the web tier cannot touch the database or secrets, so an RSC
  data-leak bug can't expose rows we never sent it.
- It lets the ingest workers, API and web scale and deploy independently.

Cost: one more deployable and a network hop (mitigated by server-side calls on the same network and
HTTP caching). Recorded in [ADR-0001](./adr/0001-monorepo-and-separate-api.md).

---

## 3. Repository layout

```
unneet/
├─ apps/
│  ├─ web/            Next.js 16 App Router UI (SSR, SEO, design system)
│  └─ api/            Hono REST API (OpenAPI, auth, rate limiting)
├─ packages/
│  ├─ domain/         PURE TypeScript: schemas (Zod), taxonomy, matching engine,
│  │                  quiz scoring, skill extraction. No I/O → trivially testable.
│  ├─ db/             Drizzle schema, migrations, client factory, dev DB server
│  ├─ ingest/         Provider adapters, normalise → dedupe → classify → upsert pipeline
│  ├─ content/        Editorial data: quizzes, pathways, timeline rules + dated calendar,
│  │                  skills dictionary, evergreen programmes, sector copy
│  ├─ api-client/     Typed fetch client generated from the API's OpenAPI document
│  └─ config/         (reserved) shared lint/ts presets
├─ docs/              ARCHITECTURE, SOURCES, DATA-SOURCES, SECURITY, ACCESSIBILITY, PRIVACY, ADRs
├─ .github/           CI, CodeQL, Dependabot, CODEOWNERS, PR template
└─ turbo.json · pnpm-workspace.yaml · biome.json · tsconfig.base.json
```

Rules (enforced by lint/CI, see [ADR-0002](./adr/0002-package-boundaries.md)):

- `domain` imports **nothing** from other workspace packages and does no I/O.
- `web` may import `domain` (types, pure helpers) and `api-client`; it must **never** import `db`,
  `ingest` or read database env vars.
- Only `api` and `ingest` import `db`.
- Internal packages are *just-in-time* TypeScript (consumed from source) — no build step in dev
  ([Turborepo internal packages](https://www.pkgpulse.com/guides/how-to-set-up-monorepo-turborepo-2026)).
  Dependency versions are pinned once in the pnpm **catalog**.

---

## 4. Technology choices

| Concern | Choice | Why (and what we rejected) |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | The 2026 default pairing: strict dependency isolation + task caching ([pkgpulse](https://www.pkgpulse.com/guides/javascript-monorepos-2026-best-practices-pitfalls)). Nx rejected: more than we need. |
| Web | **Next.js 16** (App Router, React 19.2, Turbopack) | RSC for fast first paint + SEO; `proxy.ts`, async request APIs, opt-in caching ([release notes](https://nextjs.org/blog/next-16)). |
| Styling | Tailwind CSS v4 (CSS-first tokens) + shadcn/ui primitives | Accessible Radix/Base UI primitives we own the source of; design tokens as CSS variables ([shadcn](https://ui.shadcn.com/docs/installation/next)). |
| Typeface | Atkinson Hyperlegible Next (self-hosted via `next/font`) | Designed for letter distinctiveness; helps low-vision, dyslexic and fatigued readers ([Braille Institute](https://gdusa.com/news/fresh/braille-institute-launches-typeface-for-low-vision)). |
| API | **Hono** + `@hono/zod-openapi` | Web-standard, tiny, Zod-first inference and generated OpenAPI ([encore comparison](https://encore.dev/articles/nestjs-vs-fastify-vs-hono), [Hono docs](https://hono.dev/examples/zod-openapi)). NestJS rejected (ceremony); Fastify is fine but Zod/OpenAPI ergonomics are weaker. |
| Validation | Zod 4 everywhere, schemas live in `domain` | One schema → runtime validation, TS types, OpenAPI. |
| ORM | **Drizzle** | SQL-first, lets us write real Postgres (FTS, trigram, earthdistance) with type safety; tiny; no engine binary ([comparison](https://www.bytebase.com/blog/drizzle-vs-prisma)). |
| Database | **PostgreSQL 16+** | One datastore handles relational + full-text + fuzzy + geo + (later) vectors. |
| Dev database | **PGlite** served over the Postgres wire protocol (`@electric-sql/pglite-socket`) | Real Postgres in WASM, no Docker needed; same `postgres://` URL in dev and prod, so one driver ([PGlite socket](https://pglite.dev/docs/pglite-socket)). Supports `pg_trgm`, `earthdistance`, `unaccent`, `pgvector` ([extensions](https://pglite.dev/extensions/)). CI uses a real Postgres service container. |
| Search | Postgres weighted `tsvector` + `pg_trgm` + `earthdistance` | Hybrid lexical + fuzzy + geo ranking without running Elasticsearch ([hybrid search](https://paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual), [Drizzle FTS](https://orm.drizzle.team/docs/guides/postgresql-full-text-search)). Embeddings (`pgvector`) are a reserved extension point, not v1. |
| Auth | **Better Auth** (e-mail OTP/magic link, passkeys, optional Google) | Auth.js is in maintenance mode and its team joined Better Auth, which is now the recommended path for new projects ([announcement](https://better-auth.com/blog/authjs-joins-better-auth)). Passwordless satisfies WCAG 2.2 *Accessible Authentication* and avoids storing passwords ([WCAG 2.2](https://dequeuniversity.com/resources/wcag-2.2)). |
| Lint/format | Biome | One fast tool; `next lint` was removed in Next 16 ([release notes](https://nextjs.org/blog/next-16)). Includes a11y rules. |
| Tests | Vitest (unit/integration), Playwright + `@axe-core/playwright` (E2E + a11y) | Layered strategy ([Subito write-up](https://dev.to/subito/how-we-automate-accessibility-testing-with-playwright-and-axe-3ok5)). |
| Logging | pino, structured JSON, request IDs, PII redaction | ([Hono logging guide](https://apitally.io/blog/hono-logging-guide)). OpenTelemetry hooks via `instrumentation.ts` ([SigNoz](https://signoz.io/blog/opentelemetry-nextjs-logging)). |

---

## 5. Domain model

Canonical vocabulary lives in `packages/domain/src/taxonomy`.

**Opportunity types** — `job`, `apprenticeship`, `traineeship`, `internship`, `course`,
`bootcamp`, `t-level`, `degree`, `volunteering`, `programme` (support schemes, e.g. Jobcentre Youth
Hubs), `support` (free advice / wellbeing).

**Sectors** — the **15 Skills England occupational routes** (Agriculture, environmental and animal
care · Business and administration · Care services · Catering and hospitality · Construction and the
built environment · Creative and design · Digital · Education and early years · Engineering and
manufacturing · Hair and beauty · Health and science · Legal, finance and accounting · Protective
services · Sales, marketing and procurement · Transport and logistics). Using the official taxonomy
means apprenticeship, T Level and occupational-map data join to our sectors with no mapping layer
([Skills England occupational maps](https://occupational-maps.skillsengland.education.gov.uk/public-api/)).

**Levels** — the UK Regulated Qualifications Framework: Entry 1–3, Level 1–8
([GOV.UK](https://www.gov.uk/what-different-qualification-levels-mean/list-of-qualification-levels)),
stored as an integer (`entry=0`, then 1…8) so range filters are a simple comparison. A listing has
`levelOffered` (what you gain/the role's level) and `minEntryLevel` (what you need to start).

**Price** — deliberately two fields, because "price" means different things:
`cost` (what the learner pays: `free` | £ amount | funding note) and `pay` (what the worker earns,
with unit: hour/day/week/year/…). Filters: *Free only*, *Max cost*, *Min pay* (normalised to annual
full-time-equivalent for comparison).

**Location** — free-text label + `lat/lon` + `region` + `workMode` (`onsite` | `hybrid` | `remote` |
`nationwide`). Radius search uses `earthdistance` with a GiST index. Users supply a postcode or
town; we geocode with postcodes.io and only ever store the **outcode** (e.g. `M1`) for accounts.

Core tables: `opportunity`, `provider`, `skill`, `opportunity_skill`, `ingest_run`, `report`;
Better Auth tables (`user`, `session`, `account`, `verification`); `profile` (1:1 with user),
`saved_opportunity`, `quiz_result`. ER diagram: [`docs/DATA-MODEL.md`](./DATA-MODEL.md).

---

## 6. Data strategy — where listings come from (and what we're allowed to do with them)

The licence of each source decides *how* we integrate it, so every provider declares a
`storagePolicy` ([ADR-0003](./adr/0003-provider-storage-policy.md)):

| Policy | Meaning | Examples |
|---|---|---|
| `store` | Open licence; ingest on a schedule, store, index, attribute | Find an Apprenticeship display API (OGL), Skills England maps (OGL, logo + statement required), curated programmes, partner feeds |
| `cache` | Query at request time, cache briefly, never mirror | Reed, Adzuna (Adzuna requires a licence for commercial use, forbids aggregation without authorisation and mandates a "Jobs by Adzuna" badge — [terms](https://developer.adzuna.com/docs/terms_of_service)) |
| `live` | Never persisted | Any provider whose terms prohibit caching |

Every result carries `source` (provider name, licence, attribution text) and **always links out** to
the original listing; we never scrape. Full registry, sign-up links and status per source:
[`DATA-SOURCES.md`](./DATA-SOURCES.md).

**Honesty about sample data.** Real feeds need keys. Without them the dev seed loads a clearly
labelled `SAMPLE` provider (`isSample = true`); the UI shows a banner and the production build refuses
to start with sample data enabled unless explicitly allowed.

**Partner supply.** Training providers and employers can push opportunities through a keyed
`POST /v1/partner/opportunities` (schema = our `OpportunityInput`) or a JSON/CSV feed — this is how the
bank grows beyond what public APIs expose.

---

## 7. Search

Two-stage retrieval → ranking:

1. **SQL stage (hard filters + lexical relevance).** Filters on type, sector, level range, cost/pay,
   work mode, radius (`earth_box` prefilter on a GiST index, exact `earth_distance` after), status
   and closing date. Text relevance = `ts_rank_cd` over a weighted generated `tsvector`
   (title A, organisation B, summary C, body D, sector/skill terms B) blended with `pg_trgm`
   similarity on title for typo tolerance.
2. **TypeScript stage (personalisation).** For `/v1/match` the top ~300 candidates are re-scored by
   the pure matching engine in `domain` (see §8), then diversified.

Facet counts are computed in the same request so the UI can show "Care services (42)" and avoid
zero-result dead ends ([Algolia filter UX](https://www.algolia.com/blog/ux/search-filter-ux-best-practices/)).
All filters round-trip through the URL (`/search?type=apprenticeship&sector=digital&free=1&near=M1&r=15`)
so results are shareable, bookmarkable and server-rendered for SEO.

---

## 8. Matching & pathways

**Inputs** (all optional — more input, better matches): skills (ESCO-linked), highest qualification,
work/experience history, interests (RIASEC vector from the quiz), values, situation (age band, goal,
constraints, budget), and location.

**Quiz instruments**

| Quiz | Basis | Output |
|---|---|---|
| Interests (30 Qs, ~4 min) | **O\*NET Mini Interest Profiler** (USDOL/ETA, CC BY 4.0), Holland RIASEC, 5-point scale, 0–20 per type ([Mini-IP report](https://www.onetcenter.org/dl_files/Mini-IP.pdf)) | RIASEC vector → sector fit |
| Work values (8 cards, rank top 3) | Custom, inspired by O*NET Work Importance | weights for pay / flexibility / helping / progression … |
| Skills check | ESCO transversal + common vocational skills, self-rated | skills list with confidence |
| Your situation | Custom | goal, constraints, budget, availability |

**Scoring** — a transparent weighted sum, each term in [0,1] and reported back as a reason:
`skills` · `interest` (cosine of RIASEC vectors) · `level` (meets / stretch / overqualified) ·
`location` (distance decay vs. stated travel limit) · `budget` · `goal` (earn-now vs learn-first vs
experience) · `eligibility` (age, entry requirements) · `freshness`. Weights live in one config
object with tests; hard ineligibility (e.g. age band) filters rather than down-ranks. Results are
then **MMR-diversified** and a fixed share are reserved as "stretch / explore" picks to counter
stereotype lock-in.

**Pathways** are curated step sequences per sector (e.g. *Care: volunteer → Level 2 Adult Care
apprenticeship → senior carer → Level 3/4*). Each step is a **query** (type + sector + level), not a
hard-coded listing, so steps always resolve to live opportunities. Skills England progression data
can enrich them once an API key is configured.

### 8a. Timeline & nudges

*"As soon as you start 2nd year at uni, prompt people to apply for internships."* The timeline turns
the calendar into personalised, actionable prompts.

**Inputs:** the person's **stage** (Year 11 · Year 12/13 · college · apprentice · uni year 1 / 2 /
final · graduate · working · between things) and today's date. Stage rolls forward each September
(we *ask* — "has your year changed?" — rather than assume).

**Three kinds of rule** (all *data* in `packages/content`, evaluated by a pure engine in `domain`):

| Kind | Example | Source of truth |
|---|---|---|
| `fixed` | UCAS equal-consideration deadline **13 Jan 2027, 18:00**; teacher-training applications open **6 Oct 2026** | A dated, per-cycle **calendar** where every event has `sourceUrl` + `verifiedOn`. Dates change year to year (UCAS' used to be late January), so the calendar *expires*: CI fails when the next cycle's dates are missing/unverified. |
| `academic` | Uni year 2: **apply for summer internships, Sep–Dec** (big employers recruit 9–10 months ahead and fill on a rolling basis) | Month/day windows repeating each academic year. Worded as *typical*, never as a promise, and each cites a source. |
| `relative` | "Between things": week 1 do the quiz, week 2 talk to a careers adviser … | Days since the person started — a first-30-days plan for people who aren't tied to an academic calendar. |

**Output:** `now` (window open) · `soon` (opens within 45 days) · `later` (this academic year) ·
`recently missed` (still worth doing — "late beats never") · `done`. Every item has *why it matters*,
a short *prepare* checklist, and a **deep link into a pre-filtered search** ("See summer
internships ↗"), so a nudge is one tap from real listings.

**Delivery** (privacy-first, no account required): the `/timeline` page and a "Next up" card on the home
page; a stateless **iCalendar feed** (`/v1/timeline.ics?stage=uni-year-2`, RFC 5545 — the URL carries only
a stage, no personal data); opt-in e-mail reminders for signed-in 16+ users (phase 2, off by default).
Reminder tone is calm and optional — no streaks, no guilt, no "you missed it".

**Safeguards:** timeline copy never promises outcomes; every fixed date links to the official page and
says "check the provider's own deadline"; stale or unverified dates are hidden rather than shown.

**CV intake** — PDF/DOCX/paste → text → skills/titles/education extraction by dictionary + alias
matching against ESCO. Files are validated by magic bytes, size-capped (5 MB), parsed **in memory,
never stored**, and only the text-derived result (which the user reviews and edits) is returned
([OWASP file upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet)). No
third-party AI service receives CV text in v1.

---

## 9. Privacy, safeguarding & compliance

- **Data minimisation:** accounts store e-mail, profile, saved items. Location kept to outcode.
  Guest profiles live only in the browser (`localStorage`); `/v1/match` is stateless and does not log
  bodies.
- **Profiling is opt-in-by-use:** recommendations are the core service the user asked for, but nothing
  is used for advertising; no third-party trackers; no behavioural ad profiling (Children's Code
  guidance on profiling — [ICO](https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/age-appropriate-design/profiling)).
- **Age:** UK digital age of consent is 13. The service is aimed at 16+; sign-up asks age band and
  blocks under-16 account creation; browsing/quiz remain available. High-privacy defaults for all.
- **Rights:** `GET /v1/me/export` (portability) and `DELETE /v1/me` (erasure) from day one.
- **DPIA** draft and ROPA in [`PRIVACY.md`](./PRIVACY.md) — a DPIA is a Children's Code requirement.
- **Cookies:** strictly-necessary only (session). No analytics cookie → no consent banner. Optional
  cookieless analytics (Plausible/Umami) behind a config flag.
- **Safeguarding content:** a persistent "Need to talk to someone?" panel (Samaritans 116 123,
  Shout text 85258, Mind) because mental health is the biggest barrier.

## 10. Security

Defence in depth, mapped to the Next.js audit checklist ([data security](https://nextjs.org/docs/app/guides/data-security)):

- **Trust boundary:** `web` has no DB credentials; every API call validated by Zod.
- **Headers:** nonce-based **strict CSP** with `strict-dynamic` via `proxy.ts`
  ([CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)), plus HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. API uses `secure-headers`.
- **Auth:** HttpOnly SameSite cookies, CSRF origin check, rate-limited OTP, session rotation.
  Server Actions re-check authN **and** authZ (ownership) inside the data layer — IDOR-safe.
- **Input:** Zod on every boundary; body-size limits; upload magic-byte allow-list; no user-supplied
  URL is ever fetched (no SSRF surface).
- **Abuse:** per-IP + per-route rate limits (stricter on auth, upload, report).
- **Output:** outbound links validated `https:` only, rendered `rel="noopener noreferrer nofollow ugc"`;
  third-party descriptions are text-sanitised (no raw HTML anywhere; `noDangerouslySetInnerHtml` is a
  lint error).
- **Supply chain:** pnpm lockfile, `pnpm audit` + Dependabot + CodeQL in CI, pinned Actions.
- **Secrets:** validated at boot (`env` module); only the API reads DB/provider secrets.

Details and threat model: [`SECURITY.md`](./SECURITY.md).

## 11. Accessibility & inclusive design

Target **WCAG 2.2 AA** (target size ≥ 24 px, focus never obscured, accessible authentication, dragging
alternatives, consistent help). Automated axe checks run on every key route in CI; manual checklist
(keyboard, screen reader, 200% zoom, reduced motion, high contrast) in
[`ACCESSIBILITY.md`](./ACCESSIBILITY.md). Plain English (target reading age ~9–11), short sentences,
one idea per screen in quizzes, progress saved automatically, no timers, `prefers-reduced-motion`
respected, dark mode via `prefers-color-scheme`, light/dark/high-contrast tokens all contrast-checked.

## 12. Performance & SEO

- Server Components by default; client JS only for filters, quizzes, uploads. Route-level
  `loading.tsx`/Suspense, `next/image`, font self-hosting, no render-blocking third parties.
- **Budgets:** LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on a mid-range phone (4G). Enforced by a
  Lighthouse CI job against key routes.
- API: HTTP `Cache-Control` + ETag for facet/taxonomy endpoints; keyset-friendly indexes; query
  plans reviewed (`EXPLAIN`) for the search endpoint.
- **SEO:** semantic HTML, metadata API, canonical URLs (filter permutations canonicalise to the base
  route unless indexable), `sitemap.xml`, `robots.txt`, OpenGraph images, and schema.org
  `JobPosting` / `Course` JSON-LD **only** where the source's terms allow republication
  ([Google guidelines](https://developers.google.com/search/docs/appearance/structured-data/job-posting)).

## 13. Quality, delivery & operations

- **Test pyramid:** domain/unit (fast, exhaustive: scoring, extraction, filters) → API integration
  (real Postgres via PGlite) → component → Playwright E2E with axe. Coverage gates on `domain`.
- **CI** (GitHub Actions): install (cached) → Biome → typecheck → unit/integration → build → E2E +
  axe → OpenAPI drift check → `pnpm audit` → CodeQL. Turborepo caches tasks.
- **Conventional Commits**, PR template with a11y/privacy checklist, CODEOWNERS.
- **Deploy:** web on Vercel (or any Node host); API as a container (`apps/api/Dockerfile`) on
  Fly/Render/Railway; managed Postgres (Neon/Supabase/RDS) with `pg_trgm`, `earthdistance`,
  `unaccent`. Migrations run as a release step. Ingest runs as a scheduled job.
- **Observability:** JSON logs with request IDs (propagated web → API), `/health` + `/ready`,
  OpenTelemetry traces, error tracking (Sentry) wired behind env flags. Ingest runs are audited in
  `ingest_run` (counts, durations, errors) and surfaced on a staleness alert.
- **Content QA:** `pnpm content:check-links` verifies every curated URL; runs weekly in CI.

## 14. Roadmap

| Phase | Scope |
|---|---|
| **0 — Foundation** ✅ | Monorepo, tooling, docs, CI |
| **1 — Vertical slice** | domain + db + API + web: search with all filters, detail pages, quizzes → results, profile + CV extraction, pathways, **timeline (stage-based nudges + .ics feed)**, saved items, auth, legal/a11y pages, curated evergreen programmes |
| **2 — Live supply** | Keyed adapters switched on (Find an Apprenticeship, Reed/Adzuna federated, Skills England), scheduled ingest, partner portal, **opt-in e-mail reminders for timeline items** |
| **3 — Intelligence** | pgvector semantic matching, Skills England progression-driven pathways, alerts (e-mail/push), local labour-market stats (Nomis) |
| **4 — Reach** | Welsh/Scottish/NI coverage, Welsh language, adviser mode (print/share results for youth workers), PWA, SMS alerts |

See also: [`SOURCES.md`](./SOURCES.md) (bibliography), [`DATA-SOURCES.md`](./DATA-SOURCES.md),
[`adr/`](./adr).
