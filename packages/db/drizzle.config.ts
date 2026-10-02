import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54329/postgres',
  },
  // Fail loudly rather than silently dropping columns in a generated migration.
  strict: true,
  verbose: true,
});
