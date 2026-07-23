import { pgSchema, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { createOutboxTable, createProcessedMessagesTable } from './outbox';

export const fulfillmentSchema = pgSchema('fulfillment');

export const tickets = fulfillmentSchema.table(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(), // logical FK to orders.orders — no cross-schema JOINs
    s3Key: text('s3_key').notNull(),
    qrToken: text('qr_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderUq: unique('tickets_order_uq').on(t.orderId), // one ticket per order — outbox idempotency
  }),
);

export const fulfillmentOutbox = createOutboxTable(fulfillmentSchema);
export const fulfillmentProcessedMessages = createProcessedMessagesTable(fulfillmentSchema);
