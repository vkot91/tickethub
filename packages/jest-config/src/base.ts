import type { Config } from 'jest';

// Shared Jest base for @tickethub Node/TS packages. ts-jest + Node env.
// Consume via: export { default } from '@tickethub/jest-config/nest'
//
// Coverage counts only "needed" code — glue that CLAUDE.md excepts (bootstrap,
// DI wiring, declarative schema, dev seeds) is stripped out so the threshold
// measures domain logic, not scaffolding.
const config: Config = {
  // `isolatedModules: true` makes ts-jest transpile-only — it skips per-suite type-checking (already
  // covered by `build` + `lint` in the turbo pipeline), which is where ts-jest spends most of its
  // cold-start time. Suites start in well under a second instead of ~3s.
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  clearMocks: true,
  // `*.integration.spec.ts` need real infra (Postgres/Redis) — run them via the
  // `test:integration` script, not the default unit run that gates coverage.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/main.ts', // app bootstrap — needs real infra, not unit-testable
    '!src/**/*.module.ts', // Nest DI wiring — declarative
    '!src/**/decorators/**', // Nest param/metadata decorators — declarative wiring
    '!src/**/schema/**', // Drizzle table defs — declarative
    '!src/**/seed/**', // dev-only seed scripts
    '!src/**/reset.ts', // dev-only db reset script — needs real Postgres, not unit-testable
    '!src/**/testing/**', // shared test helpers (fixtures, in-memory db)
    // NB: index.ts kept in — some packages (env, config) put real code there;
    // pure barrels self-cover once imported, so they don't drag the numbers.
  ],
  coverageThreshold: {
    global: { statements: 80, lines: 80, functions: 80, branches: 70 },
  },
};

export default config;
