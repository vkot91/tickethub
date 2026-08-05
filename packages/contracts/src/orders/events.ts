import { z } from 'zod';

// What Orders publishes — the saga's spine. Audience-free: every consumer is another service.
// Payloads carry domain fields only; `messageId` is stamped by the transport and reaches consumers
// as `EventEnvelope<K>`. See `../registry`.

const uuid = z.string().uuid();

export const orderAwaitingPaymentSchema = z.object({
  orderId: uuid,
  userId: uuid,
  showId: uuid,
  totalCents: z.number().int(),
});
export const orderPaidSchema = z.object({ orderId: uuid, userId: uuid, showId: uuid });
export const orderExpiredSchema = z.object({ orderId: uuid, showId: uuid });
export const orderCancelledSchema = z.object({ orderId: uuid, showId: uuid });
export const seatHeldSchema = z.object({ orderId: uuid, showId: uuid, seatId: uuid });
export const seatReleasedSchema = z.object({ orderId: uuid, showId: uuid, seatId: uuid });

export type OrderAwaitingPaymentEvent = z.infer<typeof orderAwaitingPaymentSchema>;
export type OrderPaidEvent = z.infer<typeof orderPaidSchema>;
export type OrderExpiredEvent = z.infer<typeof orderExpiredSchema>;
export type OrderCancelledEvent = z.infer<typeof orderCancelledSchema>;
export type SeatHeldEvent = z.infer<typeof seatHeldSchema>;
export type SeatReleasedEvent = z.infer<typeof seatReleasedSchema>;

// paymentIntentId optional: REST-driven refunds omit it (Payments resolves it from its own row);
// the expire-then-pay race carries it straight from the payment.succeeded event.
export const refundRequestedSchema = z.object({
  orderId: uuid,
  paymentIntentId: z.string().optional(),
});
export type RefundRequestedEvent = z.infer<typeof refundRequestedSchema>;

export const ORDER_ROUTING_KEYS = {
  ORDER_AWAITING_PAYMENT: 'order.awaitingPayment',
  ORDER_PAID: 'order.paid',
  ORDER_EXPIRED: 'order.expired',
  ORDER_CANCELLED: 'order.cancelled',
  SEAT_HELD: 'seat.held',
  SEAT_RELEASED: 'seat.released',
  REFUND_REQUESTED: 'refund.requested',
} as const;

export interface OrdersEventContracts {
  [ORDER_ROUTING_KEYS.ORDER_AWAITING_PAYMENT]: OrderAwaitingPaymentEvent;
  [ORDER_ROUTING_KEYS.ORDER_PAID]: OrderPaidEvent;
  [ORDER_ROUTING_KEYS.ORDER_EXPIRED]: OrderExpiredEvent;
  [ORDER_ROUTING_KEYS.ORDER_CANCELLED]: OrderCancelledEvent;
  [ORDER_ROUTING_KEYS.SEAT_HELD]: SeatHeldEvent;
  [ORDER_ROUTING_KEYS.SEAT_RELEASED]: SeatReleasedEvent;
  [ORDER_ROUTING_KEYS.REFUND_REQUESTED]: RefundRequestedEvent;
}
