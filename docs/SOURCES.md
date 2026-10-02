# Research sources

Everything below was consulted while designing UnNEET (research dated 1 Oct 2026). Grouped by the
decision it informed. Where a source was only a search-result summary rather than a full read, the
decision that depends on it is marked *(verify)* in the relevant ADR.

## Problem space & policy
- ONS — Young people not in education, employment or training (NEET), UK: August 2026 —
  https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/bulletins/youngpeoplenotineducationemploymentortrainingneet/august2026
- Learning & Work Institute — government announcement on expanding opportunities for young people —
  https://learningandwork.org.uk/responding-to-the-governments-announcement-on-expanding-opportunities-for-young-people/
- FE News — Youth jobs guarantee to launch spring 2026 —
  https://www.fenews.co.uk/fe-voices/youth-jobs-guarantee-to-support-neets-to-launch-in-spring-2026-sector-reaction
- Youth Futures Foundation — Strategy 2025–2028 — https://youthfuturesfoundation.org/strategy-2025-2028/
- Ofcom/ISPreview — UK internet access 2024 (mobile-first behaviour) —
  https://www.ispreview.co.uk/index.php/2025/05/ofcom-find-internet-access-levels-in-the-uk-remain-stable-in-2024.html

## Timeline (cycles & deadlines)
- UCAS — 2027-entry equal consideration deadline (13 Jan 2027, 18:00) — https://www.ucas.com/events/2027-entry-deadline-for-all-undergraduate-courses-except-those-with-a-15-october-deadline-475546
- GOV.UK — Teacher training recruitment cycle dates 2026–27 — https://www.gov.uk/government/publications/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates
- GOV.UK — Apply online for student finance — https://www.gov.uk/apply-online-for-student-finance
- GOV.UK — Know when you can leave school (stay in education/training to 18) — https://www.gov.uk/know-when-you-can-leave-school
- University of York careers — recruitment time frames (grad schemes, internships, placements) — https://www.york.ac.uk/students/work-volunteering-careers/apply-interview/looking-for-work/job-toolkit/time-frames/
- GC Education & Skills — when to apply for a school-leaver apprenticeship — http://www.gceducationandskills.ac.uk/news/when-to-apply-for-a-school-leaver-apprenticeship
- Civil Service Fast Stream — how to apply — https://www.civil-service-careers.gov.uk/fast-stream/fs-how-to-apply
  (2025/26 window was 9 Oct–6 Nov 2025; 2026/27 dates *not yet confirmed* at time of writing → modelled as `academic`, not `fixed`)
- Summer internship & spring week timing (secondary sources, *typical* only) — https://www.intervyo.co.uk/guides/summer-internship-applications

## Frontend
- Next.js 16 release — https://nextjs.org/blog/next-16
- Next.js — How to think about data security — https://nextjs.org/docs/app/guides/data-security
- Next.js — Content Security Policy — https://nextjs.org/docs/app/guides/content-security-policy
- Makerkit — App Router project structure — https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure
- shadcn/ui — Next.js installation — https://ui.shadcn.com/docs/installation/next
- Algolia — search filter UX best practices — https://www.algolia.com/blog/ux/search-filter-ux-best-practices/
- Braille Institute — Atkinson Hyperlegible — https://gdusa.com/news/fresh/braille-institute-launches-typeface-for-low-vision

## Backend & data layer
- Hono vs Fastify vs NestJS — https://encore.dev/articles/nestjs-vs-fastify-vs-hono
- Hono zod-openapi — https://hono.dev/examples/zod-openapi
- Better Auth + Hono — https://www.better-auth.com/docs/integrations/hono
- Auth.js joins Better Auth — https://better-auth.com/blog/authjs-joins-better-auth
- Drizzle vs Prisma 2026 — https://www.bytebase.com/blog/drizzle-vs-prisma
- Drizzle — PostgreSQL full-text search — https://orm.drizzle.team/docs/guides/postgresql-full-text-search
- PGlite socket server — https://pglite.dev/docs/pglite-socket
- PGlite extensions — https://pglite.dev/extensions/
- Hybrid search in PostgreSQL — https://paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual
- Turborepo + pnpm monorepo 2026 — https://www.pkgpulse.com/guides/how-to-set-up-monorepo-turborepo-2026

## UK data sources & licences
- Find an Apprenticeship — Display Advert API — https://beta-find-and-use-an-api.education.gov.uk/api/display-advert-api-2
  and developer portal https://developer.apprenticeships.education.gov.uk
  (key header `Ocp-Apim-Subscription-Key`, `X-Version`, 150 req / 5 min)
- Skills England — Occupational Maps public API — https://occupational-maps.skillsengland.education.gov.uk/public-api/
  (header `X-API-KEY`; OGL v3; logo + "© Skills England 2025. Licensed under the Open Government Licence v3.0.")
- National Careers Service API portal — https://portal.api.nationalcareers.service.gov.uk
- Adzuna API terms — https://developer.adzuna.com/docs/terms_of_service
- Reed Jobseeker API — https://www.reed.co.uk/developers/jobseeker
- ESCO web service API — https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api
- postcodes.io — https://api.postcodes.io/docs/overview
- GOV.UK qualification levels — https://www.gov.uk/what-different-qualification-levels-mean/list-of-qualification-levels
- Nomis (ONS labour market API) — https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.def.sdmx.json

## Assessment science
- O*NET Mini Interest Profiler (CC BY 4.0) — https://www.onetcenter.org/dl_files/Mini-IP.pdf
- Gender stereotypes in automated career recommendations — https://arxiv.org/abs/2106.07112

## Privacy, safety & accessibility
- ICO — Age appropriate design: profiling — https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/age-appropriate-design/profiling
- Children's Code summary — https://www.commodious.co.uk/knowledge-bank/data-protection/childrens-code
- OWASP — File Upload Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet
- Deque — WCAG 2.2 updates — https://dequeuniversity.com/resources/wcag-2.2
- Subito — Playwright + axe in CI — https://dev.to/subito/how-we-automate-accessibility-testing-with-playwright-and-axe-3ok5

## Observability & SEO
- Apitally — logging in Hono — https://apitally.io/blog/hono-logging-guide
- SigNoz — structured logging in Next.js with OpenTelemetry — https://signoz.io/blog/opentelemetry-nextjs-logging
- Google — JobPosting structured data — https://developers.google.com/search/docs/appearance/structured-data/job-posting
