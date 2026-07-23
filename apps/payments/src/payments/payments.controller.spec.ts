import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  it('createIntent delegates to the service', async () => {
    const paymentsService = {
      createIntent: jest.fn().mockResolvedValue({ clientSecret: 'x' }),
    };
    const controller = new PaymentsController(paymentsService as never);

    await controller.createIntent({ userId: 'u1', dto: { orderId: 'ord1' } });

    expect(paymentsService.createIntent).toHaveBeenCalledWith('u1', { orderId: 'ord1' });
  });
});
