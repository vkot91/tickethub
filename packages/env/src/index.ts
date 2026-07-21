import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Load the nearest `.env` (walking up to the monorepo root) into `process.env`.
 * No-op when none is found — in docker/CI the env is injected directly.
 * Vars already set are never overwritten, so the real environment wins.
 *
 * Zero-dependency by design: this is the single home for env access, shared by the
 * Nest façade (@tickethub/config) and by non-Nest tooling (drizzle-kit, seed, rmq).
 *
 * ponytail: hand-rolled parse instead of native `process.loadEnvFile` — the native one
 * writes to the real process, which jest's sandboxed `process.env` copy never sees, so
 * integration tests silently ran without env. Plain `KEY=VALUE` only; reach for dotenv
 * if the .env ever needs multiline values or interpolation.
 */
export function loadEnv(start = process.cwd()): void {
  for (let dir = start; ; dir = dirname(dir)) {
    const file = join(dir, '.env');

    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) continue;

        const separator = trimmed.indexOf('=');

        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();

        if (key in process.env) continue;

        process.env[key] = value.replace(/^(['"])(.*)\1$/, '$2');
      }
      return;
    }

    if (dirname(dir) === dir) return; // reached filesystem root
  }
}

/** Read a required env var, throwing a clear error if unset. No silent defaults. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * Repoint DATABASE_URL at the throwaway integration-test database (TEST_DATABASE_URL).
 *
 * Integration suites TRUNCATE and re-seed whatever DATABASE_URL points at, so they must
 * never see the dev database. Called from the jest integration setup and from
 * `drizzle.test.config.ts`, so both the tests and their migrations target the same throwaway.
 */
export function useTestDatabase(start = process.cwd()): void {
  loadEnv(start);

  process.env.DATABASE_URL = requireEnv('TEST_DATABASE_URL');
}
