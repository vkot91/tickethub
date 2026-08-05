import { pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { createOutboxTable, createProcessedMessagesTable } from './outbox';

export const ticketsSchema = pgSchema('tickets');

// One row per *seat*, not per order: a ticket is what a gate scanner admits, so a three-seat
// order is three tickets with three QR tokens and three independent check-ins. The rendered PDF
// stays one document for the whole order (one page per seat), which is why `s3Key` repeats
// across the rows of an order rather than living in a table of its own.
export const tickets = ticketsSchema.table(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(), // logical FK to orders.orders — no cross-schema JOINs
    // Denormalised from order.paid at issue time. Without it "the caller's tickets" would need a
    // cross-schema join into orders, which this architecture forbids — and every read would pay
    // an RPC just to answer "is this yours?".
    userId: uuid('user_id').notNull(),
    showId: uuid('show_id').notNull(), // logical FK to shows.shows
    seatId: uuid('seat_id').notNull(), // logical FK to shows.seats
    // Snapshotted at issue time: these are what was *sold*. Re-deriving them from a live seat map
    // would let a re-tiered or re-mapped show silently rewrite the history of an old ticket.
    // Show title/time/venue are deliberately NOT snapshotted — a rescheduled show must display
    // its new date, so those are fetched from shows at read time.
    seatLabel: text('seat_label').notNull(),
    tier: text('tier').notNull(),
    qrToken: text('qr_token').notNull(),
    s3Key: text('s3_key').notNull(),
    // Null until a gate scans it. The check-in path is a single
    // `UPDATE ... SET checked_in_at = now() WHERE id = $1 AND checked_in_at IS NULL`, so
    // concurrent scans of one ticket resolve to exactly one `valid`.
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // A redelivered order.paid re-inserts the same (order, seat) pairs; onConflictDoNothing turns
    // that into a no-op instead of a second set of tickets.
    orderSeatUq: unique('tickets_order_seat_uq').on(t.orderId, t.seatId),
  }),
);

export const ticketsOutbox = createOutboxTable(ticketsSchema);
export const ticketsProcessedMessages = createProcessedMessagesTable(ticketsSchema);
