import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createOutboxTable, createProcessedMessagesTable } from './outbox';

export const ordersSchema = pgSchema('orders');

export const orderStatusEnum = ordersSchema.enum('order_status', [
  'awaiting_payment',
  'paid',
  'expired',
  'cancelled',
  'refunded',
]);
export const seatReservationStatusEnum = ordersSchema.enum('seat_reservation_status', [
  'held',
  'confirmed',
  'released',
]);

export const orders = ordersSchema.table(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(), // logical FK to auth.users
    showId: uuid('show_id').notNull(), // logical FK to shows.shows
    status: orderStatusEnum('status').notNull().default('awaiting_payment'),
    idempotencyKey: text('idempotency_key').notNull(),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('usd'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdemUq: unique('orders_user_idem_uq').on(t.userId, t.idempotencyKey),
    // The organizer dashboard aggregates by show over a date window; this is the index it scans.
    showCreatedIdx: index('orders_show_created_idx').on(t.showId, t.createdAt),
  }),
);

export const seatReservations = ordersSchema.table(
  'seat_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    showId: uuid('show_id').notNull(),
    seatId: uuid('seat_id').notNull(),
    bandId: uuid('price_band_id').notNull(),
    status: seatReservationStatusEnum('status').notNull().default('held'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // The oversell barrier: at most one active reservation per (show, seat).
    activeUq: uniqueIndex('seat_res_active_uq')
      .on(t.showId, t.seatId)
      .where(sql`status in ('held','confirmed')`),
  }),
);

export const ordersOutbox = createOutboxTable(ordersSchema);
export const ordersProcessedMessages = createProcessedMessagesTable(ordersSchema);
