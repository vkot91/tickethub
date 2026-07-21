import { pgSchema, uuid, text, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { createOutboxTable, createProcessedMessagesTable } from './outbox';

export const paymentsSchema = pgSchema('payments');

export const paymentStatusEnum = paymentsSchema.enum('payment_status', [
  'requires_payment',
  'succeeded',
  'failed',
  'refunded',
  // reservation expired before the customer paid — we cancel the intent so it can't be
  // charged later. Distinct from 'failed' (card declined) for reconciliation.
  'canceled',
]);

export const payments = paymentsSchema.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(), // logical FK to orders.orders
    stripePaymentIntentId: text('stripe_payment_intent_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('usd'),
    status: paymentStatusEnum('status').notNull().default('requires_payment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderUq: unique('payments_order_uq').on(t.orderId), // one payment per order
  }),
);

// Webhook idempotency: a stripe event is processed at most once.
export const stripeEvents = paymentsSchema.table('stripe_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentsOutbox = createOutboxTable(paymentsSchema);
export const paymentsProcessedMessages = createProcessedMessagesTable(paymentsSchema);
