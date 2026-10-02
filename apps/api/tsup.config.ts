import { defineConfig } from 'tsup';

/**
 * One self-contained Node bundle. The workspace packages ship TypeScript source, so they are
 * bundled in (`noExternal`); real npm dependencies stay external and come from node_modules.
 * PGlite is dev/test-only and never reaches the API bundle.
 */
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@unneet\//],
  // The migration SQL is read from disk at start-up, so it ships beside the bundle (see Dockerfile).
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
