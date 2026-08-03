/// <reference types="jest" />
import { closeCurrentDb, resetCurrentDb } from './context';

// Wire via a jest preset's setupFilesAfterEnv (see @tickethub/jest-config/nest-db).
// The db is booted lazily on first getTestDb() — files/tests that never touch it pay
// nothing. Between tests we TRUNCATE (fast) instead of rebooting pglite; the instance
// is closed once the file is done.
afterEach(async () => {
  await resetCurrentDb();
});

afterAll(async () => {
  await closeCurrentDb();
});
