import postgres from 'postgres';
import { requireDatabaseUrl } from './env';

// ponytail: drops every non-system schema (app schemas + drizzle migration bookkeeping),
// so a new pgSchema() needs no change here. Dev/test only — never point this at prod.
async function reset(): Promise<void> {
  const url = requireDatabaseUrl();

  const sql = postgres(url);

  const schemas = await sql<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('public', 'information_schema')
      AND nspname NOT LIKE 'pg\_%'
  `;

  for (const { nspname } of schemas) {
    await sql`DROP SCHEMA IF EXISTS ${sql(nspname)} CASCADE`;
  }

  await sql.end();

  // eslint-disable-next-line no-console
  console.log(`dropped ${schemas.length} schema(s): ${schemas.map((s) => s.nspname).join(', ')}`);
}

reset().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
