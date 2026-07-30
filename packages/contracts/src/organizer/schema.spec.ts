import {
  becomeOrganizerSchema,
  orderStatsSchema,
  recentOrderRowSchema,
  recentOrdersSchema,
  showStatsQuerySchema,
  showStatsSchema,
} from './schema';
import { ORGANIZER_MESSAGE_PATTERNS } from './wire';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('organizer wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_MESSAGE_PATTERNS.CREATE).toBe('organizer.create');
    expect(ORGANIZER_MESSAGE_PATTERNS.CAPACITY).toBe('organizer.capacity');
  });
});

describe('organizer contracts', () => {
  it('requires a non-empty organizer name', () => {
    expect(becomeOrganizerSchema.parse({ name: 'Acme' })).toEqual({ name: 'Acme' });
    expect(() => becomeOrganizerSchema.parse({ name: '' })).toThrow();
  });

  it('treats every stats filter as optional', () => {
    expect(showStatsQuerySchema.parse({})).toEqual({});
    expect(showStatsQuerySchema.parse({ showId: UUID, from: '2026-07-01T00:00:00.000Z' })).toEqual({
      showId: UUID,
      from: '2026-07-01T00:00:00.000Z',
    });
  });

  it('rejects a from/to that is not a datetime', () => {
    expect(() => showStatsQuerySchema.parse({ from: '2026-07-01' })).toThrow();
  });

  it('parses the merged dashboard stats', () => {
    const stats = {
      soldCount: 12,
      capacity: 100,
      revenueCents: 24_000,
      refundedCents: 0,
      checkedInCount: 3,
      byDay: [{ date: '2026-07-01', revenueCents: 24_000, count: 12 }],
      byTier: [{ ticketTypeId: UUID, name: 'Stalls', tier: 'standard', soldCount: 12 }],
    };

    expect(showStatsSchema.parse(stats)).toEqual(stats);
  });

  it('parses what Orders alone answers — no capacity, no tier names', () => {
    const stats = {
      soldCount: 12,
      revenueCents: 24_000,
      refundedCents: 0,
      byDay: [{ date: '2026-07-01', revenueCents: 24_000, count: 12 }],
      byTier: [{ ticketTypeId: UUID, soldCount: 12 }],
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

  it('allows a null buyer email — a deleted buyer must not drop the row', () => {
    const page = {
      items: [
        {
          id: UUID,
          showTitle: 'Hamlet',
          buyerEmail: null,
          seatLabels: ['A2'],
          totalCents: 2_000,
          status: 'paid',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    };

    expect(recentOrdersSchema.parse(page)).toEqual(page);
  });
});
