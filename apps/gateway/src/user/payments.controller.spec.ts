import { PAYMENTS_MESSAGE_PATTERNS } from '@tickethub/contracts';

import { GatewayUserPaymentsController } from './payments.controller';

describe('GatewayUserPaymentsController', () => {
  it('forwards intent creation with the authed user id', async () => {
    const amqp = { request: jest.fn().mockResolvedValue({ clientSecret: 'x' }) };
    const ctrl = new GatewayUserPaymentsController(amqp as never);
    const res = await ctrl.createIntent({ user: { id: 'u1' } } as never, { orderId: 'ord1' });
    expect(res).toEqual({ clientSecret: 'x' });
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT,
        payload: { userId: 'u1', dto: { orderId: 'ord1' } },
      }),
    );
  });

  it('forwards the raw webhook body + signature', async () => {
    const amqp = { request: jest.fn().mockResolvedValue({ received: true }) };
    const ctrl = new GatewayUserPaymentsController(amqp as never);
    const req = { rawBody: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' } };
    const res = await ctrl.webhook(req as never);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: PAYMENTS_MESSAGE_PATTERNS.WEBHOOK,
        payload: { rawBody: Buffer.from('{}').toString('base64'), signature: 'sig' },
      }),
    );
    expect(res).toEqual({ received: true });
  });
});
