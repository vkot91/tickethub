import { loadEnv, requireEnv } from '@tickethub/env';
import { sql, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import Redis from 'ioredis';
import {
  createDb,
  orders,
  seatReservations,
  ordersOutbox,
  ordersProcessedMessages,
  type Db,
} from '@tickethub/db';
import { seed } from '@tickethub/db/seed';
import { RedisService } from '@tickethub/redis';
import { OutboxRepository, InboxRepository } from '@tickethub/outbox';
import { OrderRepository } from '../orders.repository';
import { OrdersService } from '../orders.service';
import { OrderSagaService } from './saga.service';

jest.setTimeout(30_000);

describe('Orders saga transitions (integration: real Postgres + Redis)', () => {
  let db: Db;
  let redis: Redis;
  let svc: OrdersService;
  let saga: OrderSagaService;
  let showId: string, seatId: string, ttId: string;
  const buyer = '99999999-9999-9999-9999-999999999999';

  beforeAll(async () => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));
    redis = new Redis(requireEnv('REDIS_URL'));
    const ids = await seed(db);
    showId = ids.flashShowId;
    seatId = ids.flashSeatId;
    ttId = ids.flashTicketTypeId;
    const orderRepository = new OrderRepository(
      new RedisService(redis),
      new OutboxRepository(db, ordersOutbox),
      new InboxRepository(ordersProcessedMessages),
    );
    svc = new OrdersService(
      db,
      new RedisService(redis),
      orderRepository,
      { add: async () => undefined } as never,
      600,
    );
    saga = new OrderSagaService(db, orderRepository);
  });

  afterAll(() => {
    redis?.disconnect();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate ${seatReservations}, ${orders}, ${sql.raw('"orders"."outbox"')}, ${sql.raw('"orders"."processed_messages"')} restart identity cascade`,
    );
    await redis.flushall();
  });

  const dtoFor = () => ({ showId, seats: [{ seatId, ticketTypeId: ttId }] });
  const outboxKeys = async () => (await db.select().from(ordersOutbox)).map((r) => r.routingKey);

  it('markPaid confirms an awaiting_payment order and its seats', async () => {
    const order = await svc.create(buyer, 'pay-1', dtoFor() as never);

    await saga.markPaid({
      messageId: uuid(),
      orderId: order.id,
      paymentIntentId: 'pi_1',
      amountCents: order.totalCents,
    } as never);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    const [res] = await db
      .select()
      .from(seatReservations)
      .where(eq(seatReservations.orderId, order.id));
    expect(row.status).toBe('paid');
    expect(res.status).toBe('confirmed');
    expect(await outboxKeys()).toEqual(expect.arrayContaining(['order.paid']));
  });

  it('markPaid on an expired order auto-refunds instead of resurrecting (the race)', async () => {
    const order = await svc.create(buyer, 'pay-2', dtoFor() as never);
    await saga.release(order.id); // expire it first

    const messageId = uuid();
    await saga.markPaid({
      messageId,
      orderId: order.id,
      paymentIntentId: 'pi_2',
      amountCents: order.totalCents,
    } as never);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe('expired');
    expect(await outboxKeys()).toContain('refund.requested');

    // Idempotent: replaying the same messageId adds no new refund.requested row.
    const before = (await outboxKeys()).filter((k) => k === 'refund.requested').length;
    await saga.markPaid({
      messageId,
      orderId: order.id,
      paymentIntentId: 'pi_2',
      amountCents: order.totalCents,
    } as never);
    const after = (await outboxKeys()).filter((k) => k === 'refund.requested').length;
    expect(after).toBe(before);
  });
});
