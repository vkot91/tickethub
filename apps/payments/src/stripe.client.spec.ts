import { StripeClient } from './stripe.client';

function fakeStripe() {
  return {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret' }),
    },
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({ id: 'evt_1', type: 'payment_intent.succeeded' }),
    },
  };
}

describe('StripeClient', () => {
  it('creates a payment intent with an idempotency key', async () => {
    const stripe = fakeStripe();
    const client = new StripeClient(stripe as never, 'whsec_test');
    const res = await client.createPaymentIntent('order-1', 5000, 'usd', { orderId: 'order-1' });
    expect(res).toEqual({ id: 'pi_1', clientSecret: 'pi_1_secret' });
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: 'usd', metadata: { orderId: 'order-1' } }),
      { idempotencyKey: 'order-1' },
    );
  });

  it('creates a refund with an idempotency key', async () => {
    const stripe = fakeStripe();
    const client = new StripeClient(stripe as never, 'whsec_test');
    const res = await client.createRefund('order-1', 'pi_1');
    expect(res).toEqual({ id: 're_1' });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1' },
      { idempotencyKey: 'order-1' },
    );
  });

  it('verifies webhook signatures via the SDK', () => {
    const stripe = fakeStripe();
    const client = new StripeClient(stripe as never, 'whsec_test');
    const ev = client.constructEvent(Buffer.from('{}'), 'sig');
    expect(ev.id).toBe('evt_1');
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      Buffer.from('{}'),
      'sig',
      'whsec_test',
    );
  });

  it('fromSecret builds a client without hitting the network', () => {
    expect(StripeClient.fromSecret('sk_test_x', 'whsec_test')).toBeInstanceOf(StripeClient);
  });
});
