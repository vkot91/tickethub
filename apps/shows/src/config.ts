import { z } from 'zod';
import { storageEnvSchema } from '@tickethub/storage';

export const schema = z.object({
  DATABASE_URL: z.string(),
  RABBITMQ_URL: z.string(),
  // The storage package owns the env contract for what it reads, so this spreads its shape
  // instead of re-declaring S3_* and drifting from it.
  ...storageEnvSchema.shape,
  // This service's own bucket — public-read, unlike fulfillment's `tickets`.
  S3_BUCKET_POSTERS: z.string(),
});

export type Config = z.infer<typeof schema>;
