import { of } from 'rxjs';
import { GatewayPaymentsController } from './payments.controller';
import { MESSAGE_PATTERNS } from '@tickethub/contracts';

const keys = MESSAGE_PATTERNS.payments;

describe('GatewayPaymentsController', () => {
  it('forwards intent creation with the authed user id', async () => {
    const client = { send: jest.fn().mockReturnValue(of({ clientSecret: 'x' })) };
    const ctrl = new GatewayPaymentsController(client as never);
    const res = await ctrl.createIntent({ user: { id: 'u1' } } as never, { orderId: 'ord1' });
    expect(res).toEqual({ clientSecret: 'x' });
    expect(client.send).toHaveBeenCalledWith(keys.createIntent, {
      userId: 'u1',
      dto: { orderId: 'ord1' },
    });
  });

  it('forwards the raw webhook body + signature', async () => {
    const client = { send: jest.fn().mockReturnValue(of({ received: true })) };
    const ctrl = new GatewayPaymentsController(client as never);
    const req = { rawBody: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' } };
    const res = await ctrl.webhook(req as never);
    expect(client.send).toHaveBeenCalledWith(keys.webhook, {
      rawBody: Buffer.from('{}').toString('base64'),
      signature: 'sig',
    });
    expect(res).toEqual({ received: true });
  });
});
