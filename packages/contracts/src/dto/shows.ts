import { z } from 'zod';

export const showSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  startsAt: z.string(),
  posterUrl: z.string().nullable(),
  status: z.enum(['draft', 'published', 'cancelled', 'finished']),
});
export type ShowSummary = z.infer<typeof showSummarySchema>;

export const seatSchema = z.object({ id: z.string().uuid(), number: z.number().int() });
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
});
export type ShowDetail = z.infer<typeof showDetailSchema>;

export const createShowSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  venueId: z.string().uuid(),
  startsAt: z.string().datetime(),
});
export type CreateShowDto = z.infer<typeof createShowSchema>;

export const catalogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const showPublishedSchema = z.object({
  messageId: z.string().uuid(),
  showId: z.string().uuid(),
});
export type ShowPublishedEvent = z.infer<typeof showPublishedSchema>;
