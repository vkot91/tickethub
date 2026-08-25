import { z } from 'zod';

import { seatStatusSchema } from '../../orders/user/schema';
import { seatMapSchema } from '../../shows/user/schema';

/**
 * The seat map as the gateway answers it: geometry from `apps/shows`, availability from
 * `apps/orders`, merged in the one process that can see both. Neither service can produce this
 * shape alone — there is no FK between a seat and a reservation and no cross-service JOIN — so it
 * lives under `gateway/` rather than in either owner's folder.
 *
 * A seat absent from `statuses` is available.
 */
export const seatMapViewSchema = seatMapSchema.extend({
  statuses: z.record(z.string().uuid(), seatStatusSchema),
});
export type SeatMapView = z.infer<typeof seatMapViewSchema>;
