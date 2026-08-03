import { eq } from 'drizzle-orm';

import { ORDER_ROUTING_KEYS } from '@tickethub/contracts';
import { ordersOutbox } from '@tickethub/db';
import { getTestDb } from '@tickethub/db/testing';

import { OutboxRepository, unpublishedQuery } from './outbox.repository';

const expired = {
  routingKey: ORDER_ROUTING_KEYS.ORDER_EXPIRED,
  payload: { orderId: 'o1', showId: 's1' },
} as const;

describe('OutboxRepository', () => {
  const repo = async () => new OutboxRepository(await getTestDb(), ordersOutbox);

  it('enqueue writes the routing key and payload, unpublished', async () => {
    const outbox = await repo();

    await outbox.withTransaction((tx) => outbox.enqueue(tx, expired));

    const [row] = await (await getTestDb()).select().from(ordersOutbox);
    expect(row).toMatchObject({ routingKey: 'order.expired', payload: expired.payload });
    expect(row.publishedAt).toBeNull();
  });

  // The publisher never writes a messageId — this is the only place one is minted, so a payload
  // that reached the table without one could never be deduped by a consumer.
  it('enqueue stamps a messageId the caller did not supply', async () => {
    const outbox = await repo();

    await outbox.withTransaction((tx) => outbox.enqueue(tx, expired));

    const [row] = await (await getTestDb()).select().from(ordersOutbox);
    expect(row.payload).toMatchObject({ messageId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('gives every enqueue its own messageId', async () => {
    const outbox = await repo();

    await outbox.withTransaction(async (tx) => {
      await outbox.enqueue(tx, expired);
      await outbox.enqueue(tx, expired);
    });

    const rows = await (await getTestDb()).select().from(ordersOutbox);
    const ids = rows.map((row) => (row.payload as { messageId: string }).messageId);

    expect(new Set(ids).size).toBe(2);
  });

  it('fetchUnpublished skips published rows and honours the limit', async () => {
    const outbox = await repo();
    const db = await getTestDb();

    await outbox.withTransaction(async (tx) => {
      await outbox.enqueue(tx, {
        routingKey: ORDER_ROUTING_KEYS.ORDER_PAID,
        payload: { orderId: 'o1', userId: 'u1', showId: 's1' },
      });
      await outbox.enqueue(tx, {
        routingKey: ORDER_ROUTING_KEYS.SEAT_RELEASED,
        payload: { orderId: 'o1', showId: 's1', seatId: 'seat-1' },
      });
      await outbox.enqueue(tx, expired);
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

    await outbox.withTransaction((tx) => outbox.enqueue(tx, expired));

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
        await outbox.enqueue(tx, expired);
        throw new Error('domain write failed');
      }),
    ).rejects.toThrow('domain write failed');

    expect(await (await getTestDb()).select().from(ordersOutbox)).toEqual([]);
  });

  // ts-jest type-checks this file, so each @ts-expect-error is an assertion that the hole it
  // names is closed. Delete one and the run fails on an unused directive.
  describe('the payload is checked against the routing key', () => {
    it('rejects a key nothing publishes, a stray field, and a mismatched payload', async () => {
      const outbox = await repo();

      await outbox.withTransaction(async (tx) => {
        // @ts-expect-error — 'order.reticulated' is not an event anyone publishes
        await outbox.enqueue(tx, { routingKey: 'order.reticulated', payload: { orderId: 'o1' } });

        // @ts-expect-error — `acc` is not part of order.expired, and a typo would look just like it
        await outbox.enqueue(tx, { ...expired, payload: { ...expired.payload, acc: 123 } });

        const paid = ORDER_ROUTING_KEYS.ORDER_PAID;
        // @ts-expect-error — order.paid also needs a userId
        await outbox.enqueue(tx, { routingKey: paid, payload: { orderId: 'o1', showId: 's1' } });

        // @ts-expect-error — the publisher does not get to choose the messageId
        await outbox.enqueue(tx, { ...expired, payload: { ...expired.payload, messageId: 'm1' } });
      });

      // Four rows: every one of the above is a *compile-time* rejection only. At runtime the
      // insert still happens, which is the point — nothing but the type system was guarding this.
      expect(await (await getTestDb()).select().from(ordersOutbox)).toHaveLength(4);
    });
  });
});
