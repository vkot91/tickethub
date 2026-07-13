import { createDb } from '../client';
import { requireDatabaseUrl } from '../env';
import { users } from './auth';

describe('db schema (integration)', () => {
  const db = createDb(requireDatabaseUrl());

  it('can insert and read a user in the auth schema', async () => {
    const [u] = await db
      .insert(users)
      .values({ email: `t${Date.now()}@x.com`, passwordHash: 'h' })
      .returning();
    expect(u.id).toMatch(/[0-9a-f-]{36}/);
    expect(u.role).toBe('user');
  });
});
