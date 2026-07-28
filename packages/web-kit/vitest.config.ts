import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // `server.ts` and `middleware.ts` are factories over the modules below; they are exercised
      // by each app's own middleware spec, where the cookie names are real.
      include: [
        'src/request.ts',
        'src/client-api.ts',
        'src/route-error.ts',
        'src/jwt.ts',
        'src/refresh.ts',
        'src/query.ts',
      ],
      thresholds: { statements: 80, lines: 80, functions: 70, branches: 70 },
    },
  },
});
