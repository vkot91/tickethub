import { z } from 'zod';

export const schema = z.object({
  DATABASE_URL: z.string(),
  RABBITMQ_URL: z.string(),
  REDIS_URL: z.string(),
  S3_ENDPOINT: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_TICKETS: z.string(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int(),
  MAIL_FROM: z.string(),
  // Signs every QR token — an empty or short key makes forging a ticket trivial, so refuse to
  // boot on anything under a full HMAC-SHA256 block's worth of entropy.
  TICKET_QR_SECRET: z.string().min(32),
  NODE_ENV: z.string().default('development'),
});
export type Config = z.infer<typeof schema>;
