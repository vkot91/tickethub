import { loadEnv, requireEnv } from '@tickethub/env';
import { ClientProxyFactory } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { isNotNull, sql } from 'drizzle-orm';
import { createDb, ordersOutbox, type Db } from '@tickethub/db';
import { OutboxPoller } from '@tickethub/outbox';
import { rmqClientOptions } from '@tickethub/rmq';
import { QUEUES, ORDER_ROUTING_KEYS } from '@tickethub/contracts';
import { v4 as uuid } from 'uuid';

jest.setTimeout(30_000);

describe('OutboxPoller (integration: real Postgres + RabbitMQ)', () => {
  let db: Db;
  let client: ClientProxy;

  beforeAll(async () => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));
    client = ClientProxyFactory.create(
      rmqClientOptions(QUEUES.ordersEvents, requireEnv('RABBITMQ_URL')),
    );
    await client.connect();
  });

  afterAll(async () => {
    await client?.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate ${sql.raw('"orders"."outbox"')} restart identity cascade`);
  });

  it('publishes unpublished rows and stamps published_at', async () => {
    await db.insert(ordersOutbox).values({
      routingKey: ORDER_ROUTING_KEYS.orderPaid,
      payload: { messageId: uuid(), orderId: uuid(), userId: uuid(), eventId: uuid() },
    });

    const poller = new OutboxPoller(db, ordersOutbox, client);
    await poller.drain();

    const published = await db
      .select()
      .from(ordersOutbox)
      .where(isNotNull(ordersOutbox.publishedAt));
    expect(published).toHaveLength(1);
    expect(published[0].publishedAt).not.toBeNull();
  });
});
