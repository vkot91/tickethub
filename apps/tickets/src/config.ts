import { z } from 'zod';

import { mailerEnvSchema } from '@tickethub/mailer';
import { storageEnvSchema } from '@tickethub/storage';

export const schema = z.object({
  // The packages own the env contract for what they read, so a new consumer spreads one shape
  // instead of re-declaring S3_*/SMTP_* and drifting from it.
  ...storageEnvSchema.shape,
  ...mailerEnvSchema.shape,
  // This service's own bucket — the storage package stays bucket-agnostic so a second consumer
  // (show posters) can name its own key in the same .env.
  S3_BUCKET_TICKETS: z.string(),
  DATABASE_URL: z.string(),
  RABBITMQ_URL: z.string(),
  REDIS_URL: z.string(),
  // Signs every QR token — an empty or short key makes forging a ticket trivial, so refuse to
  // boot on anything under a full HMAC-SHA256 block's worth of entropy.
  TICKET_QR_SECRET: z.string().min(32),
  NODE_ENV: z.string().default('development'),
});
export type Config = z.infer<typeof schema>;
