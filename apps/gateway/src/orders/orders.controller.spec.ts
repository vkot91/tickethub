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
