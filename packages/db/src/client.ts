import { styleText } from 'node:util';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const SQL_CLAUSES =
  /\b(select|insert into|update|delete from|from|inner join|left join|where|group by|order by|limit|returning|values|set|for update skip locked|on conflict)\b/gi;

/** Inline the params, drop the quoting and schema prefix, break each clause onto its own line. */
export function prettyQuery(query: string, params: unknown[]): string {
  const inlined = query.replace(/\$(\d+)/g, (placeholder, index: string) => {
    const value = params[Number(index) - 1];

    if (value === undefined) return placeholder;

    return styleText('magenta', typeof value === 'string' ? `'${value}'` : String(value));
  });

  const readable = inlined.replace(/"(\w+)"\."(\w+)"/g, '$1.$2').replace(/"(\w+)"/g, '$1');

  return readable
    .replace(SQL_CLAUSES, (clause) => `\n  ${styleText('cyan', clause.toLowerCase())}`)
    .replace(/ +\n/g, '\n');
}

// ponytail: DB_LOG=1 prints every query + params. Debug switch, not app config — hence
// process.env, not the per-app Zod schema. The poller/consumer plumbing (outbox drain,
// processed_messages dedupe) fires on a timer and would bury real queries, so it is skipped
// unless DB_LOG=all.
export function createQueryLogger(dbLog: string | undefined) {
  if (dbLog !== '1' && dbLog !== 'all') return undefined;

  return {
    logQuery(query: string, params: unknown[]) {
      if (dbLog !== 'all' && /"(outbox|processed_messages)"/.test(query)) return;

      // eslint-disable-next-line no-console -- dev-only query log, replaces drizzle's own
      console.log(styleText('dim', '[sql]') + prettyQuery(query, params));
    },
  };
}

export function createDb(url: string) {
  const client = postgres(url);
  const logger = createQueryLogger(process.env.DB_LOG);

  return drizzle(client, { schema, logger });
}
export type Db = ReturnType<typeof createDb>;
