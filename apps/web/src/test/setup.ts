import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Component tests opt in to jsdom with `// @vitest-environment jsdom`; cleanup is a no-op elsewhere.
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});
