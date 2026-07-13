import { z } from 'zod';

export const schema = z.object({
  RABBITMQ_URL: z.string(),
  REDIS_URL: z.string(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
});

export type Config = z.infer<typeof schema>;
