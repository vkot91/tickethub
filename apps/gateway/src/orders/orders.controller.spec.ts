import { BadRequestException } from '@nestjs/common';
import { GatewayOrdersController } from './orders.controller';

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

describe('GatewayOrdersController', () => {
  it('forwards create with the authenticated user id, idempotency key, and dto', async () => {
    const ctrl = new GatewayOrdersController(amqp as never);
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
    const ctrl = new GatewayOrdersController(amqp as never);
    const req = { user: { id: 'u1' }, headers: {} };
    expect(() => ctrl.create(req as never, dto as never)).toThrow(BadRequestException);
  });

  it('forwards get with the authenticated user id', async () => {
    const ctrl = new GatewayOrdersController(amqp as never);
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
      const ctrl = new GatewayOrdersController(amqpList as never);

      const res = await ctrl.list({ user: { id: 'u1' } } as never, { limit: '20' });

      expect(res).toEqual({
        items: [{ ...summary, showTitle: 'Demo Concert', seatLabels: ['A1', 'A2'] }],
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
      const ctrl = new GatewayOrdersController(amqpList as never);

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
      const ctrl = new GatewayOrdersController(amqpList as never);

      const res = await ctrl.list({ user: { id: 'u1' } } as never, {});

      expect(res.items[0].showTitle).toBe('Unavailable show');
      expect(res.items[0].seatLabels).toEqual([]);
    });

    it('rejects a limit outside the allowed range', async () => {
      const ctrl = new GatewayOrdersController(amqp as never);

      await expect(ctrl.list({ user: { id: 'u1' } } as never, { limit: '999' })).rejects.toThrow();
    });
  });

  it('forwards refund with the authenticated user id', async () => {
    const ctrl = new GatewayOrdersController(amqp as never);
    await ctrl.requestRefund({ user: { id: 'u1' } } as never, 'ord1');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'orders.requestRefund',
        payload: { userId: 'u1', orderId: 'ord1' },
      }),
    );
  });
});
