import { recentOrdersSchema, showStatsQuerySchema, showStatsSchema } from './schema';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('gateway organizer contracts', () => {
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
      byTier: [{ bandId: UUID, name: 'Stalls', tier: 'standard', soldCount: 12 }],
    };

    expect(showStatsSchema.parse(stats)).toEqual(stats);
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
