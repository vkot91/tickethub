import { z } from 'zod';

// Payments serves one audience — a buyer paying for their own order — so it has no `user/` or
// `organizer/` folder. Add them the day a second audience appears, not before.

const uuid = z.string().uuid();

export const createPaymentIntentSchema = z.object({ orderId: uuid });
export type CreatePaymentIntentDto = z.infer<typeof createPaymentIntentSchema>;

export const paymentIntentResponseSchema = z.object({
  clientSecret: z.string(),
  paymentIntentId: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
});
export type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;
