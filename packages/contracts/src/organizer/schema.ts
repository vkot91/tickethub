import { z } from 'zod';
import { orderStatusSchema } from '../orders/schema';
import { seatTierSchema } from '../shows/schema';

// Screen A. The name is what buyers see on the organizer's show pages; the role flip itself
// needs nothing but the caller's JWT.
export const becomeOrganizerSchema = z.object({ name: z.string().min(1) });
export type BecomeOrganizerDto = z.infer<typeof becomeOrganizerSchema>;

// The dashboard's numbers. `showId` omitted means every show the caller owns — ownership is
// resolved in the gateway, never sent by the client.
export const showStatsQuerySchema = z.object({
  showId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ShowStatsQuery = z.infer<typeof showStatsQuerySchema>;

// Shared by the dashboard's merged view and by what Orders alone answers, so it lives once.
export const statsByDaySchema = z.array(
  z.object({
    date: z.string(),
    revenueCents: z.number().int(),
    count: z.number().int(),
  }),
);
export type StatsByDay = z.infer<typeof statsByDaySchema>;

export const showStatsSchema = z.object({
  soldCount: z.number().int(),
  capacity: z.number().int(),
  revenueCents: z.number().int(),
  refundedCents: z.number().int(),
  checkedInCount: z.number().int(),
  byDay: statsByDaySchema,
  byTier: z.array(
    z.object({
      ticketTypeId: z.string().uuid(),
      name: z.string(),
      tier: seatTierSchema,
      soldCount: z.number().int(),
    }),
  ),
});
export type ShowStats = z.infer<typeof showStatsSchema>;

// The half of the dashboard `apps/orders` can answer on its own: capacity, tier names and
// check-ins are merged in by the gateway from Shows and Fulfillment.
export const orderStatsSchema = z.object({
  soldCount: z.number().int(),
  revenueCents: z.number().int(),
  refundedCents: z.number().int(),
  byDay: statsByDaySchema,
  byTier: z.array(
    z.object({
      ticketTypeId: z.string().uuid(),
      soldCount: z.number().int(),
    }),
  ),
});
export type OrderStats = z.infer<typeof orderStatsSchema>;

// A raw order row as Orders knows it — seat *ids*, not labels, and no buyer email. The gateway
// resolves both before this becomes the `RecentOrder` the console renders.
export const recentOrderRowSchema = z.object({
  id: z.string().uuid(),
  showId: z.string().uuid(),
  userId: z.string().uuid(),
  seatIds: z.array(z.string()),
  totalCents: z.number().int(),
  status: orderStatusSchema,
  createdAt: z.string(),
});
export type RecentOrderRow = z.infer<typeof recentOrderRowSchema>;

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
