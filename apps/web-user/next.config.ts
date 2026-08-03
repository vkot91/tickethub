import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type NextConfig } from 'next';

import { loadEnv } from '@tickethub/env';

// The monorepo keeps a single root .env, but Next only reads apps/web/.env. Bridge it into
// process.env here — before compilation (so client `NEXT_PUBLIC_*` vars get inlined) and
// before the server boots (so server code reads GATEWAY_URL at request time). loadEnv never
// overwrites vars already set, so a real docker/CI environment still wins.
loadEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship source rather than a build — Next compiles them like app code.
  transpilePackages: ['@tickethub/contracts', '@tickethub/ui', '@tickethub/web-kit'],
  // Pin the monorepo root so file tracing does not guess from a stray lockfile.
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../..'),
};

export default nextConfig;
