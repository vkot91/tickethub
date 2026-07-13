import { z } from 'zod';

export const eventSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  startsAt: z.string(),
  posterUrl: z.string().nullable(),
  status: z.enum(['draft', 'published', 'cancelled', 'finished']),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

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
  eventId: z.string().uuid(),
  sections: z.array(sectionSchema),
});
export type SeatMap = z.infer<typeof seatMapSchema>;

export const eventDetailSchema = eventSummarySchema.extend({
  description: z.string(),
  venueId: z.string().uuid(),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  venueId: z.string().uuid(),
  startsAt: z.string().datetime(),
});
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const catalogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
