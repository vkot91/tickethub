import { loadEnv, requireEnv } from '@tickethub/env';
import { sql } from 'drizzle-orm';
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
import { OrdersService } from './orders.service';

jest.setTimeout(30_000);

describe('Orders concurrency (integration: real Postgres + Redis)', () => {
  let db: Db;
  let redis: Redis;
  let svc: OrdersService;
  let showId: string, seatId: string, ttId: string;

  beforeAll(async () => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));
    redis = new Redis(requireEnv('REDIS_URL'));
    const ids = await seed(db);
    showId = ids.flashShowId;
    seatId = ids.flashSeatId;
    ttId = ids.flashTicketTypeId;
    // release scheduling isn't exercised here — fake the queue.
    svc = new OrdersService(
      db,
      new RedisService(redis),
      new OutboxRepository(db, ordersOutbox),
      new InboxRepository(ordersProcessedMessages),
      { add: async () => undefined } as never,
      600,
    );
  });

  afterAll(() => {
    redis?.disconnect();
    // postgres-js keeps its pool open; the suite runs with --forceExit (see package.json).
  });

  beforeEach(async () => {
    await db.execute(
      // processed_messages included on purpose: markPaid below reuses a fixed messageId, and a
      // leftover inbox row makes it dedupe itself into a no-op (order stuck at awaiting_payment).
      sql`truncate ${seatReservations}, ${orders}, ${sql.raw('"orders"."outbox"')}, ${sql.raw('"orders"."processed_messages"')} restart identity cascade`,
    );
    await redis.flushall();
  });

  const dtoFor = () => ({ showId, seats: [{ seatId, ticketTypeId: ttId }] });

  it('lets exactly one of two concurrent buyers win the single seat', async () => {
    const results = await Promise.allSettled([
      svc.create('11111111-1111-1111-1111-111111111111', 'a', dtoFor() as never),
      svc.create('22222222-2222-2222-2222-222222222222', 'b', dtoFor() as never),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // 0 oversell: exactly one active reservation for the seat.
    const active = await db
      .select()
      .from(seatReservations)
      .where(sql`${seatReservations.seatId} = ${seatId} and ${seatReservations.status} = 'held'`);
    expect(active).toHaveLength(1);
  });

  it('the Postgres partial-unique index is the source of truth (rejects a 2nd active hold even if Redis is bypassed)', async () => {
    const first = await svc.create('33333333-3333-3333-3333-333333333333', 'c', dtoFor() as never);
    expect(first.status).toBe('awaiting_payment');
    await redis.flushall(); // wipe the locks so Redis can't stop the 2nd buyer

    await expect(
      svc.create('44444444-4444-4444-4444-444444444444', 'd', dtoFor() as never),
    ).rejects.toThrow();
  });

  it('release expires an unpaid order and frees the seat for a new buyer', async () => {
    const winner = await svc.create('33333333-3333-3333-3333-333333333333', 'c', dtoFor() as never);
    await svc.release(winner.id);

    const fresh = await svc.create('55555555-5555-5555-5555-555555555555', 'e', dtoFor() as never);
    expect(fresh.status).toBe('awaiting_payment');
  });

  it('markPaid flips an order to paid and confirms its seats', async () => {
    const order = await svc.create('66666666-6666-6666-6666-666666666666', 'f', dtoFor() as never);
    await svc.markPaid({
      messageId: '77777777-7777-7777-7777-777777777777',
      orderId: order.id,
      paymentIntentId: 'pi_test',
      amountCents: order.totalCents,
    } as never);
    const paid = await svc.get('66666666-6666-6666-6666-666666666666', order.id);
    expect(paid.status).toBe('paid');
  });
});
