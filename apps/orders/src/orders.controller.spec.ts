import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  const ordersService = {
    create: jest.fn().mockResolvedValue({ id: 'ord1' }),
    get: jest.fn().mockResolvedValue({ id: 'ord1' }),
    requestRefund: jest.fn().mockResolvedValue({ id: 'ord1' }),
  };
  const controller = new OrdersController(ordersService as never);

  it('forwards create to the service', () => {
    controller.create({
      userId: 'u1',
      idempotencyKey: 'k1',
      dto: { showId: 'e1', seats: [] } as never,
    });

    expect(ordersService.create).toHaveBeenCalledWith('u1', 'k1', { showId: 'e1', seats: [] });
  });

  it('forwards get to the service', () => {
    controller.get({ userId: 'u1', orderId: 'ord1' });

    expect(ordersService.get).toHaveBeenCalledWith('u1', 'ord1');
  });

  it('forwards requestRefund to the service', () => {
    controller.requestRefund({ userId: 'u1', orderId: 'ord1' });

    expect(ordersService.requestRefund).toHaveBeenCalledWith('u1', 'ord1');
  });
});
