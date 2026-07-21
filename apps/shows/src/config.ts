import { z } from 'zod';

export const schema = z.object({ DATABASE_URL: z.string(), RABBITMQ_URL: z.string() });

export type Config = z.infer<typeof schema>;
