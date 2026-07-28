import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(root) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['{lib,features,components,app}/**/*.spec.{ts,tsx}', 'middleware.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Framework glue (layouts, route handlers) is excluded; the gate applies to the
      // console's own logic. Shared plumbing gates itself in @tickethub/web-kit.
      include: ['features/**/*.{ts,tsx}', 'middleware.ts'],
      exclude: ['**/*.spec.*', '**/test-*.ts'],
      thresholds: { statements: 80, lines: 80, functions: 70, branches: 70 },
    },
  },
});
