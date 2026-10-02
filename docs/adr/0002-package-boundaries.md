# ADR-0002: Package boundaries and just-in-time internal packages

- Status: accepted · Date: 2026-10-01

## Decision
```
domain  ←  (nothing)                     pure, no I/O
db      ←  domain                        schema + client
content ←  domain                        editorial JSON validated by domain schemas
ingest  ←  domain, db, content
api     ←  domain, db, content, ingest(types only)
api-client ← (generated from api OpenAPI)
web     ←  domain (types/pure helpers), api-client
```
- `web` must never import `db`/`ingest` or read DB/provider secrets. Enforced with Biome
  `noRestrictedImports` overrides and a dependency-cruiser style check in CI.
- Internal packages export TypeScript source (`"exports": {".": "./src/index.ts"}`); Next uses
  `transpilePackages`, the API runs through `tsx` in dev and is bundled by `tsup` for production.
- Versions pinned once via the pnpm **catalog**; internal deps use `workspace:*`.

## Consequences
+ No build step for libraries in dev; fast feedback; one TS version.
+ Dependency direction is acyclic and checkable.
− Every consumer must be able to compile TS (acceptable: all consumers are ours).
