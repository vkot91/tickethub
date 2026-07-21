import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as path from 'node:path';
import * as schema from '../schema';
import type { Db } from '../client';

// Service schemas to wipe between tests. Add new pgSchema names here as services grow.
const APP_SCHEMAS = ['auth', 'shows', 'orders', 'payments'];

// The generated drizzle migrations live at packages/db/drizzle. Under ts-jest,
// __dirname resolves to src/testing, so the folder is two levels up.
const MIGRATIONS = path.join(__dirname, '../../drizzle');

export type TestDb = Db & { $close: () => Promise<void> };

// Fresh in-memory Postgres (WASM) with the real schema applied. Same shape as the
// production `Db`, so services run against actual SQL — no chain stubs. Call
// `$close()` when done (afterEach) to free the instance.
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();

  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: MIGRATIONS });

  return Object.assign(db, { $close: () => client.close() }) as unknown as TestDb;
}

// Empty every table in the app schemas — fast reset that keeps the booted pglite
// instance alive (TRUNCATE is ~ms vs ~330ms to reboot). CASCADE clears FK-linked
// rows; RESTART IDENTITY resets sequences.
export async function resetDb(db: TestDb): Promise<void> {
  const result = (await db.execute(sql`
    select table_schema, table_name from information_schema.tables
    where table_schema in ${sql.raw(`(${APP_SCHEMAS.map((s) => `'${s}'`).join(', ')})`)}
      and table_type = 'BASE TABLE'
  `)) as unknown as { rows: { table_schema: string; table_name: string }[] };

  const tables = result.rows;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"${t.table_schema}"."${t.table_name}"`).join(', ');

  await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
}
