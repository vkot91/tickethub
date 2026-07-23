import { Nack } from '@golevelup/nestjs-rabbitmq';
import { OrderSagaController } from './saga.controller';

describe('OrderSagaController', () => {
  const sagaService = {
    markPaid: jest.fn(),
    markFailed: jest.fn(),
    markRefunded: jest.fn(),
    refundAllPaidForShow: jest.fn(),
  };
  const controller = new OrderSagaController(sagaService as never);

  it('routes payment.succeeded to markPaid', async () => {
    await controller.onPaymentSucceeded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(sagaService.markPaid).toHaveBeenCalled();
  });

  it('routes payment.failed to markFailed', async () => {
    await controller.onPaymentFailed({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
    } as never);

    expect(sagaService.markFailed).toHaveBeenCalled();
  });

  it('routes refund.succeeded to markRefunded', async () => {
    await controller.onRefundSucceeded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(sagaService.markRefunded).toHaveBeenCalled();
  });

  it('routes show.cancelled to refundAllPaidForShow', async () => {
    await controller.onShowCancelled({ messageId: 'm1', showId: 'e1' });

    expect(sagaService.refundAllPaidForShow).toHaveBeenCalled();
  });

  it('dead-letters (Nack, no requeue) when a saga handler throws', async () => {
    const failing = { markPaid: jest.fn().mockRejectedValue(new Error('boom')) };

    const res = await new OrderSagaController(failing as never).onPaymentSucceeded({
      messageId: 'm1',
      orderId: 'ord1',
    } as never);

    expect(res).toBeInstanceOf(Nack);
    expect((res as Nack).requeue).toBe(false);
  });
});
