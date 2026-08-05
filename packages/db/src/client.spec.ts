import { createDb, createQueryLogger, prettyQuery } from './client';

describe('createDb', () => {
  // postgres-js connects lazily, so building the client makes no network call.
  it('builds a drizzle client exposing the query API', () => {
    const db = createDb('postgres://user@localhost:5432/tickethub');
    expect(typeof db.select).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(db.query).toBeDefined();
  });
});

// eslint-disable-next-line no-control-regex -- stripping the ANSI color codes styleText adds
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('prettyQuery', () => {
  it('inlines params and puts each clause on its own line', () => {
    const query = 'select "u"."id" from "auth"."users" where "u"."email" = $1';

    expect(stripAnsi(prettyQuery(query, ['a@b.com']))).toBe(
      "\n  select u.id\n  from auth.users\n  where u.email = 'a@b.com'",
    );
  });

  it('leaves a placeholder untouched when the param is undefined', () => {
    expect(stripAnsi(prettyQuery('select $1', []))).toBe('\n  select $1');
  });
});

describe('createQueryLogger', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  afterEach(() => logSpy.mockClear());

  it('is disabled unless DB_LOG is 1 or all', () => {
    expect(createQueryLogger(undefined)).toBeUndefined();
    expect(createQueryLogger('0')).toBeUndefined();
  });

  it('logs a query when enabled', () => {
    createQueryLogger('1')?.logQuery('select 1', []);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('skips outbox/processed_messages polling noise unless DB_LOG=all', () => {
    createQueryLogger('1')?.logQuery('select * from "tickets"."outbox"', []);

    expect(logSpy).not.toHaveBeenCalled();

    createQueryLogger('all')?.logQuery('select * from "tickets"."outbox"', []);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
