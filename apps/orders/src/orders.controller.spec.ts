import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  const svc = {
    create: jest.fn().mockResolvedValue({ id: 'ord1' }),
    get: jest.fn().mockResolvedValue({ id: 'ord1' }),
    requestRefund: jest.fn().mockResolvedValue({ id: 'ord1' }),
    markPaid: jest.fn(),
    markFailed: jest.fn(),
    markRefunded: jest.fn(),
    refundAllPaidForEvent: jest.fn(),
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

  it('forwards requestRefund to the service', () => {
    ctrl.requestRefund({ userId: 'u1', orderId: 'ord1' });
    expect(svc.requestRefund).toHaveBeenCalledWith('u1', 'ord1');
  });

  it('routes payment.succeeded to markPaid', () => {
    ctrl.onPaymentSucceeded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);
    expect(svc.markPaid).toHaveBeenCalled();
  });

  it('routes payment.failed to markFailed', () => {
    ctrl.onPaymentFailed({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' } as never);
    expect(svc.markFailed).toHaveBeenCalled();
  });

  it('routes refund.succeeded to markRefunded', () => {
    ctrl.onRefundSucceeded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);
    expect(svc.markRefunded).toHaveBeenCalled();
  });

  it('routes event.cancelled to refundAllPaidForEvent', () => {
    ctrl.onEventCancelled({ messageId: 'm1', eventId: 'e1' });
    expect(svc.refundAllPaidForEvent).toHaveBeenCalled();
  });
});
