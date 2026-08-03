import { defineConfig } from 'drizzle-kit';

import { requireDatabaseUrl } from './src/env';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: requireDatabaseUrl() },
});
