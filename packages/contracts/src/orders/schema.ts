import { z } from 'zod';

// An order's status is the one order shape both audiences read: the buyer sees it on their own
// order, the console sees it on someone else's. Everything else splits by audience.
export const orderStatusSchema = z.enum([
  'awaiting_payment',
  'paid',
  'expired',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
