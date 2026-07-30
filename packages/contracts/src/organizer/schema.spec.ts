import {
  becomeOrganizerSchema,
  recentOrdersSchema,
  showStatsQuerySchema,
  showStatsSchema,
} from './schema';
import { ORGANIZER_PROFILE_MESSAGE_PATTERNS } from './wire';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('organizer profile wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_PROFILE_MESSAGE_PATTERNS.CREATE).toBe('organizer.profile.create');
    expect(ORGANIZER_PROFILE_MESSAGE_PATTERNS.SHOW_IDS).toBe('organizer.profile.showIds');
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
