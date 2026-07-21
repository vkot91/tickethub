import { Nack } from '@golevelup/nestjs-rabbitmq';
import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  it('createIntent delegates to the service', async () => {
    const service = {
      createIntent: jest.fn().mockResolvedValue({ clientSecret: 'x' }),
      refund: jest.fn(),
    };
    const ctrl = new PaymentsController(service as never);
    await ctrl.createIntent({ userId: 'u1', dto: { orderId: 'ord1' } });
    expect(service.createIntent).toHaveBeenCalledWith('u1', { orderId: 'ord1' });
  });

  it('refund.requested delegates to the service', async () => {
    const service = { createIntent: jest.fn(), refund: jest.fn() };
    const ctrl = new PaymentsController(service as never);
    await ctrl.onRefundRequested({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
    } as never);
    expect(service.refund).toHaveBeenCalled();
  });

  it('order.expired delegates to cancelExpired', async () => {
    const service = { cancelExpired: jest.fn() };
    const controller = new PaymentsController(service as never);
    const event = { messageId: 'm1', orderId: 'ord1', showId: 'ev1' };
    await controller.onOrderExpired(event);
    expect(service.cancelExpired).toHaveBeenCalledWith(event);
  });

  it('dead-letters (Nack, no requeue) when the cancel fails', async () => {
    const service = {
      cancelExpired: jest.fn().mockRejectedValue(new Error('stripe down')),
    };
    const controller = new PaymentsController(service as never);
    const res = await controller.onOrderExpired({
      messageId: 'm1',
      orderId: 'ord1',
      showId: 'ev1',
    });
    expect(res).toBeInstanceOf(Nack);
  });

  it('dead-letters (Nack, no requeue) when the refund fails', async () => {
    const service = {
      createIntent: jest.fn(),
      refund: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const ctrl = new PaymentsController(service as never);
    const res = await ctrl.onRefundRequested({ messageId: 'm1', orderId: 'ord1' } as never);
    expect(res).toBeInstanceOf(Nack);
    expect((res as Nack).requeue).toBe(false);
  });
});
