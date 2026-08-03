import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type NextConfig } from 'next';

import { loadEnv } from '@tickethub/env';

// Same reasoning as apps/web: bridge the monorepo root .env into process.env before
// compilation and before the server boots. loadEnv never overwrites what is already set.
loadEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@tickethub/contracts', '@tickethub/ui', '@tickethub/web-kit'],
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../..'),
};

export default nextConfig;
