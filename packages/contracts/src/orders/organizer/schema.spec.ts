import { orderStatsSchema, recentOrderRowSchema } from './schema';
import { ORGANIZER_ORDERS_MESSAGE_PATTERNS } from './wire';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('organizer orders wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS).toBe('organizer.orders.stats');
    expect(ORGANIZER_ORDERS_MESSAGE_PATTERNS.LATEST).toBe('organizer.orders.latest');
  });
});

describe('orderStatsSchema', () => {
  it('parses what Orders alone answers — no capacity, no tier names', () => {
    const stats = {
      soldCount: 12,
      revenueCents: 24_000,
      refundedCents: 0,
      byDay: [{ date: '2026-07-01', revenueCents: 24_000, count: 12 }],
      byTier: [{ bandId: UUID, soldCount: 12 }],
    };

    expect(orderStatsSchema.parse(stats)).toEqual(stats);
  });

  it('rejects a fractional cent amount', () => {
    expect(() =>
      orderStatsSchema.parse({
        soldCount: 1,
        revenueCents: 10.5,
        refundedCents: 0,
        byDay: [],
        byTier: [],
      }),
    ).toThrow();
  });
});

describe('recentOrderRowSchema', () => {
  it('parses a raw order row as Orders knows it', () => {
    const row = {
      id: UUID,
      showId: UUID,
      userId: UUID,
      seatIds: ['seat-1'],
      totalCents: 2_000,
      status: 'paid',
      createdAt: '2026-07-01T00:00:00.000Z',
    };

    expect(recentOrderRowSchema.parse(row)).toEqual(row);
  });

  it('rejects an unknown order status', () => {
    expect(() =>
      recentOrderRowSchema.parse({
        id: UUID,
        showId: UUID,
        userId: UUID,
        seatIds: [],
        totalCents: 0,
        status: 'exploded',
        createdAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
