import { createDb } from './client';

describe('createDb', () => {
  // postgres-js connects lazily, so building the client makes no network call.
  it('builds a drizzle client exposing the query API', () => {
    const db = createDb('postgres://user@localhost:5432/tickethub');
    expect(typeof db.select).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(db.query).toBeDefined();
  });
});
