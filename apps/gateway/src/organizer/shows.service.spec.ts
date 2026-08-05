import { GatewayOrganizerShowsService } from './shows.service';

describe('GatewayOrganizerShowsService.listWithSales', () => {
  const row = (over: Partial<{ id: string; status: string }>) => ({
    id: 'x',
    status: 'published',
    soldCount: 0,
    capacity: 0,
    revenueCents: 0,
    ...over,
  });

  function makeMerging(answers: Record<string, unknown>) {
    const amqp = {
      request: jest.fn(({ routingKey }: { routingKey: string }) =>
        Promise.resolve(answers[routingKey]),
      ),
    };
    return { svc: new GatewayOrganizerShowsService(amqp as never), amqp };
  }

  it('merges sales and capacity onto the rows', async () => {
    const { svc } = makeMerging({
      'organizer.shows.list': [row({ id: 's1' })],
      'organizer.orders.salesByShow': [{ showId: 's1', soldCount: 2, revenueCents: 9000 }],
      'organizer.shows.summaries': [{ showId: 's1', capacity: 40 }],
    });

    await expect(svc.listWithSales('u1', {})).resolves.toEqual([
      expect.objectContaining({ id: 's1', soldCount: 2, revenueCents: 9000, capacity: 40 }),
    ]);
  });

  it('asks only about the shows that were on sale', async () => {
    const { svc, amqp } = makeMerging({
      'organizer.shows.list': [row({ id: 'd1', status: 'draft' }), row({ id: 's1' })],
      'organizer.orders.salesByShow': [],
      'organizer.shows.summaries': [],
    });

    await svc.listWithSales('u1', {});

    for (const key of ['organizer.orders.salesByShow', 'organizer.shows.summaries']) {
      expect(amqp.request).toHaveBeenCalledWith(
        expect.objectContaining({ routingKey: key, payload: { showIds: ['s1'] } }),
      );
    }
  });

  it('skips the fan-out entirely when every show is a draft', async () => {
    const { svc, amqp } = makeMerging({
      'organizer.shows.list': [row({ id: 'd1', status: 'draft' })],
    });

    await expect(svc.listWithSales('u1', {})).resolves.toHaveLength(1);
    expect(amqp.request).toHaveBeenCalledTimes(1);
  });

  it('zeroes a show the fan-out has no answer for', async () => {
    const { svc } = makeMerging({
      'organizer.shows.list': [row({ id: 's1' })],
      'organizer.orders.salesByShow': [],
      'organizer.shows.summaries': [],
    });

    await expect(svc.listWithSales('u1', {})).resolves.toEqual([
      expect.objectContaining({ id: 's1', soldCount: 0, revenueCents: 0, capacity: 0 }),
    ]);
  });

  it('passes the status filter through to the shows RPC', async () => {
    const { svc, amqp } = makeMerging({ 'organizer.shows.list': [] });

    await svc.listWithSales('u1', { status: 'published' });

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { userId: 'u1', status: 'published' } }),
    );
  });
});
