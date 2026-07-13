import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { GatewayOrdersController } from './orders.controller';

const client = { send: jest.fn().mockReturnValue(of({ id: 'ord1' })) };
const configWith = (nodeEnv: string) => ({ get: () => nodeEnv }) as never;

const dto = {
  eventId: '00000000-0000-0000-0000-000000000001',
  seats: [
    {
      seatId: '00000000-0000-0000-0000-000000000002',
      ticketTypeId: '00000000-0000-0000-0000-000000000003',
    },
  ],
};

describe('GatewayOrdersController', () => {
  it('forwards create with the authenticated user id, idempotency key, and dto', async () => {
    const ctrl = new GatewayOrdersController(client as never, configWith('development'));
    const req = { user: { id: 'u1' }, headers: { 'idempotency-key': 'k1' } };
    await ctrl.create(req as never, dto as never);
    expect(client.send).toHaveBeenCalledWith('orders.create', {
      userId: 'u1',
      idempotencyKey: 'k1',
      dto,
    });
  });

  it('rejects a missing idempotency key', async () => {
    const ctrl = new GatewayOrdersController(client as never, configWith('development'));
    const req = { user: { id: 'u1' }, headers: {} };
    expect(() => ctrl.create(req as never, dto as never)).toThrow(BadRequestException);
  });

  it('forwards get with the authenticated user id', async () => {
    const ctrl = new GatewayOrdersController(client as never, configWith('development'));
    await ctrl.get({ user: { id: 'u1' } } as never, 'ord1');
    expect(client.send).toHaveBeenCalledWith('orders.get', { userId: 'u1', orderId: 'ord1' });
  });

  it('confirm-test forwards in non-prod and is blocked in production', async () => {
    const dev = new GatewayOrdersController(client as never, configWith('development'));
    await dev.confirmTest('ord1');
    expect(client.send).toHaveBeenCalledWith('orders.confirmTest', { orderId: 'ord1' });

    const prod = new GatewayOrdersController(client as never, configWith('production'));
    expect(() => prod.confirmTest('ord1')).toThrow(BadRequestException);
  });
});
