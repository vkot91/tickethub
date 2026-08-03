import { ConflictException, NotFoundException } from '@nestjs/common';

import { PaymentsService } from './payments.service';

function deps(
  order: unknown = { id: 'ord1', status: 'awaiting_payment', totalCents: 5000, currency: 'usd' },
) {
  const stripe = {
    createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_1', clientSecret: 'pi_1_secret' }),
  };
  const rows: unknown[] = [];
  const db = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            rows.push(v);
            return [v];
          },
        }),
      }),
    }),
  };
  // createIntent calls orders.get via rpcRequest(amqp, ...), which resolves a Promise.
  const amqp = { request: jest.fn().mockResolvedValue(order) };

  const service = new PaymentsService(db as never, stripe as never, amqp as never);

  return { service, stripe, db, amqp, rows };
}

describe('PaymentsService.createIntent', () => {
  const dto = { orderId: 'ord1' };

  it('creates an intent and returns the client secret', async () => {
    const d = deps();

    const res = await d.service.createIntent('u1', dto);

    expect(res.clientSecret).toBe('pi_1_secret');
    expect(d.stripe.createPaymentIntent).toHaveBeenCalledWith(
      'ord1',
      5000,
      'usd',
      expect.objectContaining({ orderId: 'ord1' }),
    );
  });

  it('records the intent against the order', async () => {
    const d = deps();

    await d.service.createIntent('u1', dto);

    expect(d.rows[0]).toMatchObject({ orderId: 'ord1', stripePaymentIntentId: 'pi_1' });
  });

  it('rejects an order that is not awaiting_payment', async () => {
    const d = deps({ id: 'ord1', status: 'paid', totalCents: 5000, currency: 'usd' });

    await expect(d.service.createIntent('u1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound when the order RPC returns nothing', async () => {
    const d = deps(null);

    await expect(d.service.createIntent('u1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });
});
