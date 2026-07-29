import { z } from 'zod';

/**
 * A venue is a building, not a possession — the catalogue is shared and nobody's `organizerId`
 * appears here. Organizers only ever pick from the list (migration `0002_venues_are_shared`).
 */
export const venueSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  // The one derived number worth a join: it is how an organizer picks a hall that fits the show.
  seatCount: z.number().int(),
});
export type VenueSummary = z.infer<typeof venueSummarySchema>;

// Same shape as the buyer's seat map minus every price — a venue knows its furniture, not what a
// given show charges for it.
export const venueDetailSchema = z.object({
  venue: venueSummarySchema.omit({ seatCount: true }),
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      rows: z.array(
        z.object({
          id: z.string().uuid(),
          number: z.number().int(),
          seats: z.array(z.object({ id: z.string().uuid(), number: z.number().int() })),
        }),
      ),
    }),
  ),
});
export type VenueDetail = z.infer<typeof venueDetailSchema>;
