import { OrderRepository } from '../orders.repository';
import { OrderSagaService } from './saga.service';

// Fake tx for the state-change flows: no-arg select → the locked order lookup
// (.from().where().for().limit()); a columns-object select → a rows list (held seats, or the
// paid orders of a cancelled show). The processed-messages guard lives on the inbox mock.
function sagaTx(opts: { order?: unknown; rows?: unknown[]; setCalls?: string[] }) {
  const { order, rows = [], setCalls = [] } = opts;
  return {
    select: (arg?: unknown) =>
      arg
        ? { from: () => ({ where: async () => rows }) }
        : {
            from: () => ({
              where: () => ({ for: () => ({ limit: async () => (order ? [order] : []) }) }),
            }),
          },
    update: () => ({
      set: (v: { status: string }) => {
        setCalls.push(v.status);
        return { where: async () => undefined };
      },
    }),
  };
}

function sagaSvc(tx: unknown, seen = false) {
  const enqueued: Array<{ routingKey: string }> = [];
  const outbox = {
    enqueue: jest.fn(async (_tx: unknown, m: { routingKey: string }) => {
      enqueued.push(m);
    }),
  };
  const redis = { releaseSeatLocks: jest.fn() };
  const inbox = { alreadyProcessed: jest.fn().mockResolvedValue(seen) };
  const db = { transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) };

  const service = new OrderSagaService(
    db as never,
    new OrderRepository(redis as never, outbox as never, inbox as never),
  );

  return { service, outbox, inbox, redis, enqueued };
}

describe('OrderSagaService.release', () => {
  it('expires an unpaid order, writes outbox rows, and releases the seat locks', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', showId: 'e1', status: 'awaiting_payment' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );

    await d.service.release('ord1');

    expect(setCalls).toEqual(expect.arrayContaining(['expired', 'released']));
    expect(d.enqueued.map((m) => m.routingKey)).toEqual(
      expect.arrayContaining(['order.expired', 'seat.released']),
    );
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });

  it('is a no-op for an already-paid order (nothing to release)', async () => {
    const d = sagaSvc(sagaTx({ order: { id: 'ord1', showId: 'e1', status: 'paid' } }));

    await d.service.release('ord1');

    expect(d.redis.releaseSeatLocks).not.toHaveBeenCalled();
    expect(d.enqueued).toHaveLength(0);
  });

  it('is a no-op when the order is gone', async () => {
    const d = sagaSvc(sagaTx({ order: undefined }));

    await d.service.release('missing');

    expect(d.enqueued).toHaveLength(0);
  });
});

describe('OrderSagaService.markPaid', () => {
  it('flips an awaiting_payment order to paid + confirms seats', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', userId: 'u1', showId: 'e1', status: 'awaiting_payment' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );

    await d.service.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(setCalls).toEqual(expect.arrayContaining(['paid', 'confirmed']));
    expect(d.enqueued.map((m) => m.routingKey)).toEqual(['order.paid']);
  });

  it('requests a refund on an expired order instead of resurrecting it', async () => {
    const d = sagaSvc(
      sagaTx({ order: { id: 'ord1', userId: 'u1', showId: 'e1', status: 'expired' } }),
    );

    await d.service.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(d.enqueued.some((m) => m.routingKey === 'refund.requested')).toBe(true);
  });

  it('is a no-op when the message was already processed', async () => {
    const d = sagaSvc(sagaTx({ order: { id: 'ord1', status: 'awaiting_payment' } }), true);

    await d.service.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(d.enqueued).toHaveLength(0);
  });

  it('is a no-op when the order is gone', async () => {
    const d = sagaSvc(sagaTx({ order: undefined }));

    await d.service.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(d.enqueued).toHaveLength(0);
  });
});

describe('OrderSagaService.markFailed / markRefunded', () => {
  it('markFailed cancels an awaiting_payment order and releases locks', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', showId: 'e1', status: 'awaiting_payment' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );

    await d.service.markFailed({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
    } as never);

    expect(setCalls).toEqual(expect.arrayContaining(['cancelled', 'released']));
    expect(d.enqueued.map((m) => m.routingKey)).toEqual(
      expect.arrayContaining(['order.cancelled', 'seat.released']),
    );
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });

  it('markFailed on a paid order is a no-op', async () => {
    const d = sagaSvc(sagaTx({ order: { id: 'ord1', showId: 'e1', status: 'paid' } }));

    await d.service.markFailed({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
    } as never);

    expect(d.redis.releaseSeatLocks).not.toHaveBeenCalled();
  });

  it('markRefunded flips a paid order to refunded and releases locks', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', showId: 'e1', status: 'paid' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );

    await d.service.markRefunded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(setCalls).toEqual(expect.arrayContaining(['refunded', 'released']));
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
    // Payments announces the refund itself; Orders only frees the seats.
    expect(d.enqueued.map((m) => m.routingKey)).toEqual(['seat.released']);
  });

  it('markRefunded is a no-op when the message was already processed', async () => {
    const d = sagaSvc(sagaTx({ order: { id: 'ord1', showId: 'e1', status: 'paid' } }), true);

    await d.service.markRefunded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);

    expect(d.enqueued).toHaveLength(0);
  });
});

describe('OrderSagaService.refundAllPaidForShow', () => {
  it('emits a refund.requested per paid order', async () => {
    const d = sagaSvc(sagaTx({ rows: [{ id: 'o1' }, { id: 'o2' }] }));

    await d.service.refundAllPaidForShow({ messageId: 'm1', showId: 'e1' });

    expect(d.enqueued.filter((m) => m.routingKey === 'refund.requested')).toHaveLength(2);
  });

  it('is a no-op when already processed', async () => {
    const d = sagaSvc(sagaTx({ rows: [{ id: 'o1' }] }), true);

    await d.service.refundAllPaidForShow({ messageId: 'm1', showId: 'e1' });

    expect(d.enqueued).toHaveLength(0);
  });
});
