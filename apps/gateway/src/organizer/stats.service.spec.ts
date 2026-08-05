import { NotFoundException } from '@nestjs/common';

import { GatewayOrganizerStatsService } from './stats.service';

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
  byTier: [{ bandId: TIER, soldCount: 2 }],
};

/** One fake AmqpConnection, dispatching on routing key like the real broker would. */
function makeService(overrides: Record<string, unknown> = {}, showIds = [SHOW_A]) {
  const replies: Record<string, unknown> = {
    'organizer.orders.stats': ORDERS_STATS,
    'organizer.orders.latest': [],
    'organizer.shows.summaries': [
      { showId: SHOW_A, title: 'Neon Nights', capacity: 10, saleStartsAt: null },
    ],
    'organizer.shows.seatLabels': { 'seat-1': 'A1' },
    'organizer.tickets.checkedInCount': 4,
    'auth.getUsersByIds': [{ id: BUYER, email: 'buyer@x.com' }],
    'organizer.shows.bands': [{ id: TIER, name: 'VIP', tier: 'vip' }],
    ...overrides,
  };

  const request = jest.fn(({ routingKey }: { routingKey: string; payload: unknown }) => {
    if (!(routingKey in replies)) throw new Error(`no reply stubbed for ${routingKey}`);

    const reply = replies[routingKey];

    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  });

  const amqp = { request };
  const ownership = { showIds: jest.fn().mockResolvedValue(showIds) };
  return {
    svc: new GatewayOrganizerStatsService(amqp as never, ownership as never),
    amqp,
    ownership,
  };
}

describe('GatewayOrganizerStatsService.stats', () => {
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
        'organizer.shows.summaries': [
          { showId: SHOW_A, capacity: 10, saleStartsAt: null },
          { showId: SHOW_B, capacity: 5, saleStartsAt: null },
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

  it('names the tiers for a single show', async () => {
    const { svc } = makeService();

    const stats = await svc.stats('u1', { showId: SHOW_A });

    expect(stats.byTier).toEqual([{ bandId: TIER, name: 'VIP', tier: 'vip', soldCount: 2 }]);
  });

  // The console reads the organizer surface, never the buyer catalog: `shows.detail` reads a
  // whole show row to drive a 404 this caller has no use for, and 404s the drafts it authors.
  it('names them off the organizer surface, never the buyer catalog', async () => {
    const { svc, amqp } = makeService();

    await svc.stats('u1', { showId: SHOW_A });

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.shows.bands',
        payload: { showId: SHOW_A },
      }),
    );
    expect(amqp.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'user.shows.detail' }),
    );
  });

  it('degrades to an unnamed tier when the band names are unavailable', async () => {
    const { svc } = makeService({ 'organizer.shows.bands': new Error('gone') });

    const stats = await svc.stats('u1', { showId: SHOW_A });

    expect(stats.byTier).toEqual([{ bandId: TIER, name: '', tier: 'standard', soldCount: 2 }]);
  });

  // A day before the show went on sale is a zero nobody could have bought — real, but padding.
  it('clips days before a single show went on sale off its graph', async () => {
    const { svc } = makeService({
      'organizer.orders.stats': {
        ...ORDERS_STATS,
        byDay: [
          { date: '2026-06-28', revenueCents: 500, count: 1 },
          { date: '2026-06-29', revenueCents: 700, count: 1 },
          { date: '2026-06-30', revenueCents: 12000, count: 2 },
        ],
      },
      'organizer.shows.summaries': [
        { showId: SHOW_A, capacity: 10, saleStartsAt: '2026-06-30T00:00:00.000Z' },
      ],
    });

    const stats = await svc.stats('u1', { showId: SHOW_A });

    expect(stats.byDay).toEqual([{ date: '2026-06-30', revenueCents: 12000, count: 2 }]);
  });

  it('leaves a single show’s graph untouched when it has no explicit sale start', async () => {
    const { svc } = makeService();

    const stats = await svc.stats('u1', { showId: SHOW_A });

    expect(stats.byDay).toEqual(ORDERS_STATS.byDay);
  });

  // No single sale-start date to anchor several shows to, so the scope that reports one is
  // ignored across every show rather than clipping the graph to whichever show sold first.
  it('leaves the graph untouched across every show, whatever their sale starts', async () => {
    const { svc } = makeService(
      {
        'organizer.shows.summaries': [
          { showId: SHOW_A, capacity: 10, saleStartsAt: '2030-01-01T00:00:00.000Z' },
          { showId: SHOW_B, capacity: 5, saleStartsAt: null },
        ],
      },
      [SHOW_A, SHOW_B],
    );

    const stats = await svc.stats('u1', {});

    expect(stats.byDay).toEqual(ORDERS_STATS.byDay);
  });

  // The sale start rides along on the batched capacity call — reading one nullable timestamp
  // must not cost its own round trip into Shows.
  it('never asks Shows for the show a second time to learn its sale start', async () => {
    const { svc, amqp } = makeService();

    await svc.stats('u1', { showId: SHOW_A });

    expect(amqp.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'organizer.shows.get' }),
    );
  });
});

describe('GatewayOrganizerStatsService.recentOrders', () => {
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
      'organizer.orders.latest': [recentRow, { ...recentRow, id: 'o2' }],
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
    expect(emailCalls[0][0].payload).toEqual({ ids: [BUYER] });
  });

  // `summaries` runs a four-join capacity aggregate; batching avoids one call per row.
  it('asks Shows for every title on the page in one batched call', async () => {
    const { svc, amqp } = makeService({
      'organizer.orders.latest': [recentRow, { ...recentRow, id: 'o2', showId: SHOW_B }],
    });

    await svc.recentOrders('u1', 10);

    const summaryCalls = amqp.request.mock.calls.filter(
      ([args]) => args.routingKey === 'organizer.shows.summaries',
    );

    expect(summaryCalls).toHaveLength(1);
    expect(summaryCalls[0][0].payload).toEqual({ showIds: [SHOW_A, SHOW_B] });
  });

  it('degrades a missing buyer to null rather than dropping the order', async () => {
    const { svc } = makeService({
      'organizer.orders.latest': [recentRow],
      'auth.getUsersByIds': [],
    });

    const page = await svc.recentOrders('u1', 10);

    expect(page.items[0].buyerEmail).toBeNull();
  });

  // The show context is resolved over the *organizer* keys, never the buyer's: `user.shows.detail`
  // 404s a draft, and it would haul back a whole venue's geometry for two seat labels.
  it('resolves titles and seat labels over the organizer surface', async () => {
    const { svc, amqp } = makeService({ 'organizer.orders.latest': [recentRow] });

    await svc.recentOrders('u1', 10);

    const keys = amqp.request.mock.calls.map(([args]) => args.routingKey);

    expect(keys).toContain('organizer.shows.seatLabels');
    expect(keys.filter((key: string) => key.startsWith('user.'))).toEqual([]);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.shows.seatLabels',
        payload: { showId: SHOW_A, seatIds: ['seat-1'] },
      }),
    );
  });

  it('keeps the "Unavailable show" fallback when the show cannot be resolved', async () => {
    const { svc } = makeService({
      'organizer.orders.latest': [recentRow],
      'organizer.shows.summaries': new Error('gone'),
    });

    const page = await svc.recentOrders('u1', 10);

    expect(page.items[0].showTitle).toBe('Unavailable show');
  });

  it('returns an empty page for an organizer with no shows, asking nobody', async () => {
    const { svc, amqp } = makeService({}, []);

    await expect(svc.recentOrders('u1', 10)).resolves.toEqual({ items: [] });
    expect(amqp.request).not.toHaveBeenCalled();
  });
});
