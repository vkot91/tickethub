import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
import { z } from 'zod';
import { StorageClient } from './storage.client';

/**
 * Spread into an app's own Zod schema so the env contract lives with the code that reads it:
 * `z.object({ ...storageEnvSchema.shape, S3_BUCKET_TICKETS: z.string() })`.
 *
 * The bucket is deliberately NOT here: one local `.env` serves every service, so a generic
 * `S3_BUCKET` could only ever hold one value. Each app names its own key
 * (`S3_BUCKET_TICKETS`, `S3_BUCKET_POSTERS`) and passes it to `StorageModule.forBucket`.
 */
export const storageEnvSchema = z.object({
  S3_ENDPOINT: z.string(),
  // Optional so a deployment where both are the same public host declares nothing extra; local
  // compose sets it because `minio:9000` is unreachable from the browser.
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

type StorageConfigService = ConfigService<StorageEnv & Record<string, string>, true>;

@Global()
@Module({})
export class StorageModule {
  /** @param bucketEnvKey the app's own env var holding its bucket name. */
  static forBucket(bucketEnvKey: string): DynamicModule {
    return {
      module: StorageModule,
      global: true,
      providers: [
        {
          provide: StorageClient,
          inject: [ConfigService],
          useFactory: (config: StorageConfigService) => {
            const get = (key: string) => config.get(key, { infer: true }) as string | undefined;

            return new StorageClient({
              endpoint: get('S3_ENDPOINT')!,
              publicEndpoint: get('S3_PUBLIC_ENDPOINT'),
              accessKey: get('S3_ACCESS_KEY')!,
              secretKey: get('S3_SECRET_KEY')!,
              bucket: get(bucketEnvKey)!,
            });
          },
        },
      ],
      exports: [StorageClient],
    };
  }
}
