import { loadEnv, requireEnv } from '@tickethub/env';

// Uses the shared zero-dep @tickethub/env — safe for drizzle-kit/seed, which run outside Nest

/** Load the repo `.env` (if present) and return DATABASE_URL, throwing if unset. No default. */
export function requireDatabaseUrl(): string {
  loadEnv();
  return requireEnv('DATABASE_URL');
}
