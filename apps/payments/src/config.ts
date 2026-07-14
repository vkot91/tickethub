import { z } from 'zod';

export const schema = z.object({
  DATABASE_URL: z.string(),
  RABBITMQ_URL: z.string(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  NODE_ENV: z.string().default('development'),
});
export type Config = z.infer<typeof schema>;
