import { NotFoundException } from '@nestjs/common';
import { OrganizerStatsService } from './stats.service';

const SHOW_A = '11111111-1111-4111-8111-111111111111';
const SHOW_B = '22222222-2222-4222-8222-222222222222';
const TIER = '33333333-3333-4333-8333-333333333333';
const BUYER = '44444444-4444-4444-8444-444444444444';
const ORDER = '55555555-5555-4555-8555-555555555555';

const ORDERS_STATS = {
  soldCount: 2,
  revenueCents: 12000,
  refundedCents: 3000,
  byDay: [{ date: '2026-07-01', revenueCents: 12000, count: 2 }],
  byTier: [{ ticketTypeId: TIER, soldCount: 2 }],
};

/** One fake AmqpConnection, dispatching on routing key like the real broker would. */
function makeService(overrides: Record<string, unknown> = {}, showIds = [SHOW_A]) {
  const replies: Record<string, unknown> = {
    'orders.stats': ORDERS_STATS,
    'orders.recent': [],
    'organizer.capacity': [{ showId: SHOW_A, capacity: 10 }],
    'tickets.checkedInCount': 4,
    'auth.getUsersByIds': [{ id: BUYER, email: 'buyer@x.com' }],
    'shows.detail': {
      title: 'Neon Nights',
      priceTiers: [{ id: TIER, name: 'VIP', tier: 'vip', priceCents: 6000, currency: 'usd' }],
    },
    ...overrides,
  };

  const request = jest.fn(({ routingKey }: { routingKey: string; payload: unknown }) => {
    if (!(routingKey in replies)) throw new Error(`no reply stubbed for ${routingKey}`);

    const reply = replies[routingKey];

    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  });

  const amqp = { request };
  const myShows = { showIds: jest.fn().mockResolvedValue(showIds) };
  const showContext = {
    withShowContext: jest.fn((items: { seats: { seatId: string }[] }[]) =>
      Promise.resolve(
        items.map((item) => ({ ...item, showTitle: 'Neon Nights', seatLabels: ['A1'] })),
      ),
    ),
  };

  return {
    svc: new OrganizerStatsService(amqp as never, myShows as never, showContext as never),
    amqp,
    myShows,
    showContext,
  };
}

describe('OrganizerStatsService.stats', () => {
  it('short-circuits to zeros for an organizer with no shows, asking nobody', async () => {
    const { svc, amqp } = makeService({}, []);

    await expect(svc.stats('u1', {})).resolves.toEqual({
      soldCount: 0,
      capacity: 0,
      revenueCents: 0,
      refundedCents: 0,
      checkedInCount: 0,
      byDay: [],
      byTier: [],
    });
    expect(amqp.request).not.toHaveBeenCalled();
  });

  it('merges orders, capacity and check-ins into one answer', async () => {
    const { svc } = makeService();

    await expect(svc.stats('u1', {})).resolves.toMatchObject({
      soldCount: 2,
      capacity: 10,
      revenueCents: 12000,
      refundedCents: 3000,
      checkedInCount: 4,
    });
  });

  it('sums capacity across every show when no showId is given', async () => {
    const { svc } = makeService(
      {
        'organizer.capacity': [
          { showId: SHOW_A, capacity: 10 },
          { showId: SHOW_B, capacity: 5 },
        ],
      },
      [SHOW_A, SHOW_B],
    );

    await expect(svc.stats('u1', {})).resolves.toMatchObject({ capacity: 15 });
  });

  // Ownership is checked before the empty short-circuit: an organizer who owns nothing asking
  // about someone else's show is still a 404, not a polite page of zeros.
  it('404s on a showId the caller does not own, even owning no shows at all', async () => {
    const { svc } = makeService({}, []);

    await expect(svc.stats('u1', { showId: SHOW_B })).rejects.toThrow(NotFoundException);
  });

  it('404s on a showId the caller does not own', async () => {
    const { svc } = makeService({}, [SHOW_A]);

    await expect(svc.stats('u1', { showId: SHOW_B })).rejects.toThrow(NotFoundException);
  });

  it('names the tiers from the show detail for a single show', async () => {
    const { svc } = makeService();

    const stats = await svc.stats('u1', { showId: SHOW_A });

    expect(stats.byTier).toEqual([{ ticketTypeId: TIER, name: 'VIP', tier: 'vip', soldCount: 2 }]);
  });

  it('degrades to an unnamed tier when the show detail is unavailable', async () => {
    const { svc } = makeService({ 'shows.detail': new Error('gone') });

    const stats = await svc.stats('u1', { showId: SHOW_A });

    expect(stats.byTier).toEqual([
      { ticketTypeId: TIER, name: '', tier: 'standard', soldCount: 2 },
    ]);
  });
});

describe('OrganizerStatsService.recentOrders', () => {
  const recentRow = {
    id: ORDER,
    showId: SHOW_A,
    userId: BUYER,
    seatIds: ['seat-1'],
    totalCents: 6000,
    status: 'paid',
    createdAt: '2026-07-01T10:00:00.000Z',
  };

  it('resolves buyer emails in exactly one call for the whole page', async () => {
    const { svc, amqp } = makeService({
      'orders.recent': [recentRow, { ...recentRow, id: 'o2' }],
    });

    const page = await svc.recentOrders('u1', 10);

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: ORDER,
      buyerEmail: 'buyer@x.com',
      showTitle: 'Neon Nights',
      seatLabels: ['A1'],
      totalCents: 6000,
      status: 'paid',
    });

    const emailCalls = amqp.request.mock.calls.filter(
      ([args]) => args.routingKey === 'auth.getUsersByIds',
    );
    expect(emailCalls).toHaveLength(1);
    // De-duplicated: two orders by the same buyer is one id on the wire.
    expect(emailCalls[0][0].payload).toEqual({ ids: [BUYER] });
  });

  it('degrades a missing buyer to null rather than dropping the order', async () => {
    const { svc } = makeService({
      'orders.recent': [recentRow],
      'auth.getUsersByIds': [],
    });

    const page = await svc.recentOrders('u1', 10);

    expect(page.items[0].buyerEmail).toBeNull();
  });

  it('keeps the "Unavailable show" fallback from the shared show context', async () => {
    const { svc, showContext } = makeService({ 'orders.recent': [recentRow] });
    showContext.withShowContext.mockResolvedValueOnce([
      { ...recentRow, seats: [], showTitle: 'Unavailable show', seatLabels: [] },
    ]);

    const page = await svc.recentOrders('u1', 10);

    expect(page.items[0].showTitle).toBe('Unavailable show');
  });

  it('returns an empty page for an organizer with no shows, asking nobody', async () => {
    const { svc, amqp } = makeService({}, []);

    await expect(svc.recentOrders('u1', 10)).resolves.toEqual({ items: [] });
    expect(amqp.request).not.toHaveBeenCalled();
  });
});
