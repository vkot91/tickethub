import { randomUUID } from 'node:crypto';
import { isNull, eq } from 'drizzle-orm';
import type { Db, OutboxTable } from '@tickethub/db';
import type { EventKey, EventPayload } from '@tickethub/contracts';

// A Drizzle transaction handle — same query surface as Db, derived from its callback.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * One event to publish, named by its routing key. `K` is inferred from `routingKey`, so `payload`
 * is checked against exactly that event's contract: a stray key, a missing field, or the right
 * payload under the wrong routing key are all compile errors here.
 *
 * `messageId` is not part of it — `enqueue` stamps it. See `EventEnvelope` in @tickethub/contracts.
 */
export interface OutboxMessage<K extends EventKey> {
  routingKey: K;
  payload: EventPayload<K>;
}

export type OutboxRow = OutboxTable['$inferSelect'];

// Kept as a standalone builder so the SKIP LOCKED clause is unit-testable via toSQL().
// Correctness does not depend on it — under READ COMMITTED a plain FOR UPDATE re-checks
// `published_at is null` after the lock is released, so rows are never published twice.
// It buys throughput: without it a second poller blocks on the first one's batch instead
// of picking up different rows. Nothing observable fails when it is lost, hence the test.
export function unpublishedQuery(db: Db | Tx, table: OutboxTable, limit: number) {
  return db
    .select()
    .from(table)
    .where(isNull(table.publishedAt))
    .for('update', { skipLocked: true })
    .limit(limit);
}

// Owns every statement against one service's outbox table. Callers name the message,
// never the table.
export class OutboxRepository {
  constructor(
    private readonly db: Db,
    private readonly table: OutboxTable,
  ) {}

  // Called inside the same tx as the state change — that's the whole point of the outbox.
  // The messageId is minted here and nowhere else: it identifies this *delivery* for consumer
  // dedupe, which is the transport's business, not the publisher's.
  async enqueue<K extends EventKey>(tx: Tx, msg: OutboxMessage<K>): Promise<void> {
    await tx
      .insert(this.table)
      .values({ routingKey: msg.routingKey, payload: { messageId: randomUUID(), ...msg.payload } });
  }

  // Claims a batch for this poller run; the row locks are held until the tx commits.
  fetchUnpublished(tx: Tx, limit: number): Promise<OutboxRow[]> {
    return unpublishedQuery(tx, this.table, limit);
  }

  async markPublished(tx: Tx, id: OutboxRow['id']): Promise<void> {
    await tx.update(this.table).set({ publishedAt: new Date() }).where(eq(this.table.id, id));
  }

  // For callers whose whole unit of work is outbox work (the poller). Services keep
  // opening their own transaction, because theirs also carries domain writes.
  withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
}
