import 'server-only';

import { z } from 'zod';

/** Server-only env — never bundled into the browser (`server-only` enforces it). Populated
 *  from the monorepo root .env by next.config.ts (`loadEnv`). Validated on first read, not at
 *  import time, so `next build` does not need a populated environment. Public, browser-safe
 *  vars live in `env.client.ts` instead. */
export const schema = z.object({
  GATEWAY_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function serverEnv(): Env {
  cached ??= schema.parse(process.env);

  return cached;
}
