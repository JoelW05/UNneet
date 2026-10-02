# UnNEET — HANDOFF (read this first when resuming)

## LATEST STATE (end of session 3, 2026-10-01 night). This section supersedes anything below that disagrees.

**Catalogue now ~14.2k open listings** (Teaching Vacancies 5.5k, FAA apprenticeships 3,387 incl. 19 NHS + 10 Civil Service, GIAS 3.1k, ATS boards 1.9k, curated 47). All 7 providers re-ingested with **0 rejections**.

**Keys** are in `.env` (git-ignored; never paste values into chat/commits): `FAA_API_KEY` (works), `REED_API_KEY` (works, live search only), `ADZUNA_APP_KEY` set but **`ADZUNA_APP_ID` (8 chars) is still missing** (user must copy it from developer.adzuna.com; Adzuna terms = 14-day trial, ongoing use needs written consent). See `docs/API-KEYS.md`.

**Done this session**
- `adapters/find-an-apprenticeship.ts` rewritten against the REAL v2 schema (OpenAPI at `developer.apprenticeships.education.gov.uk/Documentation/display-advert-api-v2/description`). Header `AdditionalDataSources: Nhs,Csj` (a HEADER, not a query param) adds NHS/Civil Service adverts. Fixture `test/fixtures/faa-vacancies.json` = 16 real vacancies; `test/faa.test.ts` 47 tests.
- Shared `src/lib/plain.ts` (`rich`, `clean`, `townCase`); domain `htmlToText` keeps lists tight, more entities, `decodeEntities` exported.
- **"No experience needed" bug fixed at the root**: new domain `requirements/extract.ts` (`extractRequirements`, `titleSeniority`, `saysNoQualifications`) + `schemas/requirements.ts`. Senior titles (head/deputy/2iC/manager/senior…) => experience required; only EXPLICIT "no experience needed" earns the `no-experience` tag; "full training provided" no longer counts; ATS rule no longer treats Junior/Associate as no-experience. `normalise()` now returns `requirements` and sets experienceRequired/minEntryLevel/minAge/tags.
- DB: column `opportunities.requirements jsonb` (migration `0002_requirements.sql`, applied to dev DB); card schema has `requirements`; openapi + api-client regenerated.
- **Traffic-light fit**: domain `fit/assess.ts` (`assessFit`, `FIT_LABEL`; hard checks level/experience/age/licence decide red/amber, skills soft). Web: `features/fit/fit-ui.tsx` (`FitChip`, `FitPanel`, `useFit`), `components/opportunities/requirements.tsx` (`RequirementsDropdown` on every card, `RequirementsBody` open on the detail page). Reads the local profile; links to `/cv` and `/profile` which DO NOT EXIST YET.
- Tests last run: domain 261, ingest 190 (+ new), db 36, api 101, web 36. Web typecheck passed.

**IN PROGRESS (uncommitted, mid-edit): Course Directory adapter** `adapters/course-directory.ts` (registered in `registry.ts`, exported from `index.ts`). Source = National Careers Service course directory, OGL v3, monthly CSV (~100 MB, 110k rows, 2,307 providers) found via `https://www.gov.uk/api/content/government/publications/national-careers-service-course-directory`. Keeps only flexible/upcoming starts (~48k rows → ~40k listings after one-per-course-venue dedupe); falls back to `nationalcareers.service.gov.uk/find-a-course/course-details?courseId=…&r=…` (verified 200) when no course URL. Fixture `test/fixtures/course-directory.json` (12 real rows + 1 later-run copy) exists; **`test/course-directory.test.ts` NOT written yet**; adapter NOT yet run against the DB. Throwaway scripts to delete: `packages/ingest/scripts/_cd-peek.ts`, `_pick-cd-fixture.ts`, `_show-cd.ts`. Big scratch files are in the session scratchpad only.
  Known extractor/adapter fixes still to make (found by reading real rows):
  1. `extractor`: ignore the adapter's own "Key details:" section (its "Type: Essential skills" line was read as a skill).
  2. "Entry Level 3 ESOL" must be level 0, not 3; `levelOfLine`.
  3. Exclusion criteria are not requirements ("don't have a GCSE grade 4", Multiply) — skip qualification lines with "do not/don't have/hold".
  4. A-level course text "entry requirements for A Level are 5 GCSEs…" yields level 3; the required level is the GCSEs (2).
  5. `saysNoQualifications` must be false when the same sentence continues "but/however/providers set their own" (T Levels).
  6. Take course level from the URL slug ("…btec-level-3…") when the title has none; treat T Level as `funded` (free 16–19).
  Then: write the adapter tests, `pnpm check`, run `pnpm ingest -- --provider course-directory --dry-run --limit 50`, then the real run (stop the API first, see gotcha).

**Gotchas learned**
- The dev DB (PGlite via `pnpm db:dev`) serves ONE client well: running probe scripts while the API is up wedged it (ECONNRESET, API 500s). Stop the API (and kill the leftover node on :4000) before `pnpm ingest`/`db:*`; if wedged, kill the PGlite process, copy `.data/pg`, restart `pnpm db:dev`. A backup `.data/pg-backup-2026-10-01` exists (delete when happy).
- Never build code with `node -e` escapes; use Write/Edit (or a quoted heredoc).
- `pnpm check` = lint + typecheck + tests (all were green before the course-directory work).

**Next, in order:** finish Course Directory (above) → `/profile` + `/cv` pages and guidance module (the user's earlier ask; the fit panel already links to them) → Discover Uni degrees (HESA zip at hesa.ac.uk/kisdata blocks bots: needs a manual download by the user; weekly OGL data) → T Level courses list → OpenLearn free courses (RSS only; low priority) → quiz/results/pathways/timeline/saved/sign-in/account/support/legal pages → web tests for new components, Playwright+axe, CI, Docker, docs. Courses will outnumber jobs ~2:1 once ingested: revisit default search ranking/diversity. **No git commits exist yet** (see below).

Last updated: 2026-10-01 (late), after the user answered the three open questions.
Project: UK anti-NEET opportunity finder. Original brief + quality bar is in memory (`neet-platform-project`).
Name **UnNEET is confirmed** by the user (still one constant). **Git repo initialised** on branch `main` (user said "do git init"); **no commits yet**: the user has not asked for one, and git `user.name`/`user.email` are not configured on this machine, so ask before the first commit. `.gitignore` already excludes `.env`, `.data/`, logs, builds.
**API keys:** none exist on this machine (checked env vars, `grad-job-finder/config.json`, all empty). The user said to find them myself, but registering needs an account, which I cannot create: the user must register. Researched list with links, terms and caveats is in **`docs/API-KEYS.md`**; template in **`.env.example`**. `pnpm ingest` and `pnpm --filter @unneet/api dev` now read `../../.env` via Node's `--env-file-if-exists`. Order of value: Find an apprenticeship (free, instant) > Reed (free) > Adzuna (free, but a 14-day-trial clause means ongoing use needs Adzuna's written consent).
**Checks are green** (2026-10-01): `pnpm check` = Biome (now parses Tailwind via `css.parser.tailwindDirectives`), 7/7 typechecks, all tests (api 101, domain 176, ingest 146, db 36, web 36, content 24, api-client 2). Web had never been linted/typechecked before this: fixed formatting, `role="search"` to native `<search>`, a widened literal in `skills-picker.tsx`, a stale `Profile` fixture in db tests. `apps/api` and `packages/db` got a `vitest.config.ts` with longer timeouts (one suite failed once under full-monorepo load; re-runs passed).

## The user's latest directives (in order)
1. Make the opportunity database **as big as possible**, but only REAL data (never pad with fake listings; respect licences/ToS).
2. "Fully flesh out the website, as far as you possibly can."
3. **Each person gets a profile where they input what they have done (education, experience), plus a CV screener that reviews their CV and guides them.** (Domain logic done; API + UI not built yet. See "Next steps".)

## Verified state (418+ tests green at last full run; lint + typecheck clean then)
| Package | State |
|---|---|
| `packages/domain` | 176 tests. Taxonomy, schemas, matching engine, timeline engine, CV extraction. **New this session:** `schemas/history.ts` (EducationEntry/ExperienceEntry, levels, spans, gaps), `Profile` now has `education`, `experience`, `achievements`, `drivingLicence`, plus `effectiveProfile(profile, now)`; `cv/history.ts` (`extractHistory`), `cv/review.ts` (`reviewCv`), `cv/fit.ts` (`compareToJob`, `requiredLevelOf`), `lib/places.ts` (`rankPlaces`); `formatPay` now says "Up to"/"From" for one-sided pay. **`cv/*` is NOT yet exported from `src/index.ts`** (only `schemas/history` is). |
| `packages/content` | 24 tests, unchanged. |
| `packages/db` | 36 tests. Added `catalogueStats` + `pnpm db:stats`. |
| `packages/ingest` | 146 tests. Adapters: curated, **teaching-vacancies** (OGL, ~5.7k), **gias** (OGL, 3.1k colleges/sixth forms/universities, England only), **employer-greenhouse/lever/ashby** (109 verified UK employers, ~1.96k jobs; registry generated by `pnpm --filter @unneet/ingest ats:discover` into `src/adapters/ats/employers.ts`), find-an-apprenticeship (EXPERIMENTAL, needs key), sample (labelled demo). Geocoder (postcodes.io bulk), OSGB36→WGS84, CSV parser, `getText/postJson` on Http. CLI now strips pnpm's `--`. |
| `apps/api` | 101 tests. Hono + OpenAPI, all routes (health, taxonomy, stats(+`sampleData`), opportunities(+external,similar,reports), locations, quizzes, pathways, timeline(+.ics), match, profile/extract, skills/suggest, auth/otp, /api/auth/*, me/*, partner feed, internal ingest). Fixes made via tests: login-CSRF closed on `/api/auth/*`, session cookieCache disabled (deleted accounts stop working immediately), error responses now carry CORS/rate-limit headers. `openapi.json` generated (30 paths). **`/v1/profile/extract` has not been updated for the new history fields; `/v1/match` does not yet call `effectiveProfile`.** |
| `packages/api-client` | 2 tests. openapi-typescript + openapi-fetch; `pnpm openapi` regenerates spec + types. |
| `apps/web` | Next 16.3.8 / React 19.3 / Tailwind 4.3. Built: design tokens (WCAG-tested palette, 13 tests), strict nonce CSP in `src/proxy.ts`, server DAL (`src/server/{api,data}.ts`), local stores (profile, saved) + `ClientSync`, UI primitives (`components/ui/*`), header/footer/nav/theme toggle/sample banner, **pages: home, search (URL-driven filters, facets, pagination, external boards streaming), opportunity detail (JSON-LD, report/share/save), not-found, error**; feature components written but NOT yet wired to pages: `features/quiz/{interests-quiz,values-quiz,skills-picker}.tsx`, `features/timeline/*`. |

Dev DB (`pnpm db:dev`, data in `.data/pg`) holds **10,832 open listings** (10,275 findable by distance). Run `pnpm db:stats`.

## NOT built yet (next steps, in order)
1. **Profile + CV screener (user's newest ask)**
   - `packages/domain/src/guidance/guidance.ts`: `buildGuidance(profile, {pathways, now})` → headline, strengths, sectorIdeas (interest + experience/education/skills via `classifySector`), transferable-skills rules, level plan (next level + search links), pathways, prioritised nextSteps, gaps. Export `cv/*` and `guidance/*` from `src/index.ts`; add tests.
   - API: `POST /v1/cv/review` (file or text, optional `jobText`; returns extraction + `history` + `review` + optional `jobFit`; refactor shared CV input reading out of `routes/profile.ts`), `POST /v1/guidance` (profile → guidance); call `effectiveProfile` in `/v1/match`; tests; regenerate openapi + client.
   - Web: `/profile` (sections: about you, education, experience, skills, achievements, preferences, your data; add/edit/remove with accessible dialogs; auto-save to the local store), `/cv` screener (upload/paste + optional job advert → CV check, job fit, "tick what to add to my profile" import, guidance), results page showing reasons + guidance.
2. Wire the quiz pages (`/quiz`, `/quiz/interests|values|skills`; `components/layout/page-header.tsx` and `features/quiz/quiz-hub.tsx` still need creating — those writes were interrupted).
3. Other pages: `/results`, `/pathways(+[slug])`, `/timeline` (stage picker, buckets, mark done, .ics, September "has your year changed?"), `/saved`, `/sign-in` (OTP + 16+ confirmation, `authClient`), `/account` (export/delete), `/support` (hard-code only Samaritans 116 123 + Shout 85258; everything else from API listings), `/about`, `/about/credits`, `/privacy`, `/accessibility`, `/cookies`, `/terms`, `/for-providers`; `sitemap.ts` (needs an API slug listing), OG images.
4. Tests/CI/docs: web unit tests for new components, Playwright E2E + `@axe-core/playwright` (use `channel: 'chrome'` locally), CI workflow (lint, typecheck, test, build, openapi drift, audit), CodeQL/Dependabot, `Dockerfile`s, `docker-compose.yml`, `.env.example`, `SECURITY.md`, `ACCESSIBILITY.md`, `PRIVACY.md`, `DATA-MODEL.md`, `RUNBOOK.md`; fix doc inaccuracies in `docs/DATA-SOURCES.md` (Teaching Vacancies DOES have a public OGL feed; ESCO import and `esco:enrich` not built; add GIAS/ATS/NHS notes) and `docs/ARCHITECTURE.md`.
5. Data growth blocked on the USER: Find an apprenticeship key (DfE developer portal), NHS Jobs External Job Board API (needs NHSBSA approval + NDA; the public `search_xml` feed is documented for employers' own vacancies, so it is NOT used), Reed/Adzuna keys (+ Adzuna licence), HESA Discover Uni (site blocks bots: manual download). Remotive rejected (ToS). Extend `scripts/ats-candidates.ts` and re-run `ats:discover` for more employer boards.

## Questions still open for the user
1. ~~Name~~ answered: UnNEET. 2. ~~Keys~~ answered: see `docs/API-KEYS.md`; the user has to register (no accounts by me). 3. ~~git init~~ done; still ask before the **first commit** and about git identity.

## Commands (repo root `C:\Users\joelw\unneet`, pnpm 12, Node 24)
```
pnpm install
pnpm lint:fix            # Biome (a11y preset = recommended; tests may use `any` via an override)
pnpm typecheck && pnpm test
pnpm db:dev              # PGlite on 127.0.0.1:54329 (+ migrations)   [may still be running]
pnpm db:stats
pnpm ingest -- --provider gias --dry-run --limit 20     # providers: curated, gias, teaching-vacancies, employer-greenhouse|lever|ashby
pnpm --filter @unneet/api dev     # http://localhost:4000 (docs at /docs)   [may still be running]
pnpm --filter @unneet/web dev     # http://localhost:3000                    [may still be running]
pnpm openapi             # regenerate apps/api/openapi.json + packages/api-client types
```
Browser pane: servers were started with Bash in the background and opened with `preview_start {url}`. The preview tool's named configs come from the USER-level `C:\Users\joelw\.claude\launch.json` (another project) — do not edit it.

## Gotchas (save time)
- **Backslashes in shell/`node -e`/heredoc-built code collapse** (`\\b` becomes a literal backspace character in the file). Build regexes ONLY with the Write/Edit tools; check with `grep -rlP "\x08"` (last scan was clean).
- Python is not available in the shell; use node scripts or the Write/Edit tools. Windows: tmp paths differ between bash and node (use the scratchpad dir).
- Hono sub-router middleware on `*` leaks to the whole app once mounted — scope to the path.
- zod-openapi runs every declared request-body validator on every request: make multipart/json fields optional and enforce in the handler (see `routes/profile.ts`).
- Next 16: `proxy.ts`, async `params/searchParams/headers/cookies`, nonce CSP forces dynamic rendering, read `apps/web/node_modules/next/dist/docs/` before Next work (see `apps/web/AGENTS.md`).
- Only real data in the catalogue; sample data is labelled and dev-only; never present guesses as facts (honest copy in CV review/guidance: draft, hedged, encouraging).
- pnpm 12: `minimumReleaseAge` gating and `allowBuilds` in `pnpm-workspace.yaml`; leave them. Catalog now also holds the web stack.
