import { useTestDatabase } from '@tickethub/env';

// setupFiles entry for integration runs (see the `test:integration` scripts): point
// DATABASE_URL at the throwaway test database before any spec body executes. The suites
// TRUNCATE and re-seed whatever they connect to, so without this they eat the dev data.
//
// Specs call loadEnv() themselves in beforeAll — that runs later and never overwrites an
// already-set var, so this assignment wins.
useTestDatabase();
