import { createTestDb, resetDb, type TestDb } from './db';

// One emulated Postgres per test file, created lazily on first use. Booting pglite
// (~330ms WASM instantiation) dwarfs everything else and does not amortize across
// instances, so we boot once per file and TRUNCATE between tests (see jest-setup).
// Suites that never call getTestDb() never boot pglite at all.
let db: TestDb | undefined;

export async function getTestDb(): Promise<TestDb> {
  if (!db) db = await createTestDb();
  return db;
}

export async function resetCurrentDb(): Promise<void> {
  if (db) await resetDb(db);
}

export async function closeCurrentDb(): Promise<void> {
  if (db) {
    await db.$close();
    db = undefined;
  }
}
