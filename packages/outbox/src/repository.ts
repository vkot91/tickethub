import type { Db, OutboxTable, ProcessedMessagesTable } from '@tickethub/db';

// A Drizzle transaction handle — same query surface as Db, derived from its callback.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface OutboxMessage {
  routingKey: string;
  payload: Record<string, unknown> & { messageId: string };
}

export class OutboxRepository {
  // Called inside the same tx as the state change — that's the whole point of the outbox.
  async enqueue(tx: Tx, table: OutboxTable, msg: OutboxMessage): Promise<void> {
    await tx.insert(table).values({ routingKey: msg.routingKey, payload: msg.payload });
  }
}

// Idempotent-consumer guard: insert the messageId; a PK conflict (0 rows returned)
// means we've already processed this message.
export async function alreadyProcessed(
  tx: Tx,
  table: ProcessedMessagesTable,
  messageId: string,
): Promise<boolean> {
  const rows = await tx.insert(table).values({ messageId }).onConflictDoNothing().returning();
  return rows.length === 0;
}
