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

export const orderStatusSchema = z.enum([
  'awaiting_payment',
  'paid',
  'expired',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderResponseSchema = z.object({
  id: uuid,
  status: orderStatusSchema,
  totalCents: z.number().int(),
  currency: z.string(),
  expiresAt: z.string(),
  seats: z.array(z.object({ seatId: uuid, ticketTypeId: uuid })),
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const orderListQuerySchema = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** One order as Orders knows it. `showTitle`/`seatLabels` live in Shows — the gateway adds them. */
export const orderSummarySchema = orderResponseSchema.extend({
  showId: uuid,
  createdAt: z.string(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderSummaryPageSchema = z.object({
  items: z.array(orderSummarySchema),
  nextCursor: uuid.nullable(),
});
export type OrderSummaryPage = z.infer<typeof orderSummaryPageSchema>;

export const orderListItemSchema = orderSummarySchema.extend({
  showTitle: z.string(),
  seatLabels: z.array(z.string()),
});
export type OrderListItem = z.infer<typeof orderListItemSchema>;

export const orderListSchema = z.object({
  items: z.array(orderListItemSchema),
  nextCursor: uuid.nullable(),
});
export type OrderList = z.infer<typeof orderListSchema>;

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
