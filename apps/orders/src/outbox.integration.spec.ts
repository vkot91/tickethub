import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { isNotNull, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

import { ORDER_ROUTING_KEYS } from '@tickethub/contracts';
import { createDb, ordersOutbox, type Db } from '@tickethub/db';
import { loadEnv, requireEnv } from '@tickethub/env';
import { OutboxPoller, OutboxRepository } from '@tickethub/outbox';
import { publishStored, rmqConfig } from '@tickethub/rmq';

jest.setTimeout(30_000);

const row = () => ({
  routingKey: ORDER_ROUTING_KEYS.ORDER_PAID,
  payload: { messageId: uuid(), orderId: uuid(), userId: uuid(), showId: uuid() },
});

describe('OutboxPoller (integration: real Postgres + RabbitMQ)', () => {
  let db: Db;
  let amqp: AmqpConnection;
  let outbox: OutboxRepository;

  beforeAll(async () => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));
    outbox = new OutboxRepository(db, ordersOutbox);
    amqp = new AmqpConnection(rmqConfig(requireEnv('RABBITMQ_URL')));
    await amqp.init();
  });

  afterAll(async () => {
    await amqp?.managedConnection?.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate ${sql.raw('"orders"."outbox"')} restart identity cascade`);
  });

  it('publishes unpublished rows and stamps published_at', async () => {
    await db.insert(ordersOutbox).values(row());

    const poller = new OutboxPoller(outbox, (rk, p) => publishStored(amqp, rk, p));
    await poller.drain();

    const published = await db
      .select()
      .from(ordersOutbox)
      .where(isNotNull(ordersOutbox.publishedAt));
    expect(published).toHaveLength(1);
    expect(published[0].publishedAt).not.toBeNull();
  });

  // Needs real Postgres: pglite is single-connection, so concurrent drains cannot be
  // reproduced in the unit suite. Verified by experiment that this stays green when
  // SKIP LOCKED is removed — the row locks alone already prevent double-publishing, and
  // SKIP LOCKED only stops the second poller blocking. What this pins is the outcome that
  // actually matters: every row published exactly once, none left behind.
  it('never publishes a row twice when two pollers drain concurrently', async () => {
    await db.insert(ordersOutbox).values([row(), row(), row(), row()]);

    const published: string[] = [];
    const record = (_rk: string, payload: unknown) => {
      published.push((payload as { messageId: string }).messageId);
      return Promise.resolve();
    };

    const [a, b] = [new OutboxPoller(outbox, record), new OutboxPoller(outbox, record)];

    await Promise.all([a.drain(), b.drain()]);

    expect(published).toHaveLength(4);
    expect(new Set(published).size).toBe(4);

    const unpublished = await db
      .select()
      .from(ordersOutbox)
      .where(sql`${ordersOutbox.publishedAt} is null`);
    expect(unpublished).toEqual([]);
  });
});
