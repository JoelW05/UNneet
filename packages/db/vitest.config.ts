import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Suites boot an in-memory Postgres (PGlite) and run migrations in beforeAll. With every
    // package's tests running at once on a cold cache that can pass the 10 s default.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
