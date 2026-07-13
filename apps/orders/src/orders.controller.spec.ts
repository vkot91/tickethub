import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  const svc = {
    create: jest.fn().mockResolvedValue({ id: 'ord1' }),
    get: jest.fn().mockResolvedValue({ id: 'ord1' }),
    confirmTest: jest.fn().mockResolvedValue({ id: 'ord1' }),
  };
  const ctrl = new OrdersController(svc as never);

  it('forwards create to the service', () => {
    ctrl.create({ userId: 'u1', idempotencyKey: 'k1', dto: { eventId: 'e1', seats: [] } as never });
    expect(svc.create).toHaveBeenCalledWith('u1', 'k1', { eventId: 'e1', seats: [] });
  });

  it('forwards get to the service', () => {
    ctrl.get({ userId: 'u1', orderId: 'ord1' });
    expect(svc.get).toHaveBeenCalledWith('u1', 'ord1');
  });

  it('forwards confirmTest to the service', () => {
    ctrl.confirmTest({ orderId: 'ord1' });
    expect(svc.confirmTest).toHaveBeenCalledWith('ord1');
  });
});
