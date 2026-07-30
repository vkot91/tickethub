import { BadRequestException } from '@nestjs/common';
import { GatewayUserOrdersController } from './orders.controller';
import { ShowContextService } from '../shared/show-context.service';

// The merge moved into ShowContextService in the audience reshuffle; the controller now
// composes it. Same amqp double, same assertions — only the wiring changed.
const controller = (amqp: unknown) =>
  new GatewayUserOrdersController(amqp as never, new ShowContextService(amqp as never));

const amqp = { request: jest.fn().mockResolvedValue({ id: 'ord1' }) };

const dto = {
  showId: '00000000-0000-0000-0000-000000000001',
  seats: [
    {
      seatId: '00000000-0000-0000-0000-000000000002',
      ticketTypeId: '00000000-0000-0000-0000-000000000003',
    },
  ],
};

describe('GatewayUserOrdersController', () => {
  it('forwards create with the authenticated user id, idempotency key, and dto', async () => {
    const ctrl = controller(amqp);
    const req = { user: { id: 'u1' }, headers: { 'idempotency-key': 'k1' } };
    await ctrl.create(req as never, dto as never);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'orders.create',
        payload: { userId: 'u1', idempotencyKey: 'k1', dto },
      }),
    );
  });

  it('rejects a missing idempotency key', async () => {
    const ctrl = controller(amqp);
    const req = { user: { id: 'u1' }, headers: {} };
    expect(() => ctrl.create(req as never, dto as never)).toThrow(BadRequestException);
  });

  it('forwards get with the authenticated user id', async () => {
    const ctrl = controller(amqp);
    await ctrl.get({ user: { id: 'u1' } } as never, 'ord1');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'orders.get',
        payload: { userId: 'u1', orderId: 'ord1' },
      }),
    );
  });

  describe('list', () => {
    const SHOW_ID = '00000000-0000-0000-0000-0000000000aa';

    const summary = {
      id: 'ord1',
      showId: SHOW_ID,
      status: 'paid',
      totalCents: 10000,
      currency: 'usd',
      expiresAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      seats: [
        { seatId: 'seat1', ticketTypeId: 'tt1' },
        { seatId: 'seat2', ticketTypeId: 'tt1' },
      ],
    };

    const seatMap = {
      showId: SHOW_ID,
      sections: [
        {
          id: 'sec1',
          name: 'Parterre',
          rows: [
            {
              id: 'row1',
              number: 1,
              seats: [
                { id: 'seat1', number: 1, ticketTypeId: 'tt1', priceCents: 5000 },
                { id: 'seat2', number: 2, ticketTypeId: 'tt1', priceCents: 5000 },
              ],
            },
          ],
        },
      ],
    };

    /** Answers each routing key the list path fans out to. */
    function gateway(page: unknown, showsReply: (routingKey: string) => unknown) {
      return {
        request: jest.fn(({ routingKey }: { routingKey: string }) =>
          routingKey === 'orders.list' ? Promise.resolve(page) : showsReply(routingKey),
        ),
      };
    }

    const shows = (routingKey: string) =>
      Promise.resolve(routingKey === 'shows.detail' ? { title: 'Demo Concert' } : seatMap);

    it('adds the show title and seat labels from Shows', async () => {
      const amqpList = gateway({ items: [summary], nextCursor: null }, shows);
      const ctrl = controller(amqpList);

      const res = await ctrl.list({ user: { id: 'u1' } } as never, { limit: '20' });

      expect(res).toEqual({
        // Section-prefixed: the one seat-label format, shared with the ticket the gate scans.
        items: [
          { ...summary, showTitle: 'Demo Concert', seatLabels: ['Parterre A1', 'Parterre A2'] },
        ],
        nextCursor: null,
      });
      expect(amqpList.request).toHaveBeenCalledWith(
        expect.objectContaining({
          routingKey: 'orders.list',
          payload: { userId: 'u1', query: { limit: 20 } },
        }),
      );
    });

    it('asks Shows once per distinct show, not once per order', async () => {
      const page = { items: [summary, { ...summary, id: 'ord2' }], nextCursor: null };
      const amqpList = gateway(page, shows);
      const ctrl = controller(amqpList);

      await ctrl.list({ user: { id: 'u1' } } as never, {});

      const detailCalls = amqpList.request.mock.calls.filter(
        ([{ routingKey }]: [{ routingKey: string }]) => routingKey === 'shows.detail',
      );

      expect(detailCalls).toHaveLength(1);
    });

    it('still renders the page when the show is gone', async () => {
      const amqpList = gateway({ items: [summary], nextCursor: null }, () =>
        Promise.reject(new Error('Show not found')),
      );
      const ctrl = controller(amqpList);

      const res = await ctrl.list({ user: { id: 'u1' } } as never, {});

      expect(res.items[0].showTitle).toBe('Unavailable show');
      expect(res.items[0].seatLabels).toEqual([]);
    });

    it('rejects a limit outside the allowed range', async () => {
      const ctrl = controller(amqp);

      await expect(ctrl.list({ user: { id: 'u1' } } as never, { limit: '999' })).rejects.toThrow();
    });
  });

  it('forwards refund with the authenticated user id', async () => {
    const ctrl = controller(amqp);
    await ctrl.requestRefund({ user: { id: 'u1' } } as never, 'ord1');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'orders.requestRefund',
        payload: { userId: 'u1', orderId: 'ord1' },
      }),
    );
  });
});
