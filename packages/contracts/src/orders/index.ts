import { z } from 'zod';

const uuid = z.string().uuid();

export const createOrderSchema = z.object({
  showId: uuid,
  seats: z
    .array(z.object({ seatId: uuid, ticketTypeId: uuid }))
    .min(1)
    .max(10),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const orderResponseSchema = z.object({
  id: uuid,
  status: z.enum(['awaiting_payment', 'paid', 'expired', 'cancelled', 'refunded']),
  totalCents: z.number().int(),
  currency: z.string(),
  expiresAt: z.string(),
  seats: z.array(z.object({ seatId: uuid, ticketTypeId: uuid })),
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

const base = z.object({ messageId: uuid });
export const orderAwaitingPaymentSchema = base.extend({
  orderId: uuid,
  userId: uuid,
  showId: uuid,
  totalCents: z.number().int(),
});
export const orderPaidSchema = base.extend({ orderId: uuid, userId: uuid, showId: uuid });
export const orderExpiredSchema = base.extend({ orderId: uuid, showId: uuid });
export const seatHeldSchema = base.extend({ orderId: uuid, showId: uuid, seatId: uuid });
export const seatReleasedSchema = base.extend({ orderId: uuid, showId: uuid, seatId: uuid });

export type OrderAwaitingPaymentEvent = z.infer<typeof orderAwaitingPaymentSchema>;
export type OrderPaidEvent = z.infer<typeof orderPaidSchema>;
export type OrderExpiredEvent = z.infer<typeof orderExpiredSchema>;
export type SeatHeldEvent = z.infer<typeof seatHeldSchema>;
export type SeatReleasedEvent = z.infer<typeof seatReleasedSchema>;

// paymentIntentId optional: REST-driven refunds omit it (Payments resolves it from its own row);
// the expire-then-pay race carries it straight from the payment.succeeded event.
export const refundRequestedSchema = base.extend({
  orderId: uuid,
  paymentIntentId: z.string().optional(),
});
export type RefundRequestedEvent = z.infer<typeof refundRequestedSchema>;
