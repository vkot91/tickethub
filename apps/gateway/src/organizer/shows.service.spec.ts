import { NotFoundException } from '@nestjs/common';

import { OrganizerShowsService } from './shows.service';

function makeService(showIds: string[]) {
  const amqp = { request: jest.fn().mockResolvedValue(showIds) };
  return { svc: new OrganizerShowsService(amqp as never), amqp };
}

describe('OrganizerShowsService', () => {
  it('resolves the caller’s show ids over RPC', async () => {
    const { svc, amqp } = makeService(['s1', 's2']);

    await expect(svc.showIds('u1')).resolves.toEqual(['s1', 's2']);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.profile.showIds',
        payload: { userId: 'u1' },
      }),
    );
  });

  it('returns the id list when the show is owned', async () => {
    const { svc } = makeService(['s1', 's2']);

    await expect(svc.assertOwnsShow('u1', 's2')).resolves.toEqual(['s1', 's2']);
  });

  it('404s on someone else’s show rather than leaking its existence', async () => {
    const { svc } = makeService(['s1']);

    await expect(svc.assertOwnsShow('u1', 'other')).rejects.toThrow(NotFoundException);
  });
});

describe('OrganizerShowsService.listWithSales', () => {
  const row = (over: Partial<{ id: string; status: string }>) => ({
    id: 'x',
    status: 'published',
    soldCount: 0,
    capacity: 0,
    revenueCents: 0,
    ...over,
  });

  /** Routes each routing key to a canned answer, and records what was asked. */
  function makeMerging(answers: Record<string, unknown>) {
    const amqp = {
      request: jest.fn(({ routingKey }: { routingKey: string }) =>
        Promise.resolve(answers[routingKey]),
      ),
    };
    return { svc: new OrganizerShowsService(amqp as never), amqp };
  }

  it('merges sales and capacity onto the rows', async () => {
    const { svc } = makeMerging({
      'organizer.shows.myShows': [row({ id: 's1' })],
      'organizer.orders.salesByShow': [{ showId: 's1', soldCount: 2, revenueCents: 9000 }],
      'organizer.shows.capacity': [{ showId: 's1', capacity: 40 }],
    });

    await expect(svc.listWithSales('u1', {})).resolves.toEqual([
      expect.objectContaining({ id: 's1', soldCount: 2, revenueCents: 9000, capacity: 40 }),
    ]);
  });

  // A draft has sold nothing by definition; asking Orders about it is two round trips for a
  // guaranteed zero — and the table renders `—` for it either way.
  it('asks only about the shows that were on sale', async () => {
    const { svc, amqp } = makeMerging({
      'organizer.shows.myShows': [row({ id: 'd1', status: 'draft' }), row({ id: 's1' })],
      'organizer.orders.salesByShow': [],
      'organizer.shows.capacity': [],
    });

    await svc.listWithSales('u1', {});

    for (const key of ['organizer.orders.salesByShow', 'organizer.shows.capacity']) {
      expect(amqp.request).toHaveBeenCalledWith(
        expect.objectContaining({ routingKey: key, payload: { showIds: ['s1'] } }),
      );
    }
  });

  it('skips the fan-out entirely when every show is a draft', async () => {
    const { svc, amqp } = makeMerging({
      'organizer.shows.myShows': [row({ id: 'd1', status: 'draft' })],
    });

    await expect(svc.listWithSales('u1', {})).resolves.toHaveLength(1);
    expect(amqp.request).toHaveBeenCalledTimes(1);
  });

  // A row the RPCs answer nothing for still renders — at zero, not missing.
  it('zeroes a show the fan-out has no answer for', async () => {
    const { svc } = makeMerging({
      'organizer.shows.myShows': [row({ id: 's1' })],
      'organizer.orders.salesByShow': [],
      'organizer.shows.capacity': [],
    });

    await expect(svc.listWithSales('u1', {})).resolves.toEqual([
      expect.objectContaining({ id: 's1', soldCount: 0, revenueCents: 0, capacity: 0 }),
    ]);
  });

  it('passes the status filter through to myShows', async () => {
    const { svc, amqp } = makeMerging({ 'organizer.shows.myShows': [] });

    await svc.listWithSales('u1', { status: 'published' });

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { userId: 'u1', status: 'published' } }),
    );
  });
});
