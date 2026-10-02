# Data sources registry

How each source is integrated, what it costs, what we may do with the data, and what you need to do
to switch it on. **No source is scraped.** All listings link back to the original.

Legend — *Policy*: `store` (ingest + persist), `cache` (request-time + short TTL), `live` (never persisted).

| Source | Provides | Policy | Key needed? | Licence / terms to honour | Status |
|---|---|---|---|---|---|
| **Curated programmes** (`packages/content`) | Evergreen national schemes, free learning, support services | store | No | Our own editorial; every URL link-checked weekly | ✅ built |
| **Find an Apprenticeship** (DfE) | Live apprenticeship vacancies | store | Yes — free self-serve at https://developer.apprenticeships.education.gov.uk | OGL v3 (page); send `Ocp-Apim-Subscription-Key` + `X-Version: 2`; 150 req / 5 min | ⏳ adapter written, needs key |
| **Skills England Occupational Maps** | Routes, occupations, progression, T Level links | store | Yes — form: https://www.cognitoforms.com/InstituteForApprenticeships1/RequestingAnAPIKey | OGL v3; show Skills England logo + "© Skills England 2025. Licensed under the Open Government Licence v3.0." | ⏳ adapter planned (phase 2) |
| **ESCO** (EU) | Skills & occupations taxonomy (multilingual) | store (taxonomy only) | No | EC reuse policy — attribute ESCO | ✅ import script |
| **postcodes.io** | Postcode/outcode → lat/lon, region, district | live | No | Open data (ONS/OS/Royal Mail derived) | ✅ |
| **Nomis** (ONS) | Local labour-market stats | cache | No | OGL | ⏳ phase 3 |
| **Reed** | Jobs | cache (federated) | Yes — https://www.reed.co.uk/developers/jobseeker (basic auth, key as username) | Terms not published in docs — confirm before launch; link out via `jobUrl` | ⏳ adapter written, needs key |
| **Adzuna** | Jobs + salary estimates | cache (federated) | Yes — https://developer.adzuna.com | **Licence required for commercial use**; no aggregation without authorisation; "Jobs by Adzuna" badge (≥116×23px); limits 25/min, 250/day, 1000/wk, 2500/mo | ⏳ adapter written, needs key + licence |
| **National Careers Service API** | Job profiles (~800), course directory | store | Yes — https://portal.api.nationalcareers.service.gov.uk | Check portal terms on sign-up | ⏳ planned (phase 2) |
| **Partner feeds** (JSON/CSV/`schema.org JobPosting`) | Employer & provider listings | store | Per-partner API key we issue | Partner agreement | ✅ endpoint + importer |
| **DWP Find a Job** | — | — | — | Only a bulk *upload* spec for employers; **no public read API** | ❌ link out only |
| **Teaching Vacancies** | — | — | — | API is for ATS partners by arrangement (TeachingVacancies.ATS@education.gov.uk) | ❌ not available |

## Switching sources on

Copy `.env.example` → `.env` and fill the relevant `*_API_KEY`. Then:

```bash
pnpm ingest -- --provider find-an-apprenticeship   # one provider
pnpm ingest                                         # every provider that has credentials
```

Providers without credentials are skipped with a clear log line — they never fail the run.

## Ingest guarantees

- **Idempotent upserts** keyed by `(provider, externalId)`; content-hash skips unchanged rows.
- **Soft expiry:** rows not seen for N runs or past `closingDate` are marked `expired`, never hard-deleted
  until retention passes (so saved items degrade gracefully).
- **Normalisation** maps provider vocabularies → our taxonomy (type, sector/route, level, work mode, pay
  unit → annual FTE) with unit tests per adapter against recorded fixtures.
- **Run audit** in `ingest_run`: counts (seen/created/updated/expired/rejected), duration, errors.
- **Politeness:** per-provider concurrency & rate limit config; exponential backoff on 429/5xx;
  `User-Agent: UnNEET/<version> (+contact)`.
