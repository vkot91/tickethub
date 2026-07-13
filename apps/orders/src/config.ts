import { z } from 'zod';

export const schema = z.object({
  DATABASE_URL: z.string(),
  RABBITMQ_URL: z.string(),
  REDIS_URL: z.string(),
  RESERVATION_TTL_SEC: z.coerce.number().default(600),
});

export type Config = z.infer<typeof schema>;
