import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from '@tickethub/env';
import type { ZodType } from 'zod';

//  : env access lives in the zero-dep @tickethub/env; ConfigService is re-exported
// so apps depend only on @tickethub/config for everything config-related.
export { loadEnv, requireEnv } from '@tickethub/env';
export { ConfigService } from '@nestjs/config';

/**
 * Global `ConfigModule` validated by a per-service Zod schema. A parse failure
 * aborts boot (fail-fast). Inject values via `ConfigService<z.infer<typeof schema>, true>`.
 * NB: @nestjs/config v3.3 `forRoot` is async, hence `Promise<DynamicModule>` (valid in `imports`).
 *
 * Two @nestjs/config v3.3 gotchas this guards against:
 *  1. Do NOT set `ignoreEnvFile: true`: on that branch `validate` receives an empty `{}`
 *     (process.env is only spread into the config on the env-file branch), so the schema
 *     would parse nothing regardless of what's in the environment.
 *  2. `forRoot` runs `validate(config)` synchronously at CALL time — and this function is
 *     called during `@Module` decorator evaluation, i.e. when app.module.ts is imported,
 *     which (via ES import hoisting) happens BEFORE main.ts's `bootstrap()` runs. So we call
 *     `loadEnv()` here to guarantee `process.env` is populated before validation. `loadEnv`
 *     is idempotent (native `process.loadEnvFile` never overwrites already-set vars).
 */
export function configModuleFor<S extends ZodType>(schema: S): Promise<DynamicModule> {
  loadEnv();
  return ConfigModule.forRoot({
    isGlobal: true,
    validate: (env) => schema.parse(env),
  });
}
