import { z } from 'zod';

import { orderStatusSchema } from '../schema';

// A buyer's own orders. Every shape here is scoped to one `userId` at the call site — which is why
// the console's cross-buyer rows live in `../organizer/schema` and cannot be reached from here.

const uuid = z.string().uuid();

export const createOrderSchema = z.object({
  showId: uuid,
  seats: z
    .array(z.object({ seatId: uuid, bandId: uuid }))
    .min(1)
    .max(10),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const orderResponseSchema = z.object({
  id: uuid,
  status: orderStatusSchema,
  totalCents: z.number().int(),
  currency: z.string(),
  expiresAt: z.string(),
  seats: z.array(z.object({ seatId: uuid, bandId: uuid })),
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
