import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Load the nearest `.env` (walking up to the monorepo root) into `process.env`.
 * No-op when none is found — in docker/CI the env is injected directly.
 * Native `process.loadEnvFile` does not overwrite vars already set, so real env wins.
 *
 * Zero-dependency by design: this is the single home for env access, shared by the
 * Nest façade (@tickethub/config) and by non-Nest tooling (drizzle-kit, seed, rmq).
 */
export function loadEnv(start = process.cwd()): void {
  for (let dir = start; ; dir = dirname(dir)) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      process.loadEnvFile(file);
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
