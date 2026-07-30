import { z } from 'zod';

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

export const showDetailSchema = showSummarySchema.extend({
  description: z.string(),
  venueId: z.string().uuid(),
  // Dearest first, so the show page reads top-down like the design. Empty for a show with no
  // ticket types — such a show has nothing on sale.
  priceTiers: z.array(priceTierSchema),
});
export type ShowDetail = z.infer<typeof showDetailSchema>;

export const createShowSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  venueId: z.string().uuid(),
  startsAt: z.string().datetime(),
});
export type CreateShowDto = z.infer<typeof createShowSchema>;

// Nullable where the column is: clearing a poster or a sale start is a real edit, and
// `undefined` (absent) already means "leave it alone".
export const updateShowSchema = createShowSchema.partial().extend({
  posterUrl: z.string().url().nullable().optional(),
  saleStartsAt: z.string().datetime().nullable().optional(),
});
export type UpdateShowDto = z.infer<typeof updateShowSchema>;

/**
 * One row of the organizer's own show list. `soldCount`/`capacity`/`revenueCents` live in
 * `apps/orders` and come back zero from `apps/shows` — zero rather than omitted, so the shape is
 * the same before and after slice 6 merges the real numbers in.
 */
export const organizerShowSchema = showSummarySchema.extend({
  venueId: z.string().uuid(),
  venueName: z.string(),
  city: z.string().nullable(),
  description: z.string(),
  saleStartsAt: z.string().nullable(),
  soldCount: z.number().int(),
  capacity: z.number().int(),
  revenueCents: z.number().int(),
});
export type OrganizerShow = z.infer<typeof organizerShowSchema>;

export const organizerShowsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'cancelled', 'finished']).optional(),
});
export type OrganizerShowsQuery = z.infer<typeof organizerShowsQuerySchema>;

export const catalogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/**
 * What still stands between a draft and going on sale. The popover renders it; it is never the
 * gate — `publishShow` re-evaluates the same three booleans server-side, because the client's
 * copy is stale the moment anything else changes the show.
 */
export const publishChecklistSchema = z.object({
  hasTicketTypes: z.boolean(),
  hasPricedSections: z.boolean(),
  startsInFuture: z.boolean(),
  pricedSectionCount: z.number().int(),
  sectionCount: z.number().int(),
  seatsOnSale: z.number().int(),
});
export type PublishChecklist = z.infer<typeof publishChecklistSchema>;

/**
 * Draft-only, transactional, wholesale replace of a show's bands and which sections they price.
 * `key` is a client-side handle so an assignment can reference a band that has no id yet; the
 * server maps it to the inserted id and never persists it.
 */
export const putPricingSchema = z.object({
  ticketTypes: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      tier: seatTierSchema,
      priceCents: z.number().int().min(0),
    }),
  ),
  assignments: z.array(
    z.object({
      sectionId: z.string().uuid(),
      ticketTypeKey: z.string().min(1),
    }),
  ),
});
export type PutPricingDto = z.infer<typeof putPricingSchema>;

/**
 * The three types MinIO is allowed to accept for a poster. The signature covers the content type,
 * so an upload URL minted for `image/png` cannot be reused to store a script.
 */
export const POSTER_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const posterUploadRequestSchema = z.object({
  contentType: z.enum(POSTER_CONTENT_TYPES),
});
export type PosterUploadRequestDto = z.infer<typeof posterUploadRequestSchema>;

export const posterUploadUrlSchema = z.object({
  uploadUrl: z.string().url(),
  // What the client then PATCHes onto the show. Not derived client-side — the key layout is the
  // server's business and it changes the day the bucket does.
  posterUrl: z.string().url(),
});
export type PosterUploadUrl = z.infer<typeof posterUploadUrlSchema>;

export const showPublishedSchema = z.object({
  messageId: z.string().uuid(),
  showId: z.string().uuid(),
});
export type ShowPublishedEvent = z.infer<typeof showPublishedSchema>;

export const catalogPageSchema = z.object({
  items: z.array(showSummarySchema),
  nextCursor: z.string().uuid().nullable(),
});
export type CatalogPage = z.infer<typeof catalogPageSchema>;
