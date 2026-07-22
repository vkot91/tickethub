import { eq } from 'drizzle-orm';
import { ordersOutbox } from '@tickethub/db';
import { getTestDb } from '@tickethub/db/testing';
import { OutboxRepository, unpublishedQuery } from './outbox.repository';

const message = (routingKey: string) => ({
  routingKey,
  payload: { messageId: crypto.randomUUID(), orderId: 'o1' },
});

describe('OutboxRepository', () => {
  const repo = async () => new OutboxRepository(await getTestDb(), ordersOutbox);

  it('enqueue writes the routing key and payload, unpublished', async () => {
    const outbox = await repo();
    const msg = message('order.paid');

    await outbox.withTransaction((tx) => outbox.enqueue(tx, msg));

    const [row] = await (await getTestDb()).select().from(ordersOutbox);
    expect(row).toMatchObject({ routingKey: 'order.paid', payload: msg.payload });
    expect(row.publishedAt).toBeNull();
  });

  it('fetchUnpublished skips published rows and honours the limit', async () => {
    const outbox = await repo();
    const db = await getTestDb();

    await outbox.withTransaction(async (tx) => {
      await outbox.enqueue(tx, message('order.created'));
      await outbox.enqueue(tx, message('order.paid'));
      await outbox.enqueue(tx, message('order.expired'));
    });

    const [first] = await db.select().from(ordersOutbox);
    await db
      .update(ordersOutbox)
      .set({ publishedAt: new Date() })
      .where(eq(ordersOutbox.id, first.id));

    const rows = await outbox.withTransaction((tx) => outbox.fetchUnpublished(tx, 10));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.publishedAt === null)).toBe(true);

    const capped = await outbox.withTransaction((tx) => outbox.fetchUnpublished(tx, 1));

    expect(capped).toHaveLength(1);
  });

  it('markPublished stamps published_at so the row is not handed out again', async () => {
    const outbox = await repo();

    await outbox.withTransaction((tx) => outbox.enqueue(tx, message('order.paid')));

    const [row] = await outbox.withTransaction((tx) => outbox.fetchUnpublished(tx, 10));
    await outbox.withTransaction((tx) => outbox.markPublished(tx, row.id));

    expect(await outbox.withTransaction((tx) => outbox.fetchUnpublished(tx, 10))).toEqual([]);

    const [stored] = await (await getTestDb()).select().from(ordersOutbox);
    expect(stored.publishedAt).toBeInstanceOf(Date);
  });

  it('claims rows with FOR UPDATE SKIP LOCKED', async () => {
    // Pinning the clause in the emitted SQL is the only way to catch its loss: dropping it
    // keeps every behavioural test green (Postgres still refuses to double-publish) and
    // costs only throughput, as concurrent pollers start blocking on each other's batch.
    const { sql } = unpublishedQuery(await getTestDb(), ordersOutbox, 10).toSQL();

    expect(sql.toLowerCase()).toContain('for update skip locked');
  });

  it('withTransaction rolls back when the callback throws', async () => {
    const outbox = await repo();

    await expect(
      outbox.withTransaction(async (tx) => {
        await outbox.enqueue(tx, message('order.paid'));
        throw new Error('domain write failed');
      }),
    ).rejects.toThrow('domain write failed');

    expect(await (await getTestDb()).select().from(ordersOutbox)).toEqual([]);
  });
});
