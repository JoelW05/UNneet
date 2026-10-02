# ADR-0005: Privacy by design — anonymous-first, stateless matching, CV never stored

- Status: accepted · Date: 2026-10-01

## Context
Users include 16–17-year-olds (children under UK GDPR/ICO Children's Code) and vulnerable adults.
ICO guidance: profiling that suggests content must be justified, off-by-default where not core, and
never used for advertising ([ICO](https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/age-appropriate-design/profiling)).
OWASP: validate uploads by magic bytes, cap size, rename, don't trust extensions
([cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet)).

## Decision
1. Everything useful works **without an account**; guest profile is local to the browser.
2. `POST /v1/match` and `POST /v1/profile/extract` are **stateless**; bodies are never logged (pino
   redaction) and never persisted.
3. CV files are parsed **in memory** and discarded; only user-reviewed structured data is saved, and only
   if they sign in and press Save.
4. Location stored as **outcode** only. No precise geolocation persisted.
5. No third-party analytics/ads/trackers. If analytics are enabled they must be cookieless and aggregate.
6. Export + erase endpoints ship in v1. DPIA maintained in `docs/PRIVACY.md`.
7. No CV text is sent to external AI services in v1. If added later it requires a new ADR, DPIA update,
   explicit opt-in, and a UK/EU-processing, zero-retention provider.

## Consequences
+ Strong compliance posture, small breach blast-radius, simple cookie story (no banner).
− No server-side behavioural analytics to tune matching; use opt-in feedback ("Was this helpful?")
  and synthetic evaluation sets instead.
