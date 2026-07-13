import { PgSchema, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

// Reusable transactional-outbox tables. Each service owns its own copy inside its
// pgSchema — no shared table, no cross-service coupling.
export function createOutboxTable(schema: PgSchema) {
  return schema.table('outbox', {
    id: uuid('id').primaryKey().defaultRandom(),
    routingKey: text('routing_key').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  });
}

export function createProcessedMessagesTable(schema: PgSchema) {
  return schema.table('processed_messages', {
    messageId: uuid('message_id').primaryKey(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  });
}

export type OutboxTable = ReturnType<typeof createOutboxTable>;
export type ProcessedMessagesTable = ReturnType<typeof createProcessedMessagesTable>;
