import { z } from 'zod';

// What Payments publishes. Audience-free — every consumer is another service.
// Payloads carry domain fields only; `messageId` is stamped by the transport and reaches consumers
// as `EventEnvelope<K>`. See `../registry`.

const base = z.object({ orderId: z.string().uuid() });

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

export const PAYMENT_ROUTING_KEYS = {
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_SUCCEEDED: 'refund.succeeded',
} as const;

export interface PaymentsEventContracts {
  [PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED]: PaymentSucceededEvent;
  [PAYMENT_ROUTING_KEYS.PAYMENT_FAILED]: PaymentFailedEvent;
  [PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED]: RefundSucceededEvent;
}
