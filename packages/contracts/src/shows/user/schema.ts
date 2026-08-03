import { z } from 'zod';

import { priceTierSchema, seatTierSchema, showSummarySchema } from '../schema';

// The buyer-facing catalog: browse, one show, its seats. Nothing here is authored — every shape is
// read-only, which is why authoring DTOs live in `../organizer/schema` and not next to these.

export const catalogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const catalogPageSchema = z.object({
  items: z.array(showSummarySchema),
  nextCursor: z.string().uuid().nullable(),
});
export type CatalogPage = z.infer<typeof catalogPageSchema>;

export const showDetailSchema = showSummarySchema.extend({
  description: z.string(),
  venueId: z.string().uuid(),
  // Dearest first, so the show page reads top-down like the design. Empty for a show with no
  // ticket types — such a show has nothing on sale.
  priceTiers: z.array(priceTierSchema),
});
export type ShowDetail = z.infer<typeof showDetailSchema>;

// `ticketTypeId` is what `createOrderSchema` needs per seat to price the order, and
// `priceCents` is what orders will actually charge for it — the UI must never invent its own
// number. All three null when no ticket type covers the seat: it still renders, but nothing
// about it can be bought.
export const seatSchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  ticketTypeId: z.string().uuid().nullable(),
  priceCents: z.number().int().nullable(),
  tier: seatTierSchema.nullable(),
});
export const rowSchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  seats: z.array(seatSchema),
});
export const sectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rows: z.array(rowSchema),
});
export const seatMapSchema = z.object({
  showId: z.string().uuid(),
  sections: z.array(sectionSchema),
});
export type SeatMap = z.infer<typeof seatMapSchema>;
