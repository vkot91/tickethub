import { z } from 'zod';

// What both audiences build on. A shape lands here only when the buyer catalog *and* the console
// genuinely extend it — everything else belongs to one of the two audience folders, where it
// cannot be reached by the other one by accident.

export const showSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  startsAt: z.string(),
  posterUrl: z.string().nullable(),
  status: z.enum(['draft', 'published', 'cancelled', 'finished']),
});
export type ShowSummary = z.infer<typeof showSummarySchema>;

// The three price bands a ticket type can belong to. Purely how a tier is presented — its
// colour on the seat map and the dot on the show page. The money is always `priceCents`.
export const SEAT_TIERS = ['vip', 'standard', 'economy'] as const;
export const seatTierSchema = z.enum(SEAT_TIERS);
export type SeatTier = z.infer<typeof seatTierSchema>;

// One row of the show page's price list. `name` is the organizer's own wording ("Loge",
// "Early Bird"); `tier` is only which of the three bands to paint it in.
export const priceTierSchema = z.object({
  id: z.string().uuid(),
  tier: seatTierSchema,
  name: z.string(),
  priceCents: z.number().int(),
  currency: z.string(),
});
export type PriceTier = z.infer<typeof priceTierSchema>;
