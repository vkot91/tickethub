import { Nack } from '@golevelup/nestjs-rabbitmq';

import { PaymentsSagaController } from './saga.controller';

describe('PaymentsSagaController', () => {
  const event = { messageId: 'm1', orderId: 'ord1', showId: 'ev1' };

  it('refund.requested delegates to the service', async () => {
    const sagaService = { refund: jest.fn() };
    const controller = new PaymentsSagaController(sagaService as never);

    await controller.onRefundRequested({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
    });

    expect(sagaService.refund).toHaveBeenCalled();
  });

  it('order.expired delegates to cancelExpired', async () => {
    const sagaService = { cancelExpired: jest.fn() };
    const controller = new PaymentsSagaController(sagaService as never);

    await controller.onOrderExpired(event);

    expect(sagaService.cancelExpired).toHaveBeenCalledWith(event);
  });

  it('dead-letters (Nack, no requeue) when the refund fails', async () => {
    const sagaService = { refund: jest.fn().mockRejectedValue(new Error('boom')) };
    const controller = new PaymentsSagaController(sagaService as never);

    const res = await controller.onRefundRequested({ messageId: 'm1', orderId: 'ord1' });

    expect(res).toBeInstanceOf(Nack);
    expect((res as Nack).requeue).toBe(false);
  });

  it('dead-letters when the cancel fails', async () => {
    const sagaService = { cancelExpired: jest.fn().mockRejectedValue(new Error('stripe down')) };
    const controller = new PaymentsSagaController(sagaService as never);

    expect(await controller.onOrderExpired(event)).toBeInstanceOf(Nack);
  });
});
