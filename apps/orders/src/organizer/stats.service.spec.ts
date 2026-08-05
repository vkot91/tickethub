import { orders, seatReservations } from '@tickethub/db';
import { getTestDb, seedShowGraph, seedUser, type TestDb } from '@tickethub/db/testing';

import { OrganizerStatsService } from './stats.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: OrganizerStatsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerStatsService(db);
});

const throwOnRead = () => {
  throw new Error('salesByShow must not query for an empty showIds');
};

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** One order with one confirmed-or-otherwise reservation, on a given day. */
async function seedOrder(opts: {
  showId: string;
  ticketTypeId: string;
  status: 'paid' | 'refunded' | 'awaiting_payment';
  totalCents: number;
  createdAt: Date;
  seatId: string;
  seatStatus?: 'confirmed' | 'held' | 'released';
}) {
  const buyer = await seedUser(db);

  const [order] = await db
    .insert(orders)
    .values({
      userId: buyer.id,
      showId: opts.showId,
      status: opts.status,
      idempotencyKey: `key-${opts.seatId}`,
      totalCents: opts.totalCents,
      expiresAt: opts.createdAt,
      createdAt: opts.createdAt,
    })
    .returning();

  await db.insert(seatReservations).values({
    orderId: order.id,
    showId: opts.showId,
    seatId: opts.seatId,
    ticketTypeId: opts.ticketTypeId,
    status: opts.seatStatus ?? 'confirmed',
  });

  return { order, buyer };
}

describe('OrganizerStatsService.stats', () => {
  // The rule the whole slice hangs on: no shows must never fall through to an unfiltered
  // aggregate that hands one organizer the whole platform's revenue.
  it('returns zeros for an empty showIds, without reading anything', async () => {
    const { show, ticketType } = await seedShowGraph(db);
    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'paid',
      totalCents: 5000,
      createdAt: day('2026-07-10'),
      seatId: show.id, // any uuid; seat rows aren't joined here
    });

    await expect(svc.stats({ showIds: [] })).resolves.toEqual({
      soldCount: 0,
      revenueCents: 0,
      refundedCents: 0,
      byDay: [],
      byTier: [],
    });
  });

  it('counts a refunded order in refundedCents and not in revenueCents', async () => {
    const { show, ticketType } = await seedShowGraph(db);

    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'paid',
      totalCents: 5000,
      createdAt: day('2026-07-10'),
      seatId: '11111111-1111-1111-1111-111111111111',
    });
    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'refunded',
      totalCents: 3000,
      createdAt: day('2026-07-10'),
      seatId: '22222222-2222-2222-2222-222222222222',
      seatStatus: 'released',
    });

    const stats = await svc.stats({ showIds: [show.id] });

    expect(stats.revenueCents).toBe(5000);
    expect(stats.refundedCents).toBe(3000);
    // Only the confirmed reservation counts as sold.
    expect(stats.soldCount).toBe(1);
  });

  it('fills zero days across the whole window', async () => {
    const { show, ticketType } = await seedShowGraph(db);

    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'paid',
      totalCents: 5000,
      createdAt: day('2026-07-02'),
      seatId: '33333333-3333-3333-3333-333333333333',
    });

    const stats = await svc.stats({
      showIds: [show.id],
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-03T23:59:59.000Z',
    });

    expect(stats.byDay).toEqual([
      { date: '2026-07-01', revenueCents: 0, count: 0 },
      { date: '2026-07-02', revenueCents: 5000, count: 1 },
      { date: '2026-07-03', revenueCents: 0, count: 0 },
    ]);
  });

  it('groups confirmed reservations by ticket type', async () => {
    const { show, ticketType } = await seedShowGraph(db);

    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'paid',
      totalCents: 5000,
      createdAt: day('2026-07-02'),
      seatId: '44444444-4444-4444-4444-444444444444',
    });

    const stats = await svc.stats({ showIds: [show.id] });

    expect(stats.byTier).toEqual([{ ticketTypeId: ticketType!.id, soldCount: 1 }]);
  });

  it('ignores shows the caller does not own', async () => {
    const mine = await seedShowGraph(db);
    const theirs = await seedShowGraph(db);

    await seedOrder({
      showId: theirs.show.id,
      ticketTypeId: theirs.ticketType!.id,
      status: 'paid',
      totalCents: 9900,
      createdAt: day('2026-07-02'),
      seatId: '55555555-5555-5555-5555-555555555555',
    });

    const stats = await svc.stats({ showIds: [mine.show.id] });

    expect(stats.revenueCents).toBe(0);
    expect(stats.soldCount).toBe(0);
  });
});

describe('OrganizerStatsService.salesByShow', () => {
  // Same rule as `stats`, and the one that matters most here: an unfiltered group-by would hand
  // one organizer every show on the platform.
  it('returns nothing for an empty showIds, without reading anything', async () => {
    const exploding = { select: () => throwOnRead() } as never;

    await expect(
      new OrganizerStatsService(exploding).salesByShow({ showIds: [] }),
    ).resolves.toEqual([]);
  });

  it('keeps a show with no sales in the list, at zero', async () => {
    const sold = await seedShowGraph(db);
    const quiet = await seedShowGraph(db);

    await seedOrder({
      showId: sold.show.id,
      ticketTypeId: sold.ticketType!.id,
      status: 'paid',
      totalCents: 4500,
      createdAt: day('2026-07-10'),
      seatId: '11111111-2222-3333-4444-555555555555',
    });

    await expect(svc.salesByShow({ showIds: [sold.show.id, quiet.show.id] })).resolves.toEqual([
      { showId: sold.show.id, soldCount: 1, revenueCents: 4500 },
      { showId: quiet.show.id, soldCount: 0, revenueCents: 0 },
    ]);
  });

  // The test that catches `stats` and `salesByShow` drifting apart on what "revenue" means.
  it('excludes a refunded order from revenueCents', async () => {
    const { show, ticketType } = await seedShowGraph(db);

    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'paid',
      totalCents: 2000,
      createdAt: day('2026-07-10'),
      seatId: '11111111-1111-1111-1111-111111111111',
    });
    await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'refunded',
      totalCents: 9000,
      createdAt: day('2026-07-11'),
      seatId: '22222222-2222-2222-2222-222222222222',
    });

    const [row] = await svc.salesByShow({ showIds: [show.id] });

    expect(row.revenueCents).toBe(2000);
  });
});

describe('OrganizerStatsService.recent', () => {
  it('returns the newest orders for those shows, with their seat ids and buyer', async () => {
    const { show, ticketType } = await seedShowGraph(db);

    const older = await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'paid',
      totalCents: 5000,
      createdAt: day('2026-07-01'),
      seatId: '66666666-6666-6666-6666-666666666666',
    });
    const newer = await seedOrder({
      showId: show.id,
      ticketTypeId: ticketType!.id,
      status: 'refunded',
      totalCents: 7000,
      createdAt: day('2026-07-05'),
      seatId: '77777777-7777-7777-7777-777777777777',
    });

    const items = await svc.recent({ showIds: [show.id] });

    expect(items.map((item) => item.id)).toEqual([newer.order.id, older.order.id]);
    expect(items[0]).toMatchObject({
      userId: newer.buyer.id,
      showId: show.id,
      totalCents: 7000,
      status: 'refunded',
      seatIds: ['77777777-7777-7777-7777-777777777777'],
    });
  });

  it('returns nothing for an empty showIds', async () => {
    await expect(svc.recent({ showIds: [] })).resolves.toEqual([]);
  });

  it('honours the limit', async () => {
    const { show, ticketType } = await seedShowGraph(db);

    for (const n of [1, 2, 3]) {
      await seedOrder({
        showId: show.id,
        ticketTypeId: ticketType!.id,
        status: 'paid',
        totalCents: 1000 * n,
        createdAt: day(`2026-07-0${n}`),
        seatId: `8888888${n}-8888-8888-8888-888888888888`,
      });
    }

    await expect(svc.recent({ showIds: [show.id], limit: 2 })).resolves.toHaveLength(2);
  });
});
