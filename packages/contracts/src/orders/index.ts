import { z } from 'zod';

// RMQ routing keys for order/seat domain events (published via the outbox).
export const ORDER_ROUTING_KEYS = {
  orderAwaitingPayment: 'order.awaiting_payment',
  orderPaid: 'order.paid',
  orderExpired: 'order.expired',
  orderCancelled: 'order.cancelled',
  seatHeld: 'seat.held',
  seatReleased: 'seat.released',
  seatConfirmed: 'seat.confirmed',
  refundRequested: 'refund.requested',
} as const;

const uuid = z.string().uuid();

export const createOrderSchema = z.object({
  eventId: uuid,
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
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

const base = z.object({ messageId: uuid });
export const orderAwaitingPaymentSchema = base.extend({
  orderId: uuid,
  userId: uuid,
  eventId: uuid,
  totalCents: z.number().int(),
});
export const orderPaidSchema = base.extend({ orderId: uuid, userId: uuid, eventId: uuid });
export const orderExpiredSchema = base.extend({ orderId: uuid, eventId: uuid });
export const seatHeldSchema = base.extend({ orderId: uuid, eventId: uuid, seatId: uuid });
export const seatReleasedSchema = base.extend({ orderId: uuid, eventId: uuid, seatId: uuid });
export const seatConfirmedSchema = base.extend({ orderId: uuid, eventId: uuid, seatId: uuid });

export type OrderAwaitingPaymentEvent = z.infer<typeof orderAwaitingPaymentSchema>;
export type OrderPaidEvent = z.infer<typeof orderPaidSchema>;
export type OrderExpiredEvent = z.infer<typeof orderExpiredSchema>;
export type SeatHeldEvent = z.infer<typeof seatHeldSchema>;
export type SeatReleasedEvent = z.infer<typeof seatReleasedSchema>;
export type SeatConfirmedEvent = z.infer<typeof seatConfirmedSchema>;

// paymentIntentId optional: REST-driven refunds omit it (Payments resolves it from its own row);
// the expire-then-pay race carries it straight from the payment.succeeded event.
export const refundRequestedSchema = base.extend({
  orderId: uuid,
  paymentIntentId: z.string().optional(),
});
export type RefundRequestedEvent = z.infer<typeof refundRequestedSchema>;
