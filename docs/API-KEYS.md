# API keys: what we need, where to get it, what it costs

Researched 2026-10-01 from the providers' own pages. Where a page could not be read (several
developer portals are JavaScript-only), the entry says **not verified** rather than guessing.

**Nothing here is required to run the site.** Today the catalogue is built entirely from open data
and employers' own published job boards (Teaching Vacancies, GIAS, 109 Greenhouse/Lever/Ashby
boards). Keys *add* sources. A source with no key is skipped, never faked.

## How to add a key

1. `copy .env.example .env` (the `.env` file is git-ignored).
2. Paste the value after the `=`. No quotes, no spaces.
3. Run it: `pnpm ingest -- --provider find-an-apprenticeship --dry-run --limit 20`
   (`pnpm ingest` and the API dev server read `.env` automatically).

Keep keys out of chat messages, screenshots and commits. If one leaks, regenerate it in the
provider's portal.

## The ones to get, in order of value

### 1. Find an apprenticeship (DfE): `FAA_API_KEY`: highest value
- **What it gives us:** every live apprenticeship vacancy in England, from the official service.
  This is the single biggest gap in the catalogue, and the heart of the site's purpose.
- **Cost / approval:** free, self-serve, no approval step.
- **Register:** <https://developer.apprenticeships.education.gov.uk/third-party-accounts/register>
  (an account here lets you subscribe to the **Display Advert API** and copy a subscription key).
- **Facts from the official hub:** base `https://api.apprenticeships.education.gov.uk`; the key goes in
  the `Ocp-Apim-Subscription-Key` header; send `X-Version: 2` (v1 is unsupported after 1 April 2026);
  limit 150 requests per 5 minutes (HTTP 429 beyond it). Independent developers can use only this API.
- **Our adapter** already uses exactly these values (`packages/ingest/src/adapters/find-an-apprenticeship.ts`)
  and paces itself under the limit. Its *field mapping* is still a best reading of the schema: the first
  real `--dry-run` output is what lets us replace the hand-written fixture and tighten it.
- Note: the older gov.uk guidance page for this was withdrawn in September 2025; the developer hub above
  is the current route.

### 2. Reed: `REED_API_KEY`
- **What it gives us:** live UK job search (federated, never stored: shown as cards that link out to Reed).
- **Cost / approval:** free, self-serve: <https://www.reed.co.uk/developers/jobseeker>
- **Facts:** HTTP basic auth, key as the username and an empty password; 100 results per page; a separate
  details call per job for the full description.
- **Not verified:** Reed's published page states no rate limit, attribution or storage terms. Our adapter
  therefore treats Reed as **cache-only** and always links back to Reed. Read the terms shown at sign-up.
- Reed's developers page also lists **Candidate Search**, **Jobs** and **Courses** APIs. I could not read
  their documentation, so they are not used. The Courses one may be worth a look later.

### 3. Adzuna: `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`: **read the catch first**
- **Register (free):** <https://developer.adzuna.com/> (the portal links to "Register for an API key")
- **Terms** (<https://developer.adzuna.com/docs/terms_of_service>), quoted from the page:
  - Default limits: 25 hits a minute, 250 a day, 1000 a week, **2500 a month**.
  - Use by a "commercial, government or academic organisation" is permitted **"subject to a 14 day trial
    period … strictly for the purpose of validating the general coverage and quality of the data"**, and may
    not be used "to deliver any ongoing work" **without written consent**.
  - Every displayed advert needs a "Jobs by Adzuna" label (logo at least 116 × 23 px) hyperlinked to Adzuna,
    and Adzuna must be credited as the source of vacancy and salary data.
- **What that means for us:** a free key is enough to *evaluate* Adzuna. Running it permanently on a public
  site needs Adzuna's written agreement, which you would request from them. Reed + Find an apprenticeship +
  the employer boards cover most of the same ground, so this one is the **last** to chase.

## Worth having later (not built yet)

| Source | What it adds | Access | Status |
|---|---|---|---|
| **National Careers Service Job Profiles API** | Official "what is this job really like / how do I get in" content for the pathway pages. Open Government Licence v3. Alpha, released 11 May 2026. | Sign up for a key at <https://portal.api.nationalcareers.service.gov.uk> | Sign-up steps and limits **not verified** (portal is JS-only). No adapter yet. |
| **DfE Teacher training courses API** | Teacher-training courses across England (by provider, subject, location). Open Government Licence v3. | Sign in with GOV.UK One Login on the DfE "Find and use an API" site to subscribe: <https://pp-find-and-use-an-api.education.gov.uk/api/teacher-training-courses-api-v1> | Cost and limits **not stated** on the page. No adapter yet. |
| **NHS Jobs** | The NHS is the UK's biggest single employer. | No public feed for third parties. NHSBSA's API is for employers' recruitment systems. Ask NHSBSA directly: nhsbsa.nhsjobs@nhsbsa.nhs.uk, 0300 330 1013. | Needs an NHSBSA conversation (approval/agreement). |
| **Jooble** | Another aggregator. | Request form (name, position, email, website, phone) at <https://jooble.org/api/about>. | Cost, storage and eligibility terms **not stated**. Not recommended until read. |

## Only when you deploy

- **Resend** (`RESEND_API_KEY`): sends the sign-in codes by e-mail. Locally the code prints in the API console, so
  you do not need it until launch. Check Resend's current free allowance when you sign up. I have not verified it.
- `AUTH_SECRET` (32+ random characters), `INTERNAL_TOKEN` (24+), `DATABASE_URL`, `WEB_ORIGIN` are *settings you
  generate yourself*, not keys you fetch. See `.env.example`.

## No key needed (already in use)

Teaching Vacancies feed (OGL), GIAS schools/colleges register (OGL), employer Greenhouse/Lever/Ashby boards
(public postings), postcodes.io (geocoding). **HESA Discover Uni** blocks bots, so it needs a manual download
rather than a key.
