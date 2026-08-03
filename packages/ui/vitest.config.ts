import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // The primitives are `cva` variant maps over a Radix component — Radix owns the
      // behaviour and tests it. The gate applies to the logic this package actually owns,
      // which now includes the form layer's error and aria wiring.
      include: [
        'src/lib/cn.ts',
        'src/lib/format.ts',
        'src/composites/nav-tabs.tsx',
        'src/form/**/*.tsx',
        'src/primitives/toaster.tsx',
      ],
      thresholds: { statements: 80, lines: 80, functions: 70, branches: 70 },
    },
  },
});
