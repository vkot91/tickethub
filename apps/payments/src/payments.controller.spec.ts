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
});
