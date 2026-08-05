import { z } from 'zod';

import { statsByDaySchema } from '../../orders/organizer/schema';
import { orderStatusSchema } from '../../orders/schema';
import { seatTierSchema } from '../../shows/schema';

// The dashboard views no single service can answer. `ShowStats` and `RecentOrder` are stitched by
// the gateway out of Orders' numbers, Shows' capacity and band names, and Tickets' check-ins, so
// they belong to none of those folders — and `apps/web-organizer` is their only consumer.
//
// `gateway` is the owning service here in the same sense as every other folder: the process that
// answers the call. Whatever one real service answers alone lives under that service's own
// `organizer/` folder — `../../orders/organizer/schema` for the raw numbers,
// `../../shows/organizer/schema` for authoring and for the account itself.

// `showId` omitted means every show the caller owns — ownership is resolved in the gateway, never
// sent by the client.
export const showStatsQuerySchema = z.object({
  showId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ShowStatsQuery = z.infer<typeof showStatsQuerySchema>;

export const showStatsSchema = z.object({
  soldCount: z.number().int(),
  capacity: z.number().int(),
  revenueCents: z.number().int(),
  refundedCents: z.number().int(),
  checkedInCount: z.number().int(),
  byDay: statsByDaySchema,
  byTier: z.array(
    z.object({
      bandId: z.string().uuid(),
      name: z.string(),
      tier: seatTierSchema,
      soldCount: z.number().int(),
    }),
  ),
});
export type ShowStats = z.infer<typeof showStatsSchema>;

export const recentOrderSchema = z.object({
  id: z.string().uuid(),
  showTitle: z.string(),
  // null when the buyer's user row is gone — the table renders "Unknown buyer" rather than
  // dropping the row, since the money it represents still happened.
  buyerEmail: z.string().nullable(),
  seatLabels: z.array(z.string()),
  totalCents: z.number().int(),
  status: orderStatusSchema,
  createdAt: z.string(),
});
export type RecentOrder = z.infer<typeof recentOrderSchema>;

export const recentOrdersSchema = z.object({ items: z.array(recentOrderSchema) });
export type RecentOrders = z.infer<typeof recentOrdersSchema>;
