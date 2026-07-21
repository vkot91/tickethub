import { defineConfig } from 'drizzle-kit';
import { useTestDatabase } from '@tickethub/env';
import { requireDatabaseUrl } from './src/env';

// Same migrations, aimed at the throwaway integration database (`pnpm db:migrate:test`).
// Must run before requireDatabaseUrl() below — hence the statement, not an import side effect.
useTestDatabase();

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: requireDatabaseUrl() },
});
