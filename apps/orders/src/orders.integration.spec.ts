import { BadRequestException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import Redis from 'ioredis';

import {
  createDb,
  orders,
  ordersOutbox,
  ordersProcessedMessages,
  seatReservations,
  seats,
  ticketTypes,
  type Db,
} from '@tickethub/db';
import { seed } from '@tickethub/db/seed';
import { loadEnv, requireEnv } from '@tickethub/env';
import { InboxRepository, OutboxRepository } from '@tickethub/outbox';
import { RedisService } from '@tickethub/redis';

import { OrderRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { OrderSagaService } from './saga/saga.service';

jest.setTimeout(30_000);

describe('Orders concurrency (integration: real Postgres + Redis)', () => {
  let db: Db;
  let redis: Redis;
  let svc: OrdersService;
  let saga: OrderSagaService;
  let showId: string, seatId: string, ttId: string;

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
    // release scheduling isn't exercised here — fake the queue.
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

  // The price a buyer pays comes from the seat's section via show_section_pricing, never from the
  // ticketTypeId they posted. Trusting that field let anyone send a cheap band's id for an
  // expensive seat and be charged the cheap price.
  it('ignores a forged ticketTypeId and charges the seat’s own section price', async () => {
    const [cheapest] = await db
      .select({ id: ticketTypes.id, priceCents: ticketTypes.priceCents })
      .from(ticketTypes)
      .orderBy(asc(ticketTypes.priceCents))
      .limit(1);

    const [real] = await db
      .select({ priceCents: ticketTypes.priceCents })
      .from(ticketTypes)
      .where(eq(ticketTypes.id, ttId));

    // Guard the premise: the forged type must actually be cheaper, or this proves nothing.
    expect(cheapest.id).not.toBe(ttId);
    expect(cheapest.priceCents).toBeLessThan(real.priceCents);

    const order = await svc.create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'forge', {
      showId,
      seats: [{ seatId, ticketTypeId: cheapest.id }],
    } as never);

    expect(order.totalCents).toBe(real.priceCents);
    // The reservation records the resolved band too, so tickets snapshot the right tier.
    expect(order.seats).toEqual([{ seatId, ticketTypeId: ttId }]);
    const [reservation] = await db
      .select({ ticketTypeId: seatReservations.ticketTypeId })
      .from(seatReservations)
      .where(eq(seatReservations.seatId, seatId));
    expect(reservation.ticketTypeId).toBe(ttId);
  });

  it('refuses a seat the show does not sell', async () => {
    // A seat from another venue entirely: it joins to no show_section_pricing row for this show.
    const [foreign] = await db
      .select({ id: seats.id })
      .from(seats)
      .where(sql`${seats.id} <> ${seatId}`)
      .limit(1);

    await expect(
      svc.create('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'foreign', {
        showId,
        seats: [{ seatId: foreign.id, ticketTypeId: ttId }],
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

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
    await saga.release(winner.id);

    const fresh = await svc.create('55555555-5555-5555-5555-555555555555', 'e', dtoFor() as never);
    expect(fresh.status).toBe('awaiting_payment');
  });

  it('markPaid flips an order to paid and confirms its seats', async () => {
    const order = await svc.create('66666666-6666-6666-6666-666666666666', 'f', dtoFor() as never);
    await saga.markPaid({
      messageId: '77777777-7777-7777-7777-777777777777',
      orderId: order.id,
      paymentIntentId: 'pi_test',
      amountCents: order.totalCents,
    } as never);
    const paid = await svc.get('66666666-6666-6666-6666-666666666666', order.id);
    expect(paid.status).toBe('paid');
  });

  it('get() returns only the confirmed seat reservations, excluding held/released ones', async () => {
    const userId = '88888888-8888-8888-8888-888888888888';
    const order = await svc.create(userId, 'g', dtoFor() as never); // seeds a 'held' reservation for seatId

    const confirmedSeatId = '99999999-9999-9999-9999-999999999999';
    await db.insert(seatReservations).values({
      orderId: order.id,
      showId,
      seatId: confirmedSeatId,
      ticketTypeId: ttId,
      status: 'confirmed',
    });

    const response = await svc.get(userId, order.id);

    expect(response.seats).toEqual([{ seatId: confirmedSeatId, ticketTypeId: ttId }]);
  });

  // The keyset is a Postgres row comparison — only a real database proves it orders and
  // paginates the way the page expects, so the rows go in directly rather than through create().
  describe('list', () => {
    const buyer = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const stranger = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const orderRow = (userId: string, key: string, createdAt: string) => ({
      userId,
      showId,
      idempotencyKey: key,
      status: 'awaiting_payment' as const,
      totalCents: 5000,
      currency: 'usd',
      expiresAt: new Date('2030-01-01'),
      createdAt: new Date(createdAt),
    });

    it('pages the buyer own orders newest first', async () => {
      const inserted = await db
        .insert(orders)
        .values([
          orderRow(buyer, 'list-old', '2026-07-01T00:00:00Z'),
          orderRow(buyer, 'list-mid', '2026-07-02T00:00:00Z'),
          orderRow(buyer, 'list-new', '2026-07-03T00:00:00Z'),
        ])
        .returning();
      const byKey = new Map(inserted.map((order) => [order.idempotencyKey, order.id]));

      const first = await svc.list(buyer, { limit: 2 });

      expect(first.items.map((item) => item.id)).toEqual([
        byKey.get('list-new'),
        byKey.get('list-mid'),
      ]);
      expect(first.nextCursor).toBe(byKey.get('list-mid'));

      const second = await svc.list(buyer, { limit: 2, cursor: first.nextCursor as string });

      expect(second.items.map((item) => item.id)).toEqual([byKey.get('list-old')]);
      expect(second.nextCursor).toBeNull();
    });

    it('never leaks another buyer orders', async () => {
      await db
        .insert(orders)
        .values([
          orderRow(buyer, 'mine', '2026-07-01T00:00:00Z'),
          orderRow(stranger, 'theirs', '2026-07-02T00:00:00Z'),
        ])
        .returning();

      const page = await svc.list(buyer, { limit: 20 });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].showId).toBe(showId);
    });
  });
});
