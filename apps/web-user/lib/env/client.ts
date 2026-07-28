import { z } from 'zod';

/** Public env, safe for the browser. Next inlines `process.env.NEXT_PUBLIC_*` at build time by
 *  statically replacing each full literal reference — so every var must be spelled out below,
 *  never read through a variable. The values come from the monorepo root .env, which
 *  next.config.ts (`loadEnv`) loads before compilation. Validated on first read. */
export const schema = z.object({
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
});

export type ClientEnv = z.infer<typeof schema>;

let cached: ClientEnv | undefined;

export function clientEnv(): ClientEnv {
  cached ??= schema.parse({
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });

  return cached;
}
