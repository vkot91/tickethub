import { requireDatabaseUrl } from './env';

describe('requireDatabaseUrl', () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it('returns DATABASE_URL when set', () => {
    process.env.DATABASE_URL = 'postgres://u@localhost/db';
    expect(requireDatabaseUrl()).toBe('postgres://u@localhost/db');
  });

  it('throws when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL;
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL/);
  });
});
