import { z } from 'zod';
import { orderStatusSchema } from '../schema';

// What Orders can answer about *other people's* orders, for the console's dashboard. Scoped by a
// resolved `showIds[]` rather than a `userId` — ownership is proved in the gateway, so Orders never
// learns who owns what. That difference in scoping is exactly why these are not in `../user`.

// Shared by the dashboard's merged view and by what Orders alone answers, so it lives once, here,
// where the numbers are actually produced.
export const statsByDaySchema = z.array(
  z.object({
    date: z.string(),
    revenueCents: z.number().int(),
    count: z.number().int(),
  }),
);
export type StatsByDay = z.infer<typeof statsByDaySchema>;

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
