import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { createDb, orders, seatReservations, type Db } from '@tickethub/db';
import { seed } from '@tickethub/db/seed';
import { loadEnv, requireEnv } from '@tickethub/env';

import { OrdersService } from './orders.service';

jest.setTimeout(30_000);

// The assertion a mocked repository cannot make: that the SQL predicate classifies every real
// seat condition correctly. Seat ids are synthetic UUIDs on purpose — `seat_reservations.seat_id`
// is a logical reference to `shows.seats` with no FK, and what is under test here is the
// predicate, not referential integrity.
describe('OrdersService.seatStatus (integration: real Postgres)', () => {
  let db: Db;
  let service: OrdersService;
  let showId: string;
  let bandId: string;

  beforeAll(async () => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));

    const ids = await seed(db);
    showId = ids.flashShowId;
    bandId = ids.flashBandId;

    // Only the query is under test — no other dependency is reachable from seatStatus.
    service = new OrdersService(db, null as never, null as never, null as never, 600);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate ${seatReservations}, ${orders} restart identity cascade`);
  });

  async function reserve(
    seatId: string,
    status: 'held' | 'confirmed' | 'released',
    expiresAt: Date,
  ) {
    const [order] = await db
      .insert(orders)
      .values({
        userId: randomUUID(),
        showId,
        idempotencyKey: `idem-${seatId}-${status}`,
        totalCents: 5000,
        expiresAt,
      })
      .returning();

    await db.insert(seatReservations).values({ orderId: order.id, showId, seatId, bandId, status });
  }

  it('classifies held, confirmed, released and unreserved seats', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 600_000);

    const [heldSeat, confirmedSeat, releasedSeat, freeSeat] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];

    await reserve(heldSeat, 'held', future);
    await reserve(confirmedSeat, 'confirmed', past);
    await reserve(releasedSeat, 'released', past);

    const statuses = await service.seatStatus(showId);

    expect(statuses[heldSeat]).toBe('held');
    expect(statuses[confirmedSeat]).toBe('sold');
    expect(statuses[releasedSeat]).toBeUndefined();
    expect(statuses[freeSeat]).toBeUndefined();
  });

  it('keeps a hold past its expiry held, because the release job has not run yet', async () => {
    const seatId = randomUUID();

    await reserve(seatId, 'held', new Date(Date.now() - 60_000));

    await expect(service.seatStatus(showId)).resolves.toEqual({ [seatId]: 'held' });
  });

  it('ignores reservations belonging to another show', async () => {
    const seatId = randomUUID();

    await reserve(seatId, 'held', new Date(Date.now() + 600_000));

    await expect(service.seatStatus(randomUUID())).resolves.toEqual({});
  });
});
