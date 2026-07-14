import { z } from 'zod';

export const PAYMENT_ROUTING_KEYS = {
  paymentSucceeded: 'payment.succeeded',
  paymentFailed: 'payment.failed',
  refundSucceeded: 'refund.succeeded',
} as const;

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

export const refundOrderSchema = z.object({ orderId: uuid });

const base = z.object({ messageId: uuid, orderId: uuid });
export const paymentSucceededSchema = base.extend({
  paymentIntentId: z.string(),
  amountCents: z.number().int(),
});
export const paymentFailedSchema = base.extend({
  paymentIntentId: z.string(),
  reason: z.string().optional(),
});
export const refundSucceededSchema = base.extend({
  paymentIntentId: z.string(),
  amountCents: z.number().int(),
});

export type PaymentSucceededEvent = z.infer<typeof paymentSucceededSchema>;
export type PaymentFailedEvent = z.infer<typeof paymentFailedSchema>;
export type RefundSucceededEvent = z.infer<typeof refundSucceededSchema>;
