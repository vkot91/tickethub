import { ConflictException } from '@nestjs/common';
import { of } from 'rxjs';
import { PAYMENT_ROUTING_KEYS } from '@tickethub/contracts';
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
  const ordersRpc = { send: jest.fn().mockReturnValue(of(order)) };
  return { stripe, db, ordersRpc, rows };
}

describe('PaymentsService.createIntent', () => {
  const dto = { orderId: 'ord1' };

  it('creates an intent and returns the client secret', async () => {
    const d = deps();
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      d.ordersRpc as never,
      {} as never,
    );
    const res = await svc.createIntent('u1', dto);
    expect(res.clientSecret).toBe('pi_1_secret');
    expect(d.stripe.createPaymentIntent).toHaveBeenCalledWith(
      'ord1',
      5000,
      'usd',
      expect.objectContaining({ orderId: 'ord1' }),
    );
  });

  it('rejects an order that is not awaiting_payment', async () => {
    const d = deps({ id: 'ord1', status: 'paid', totalCents: 5000, currency: 'usd' });
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      d.ordersRpc as never,
      {} as never,
    );
    await expect(svc.createIntent('u1', dto)).rejects.toBeInstanceOf(ConflictException);
  });
});

function webhookDeps(existingEvent = false, type = 'payment_intent.succeeded') {
  const enqueued: Array<{ routingKey: string }> = [];
  const outbox = {
    enqueue: jest.fn(async (_tx: unknown, _t: unknown, msg: { routingKey: string }) => {
      enqueued.push(msg);
    }),
  };
  const stripe = {
    constructEvent: jest.fn().mockReturnValue({
      id: 'evt_1',
      type,
      data: { object: { id: 'pi_1', amount: 5000, metadata: { orderId: 'ord1' } } },
    }),
  };
  const db = {
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: async () => (existingEvent ? [] : [{ stripeEventId: 'evt_1' }]),
            }),
          }),
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      }),
  };
  return { stripe, db, outbox, enqueued };
}

describe('PaymentsService.handleWebhook', () => {
  it('emits payment.succeeded on a fresh event', async () => {
    const d = webhookDeps(false);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.paymentSucceeded);
  });

  it('is a no-op on a duplicate stripe event', async () => {
    const d = webhookDeps(true);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued).toHaveLength(0);
  });

  it('emits payment.failed on a failed intent', async () => {
    const d = webhookDeps(false, 'payment_intent.payment_failed');
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.paymentFailed);
  });

  it('emits refund.succeeded on a charge.refunded', async () => {
    const d = webhookDeps(false, 'charge.refunded');
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.refundSucceeded);
  });

  it('ignores unrelated event types (no outbox)', async () => {
    const d = webhookDeps(false, 'payment_intent.created');
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued).toHaveLength(0);
  });
});

describe('PaymentsService.refund', () => {
  function refundDeps(seen: boolean, intentRow?: { id: string }) {
    const stripe = { createRefund: jest.fn().mockResolvedValue({ id: 're_1' }) };
    const db = {
      transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({ returning: async () => (seen ? [] : [{}]) }),
            }),
          }),
        }),
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (intentRow ? [intentRow] : []) }) }),
      }),
    };
    return { stripe, db };
  }

  it('refunds using the paymentIntentId carried on the event', async () => {
    const d = refundDeps(false);
    const svc = new PaymentsService(d.db as never, d.stripe as never, {} as never, {} as never);
    await svc.refund({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' });
    expect(d.stripe.createRefund).toHaveBeenCalledWith('ord1', 'pi_1');
  });

  it('resolves the intent from the payments row when the event omits it', async () => {
    const d = refundDeps(false, { id: 'pi_looked_up' });
    const svc = new PaymentsService(d.db as never, d.stripe as never, {} as never, {} as never);
    await svc.refund({ messageId: 'm1', orderId: 'ord1' });
    expect(d.stripe.createRefund).toHaveBeenCalledWith('ord1', 'pi_looked_up');
  });

  it('is a no-op when the message was already processed', async () => {
    const d = refundDeps(true);
    const svc = new PaymentsService(d.db as never, d.stripe as never, {} as never, {} as never);
    await svc.refund({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' });
    expect(d.stripe.createRefund).not.toHaveBeenCalled();
  });
});
