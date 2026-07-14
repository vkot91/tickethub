import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

// A resolved promise that also answers .returning() — models Drizzle's
// `update().set().where()` (awaited directly) and `...where().returning()`.
function thenableReturning(rows: unknown[]) {
  const p = Promise.resolve(rows) as Promise<unknown[]> & { returning: () => Promise<unknown[]> };
  p.returning = async () => rows;
  return p;
}

const TTL = 600;

function deps(overrides: Partial<Record<string, unknown>> = {}) {
  const redis = {
    acquireSeatLocks: jest.fn().mockResolvedValue(true),
    releaseSeatLocks: jest.fn(),
  };
  const outbox = { enqueue: jest.fn() };
  const queue = { add: jest.fn() };
  const order = {
    id: 'ord1',
    status: 'awaiting_payment',
    totalCents: 5000,
    currency: 'usd',
    expiresAt: new Date('2030-01-01'),
  };
  const db = {
    // no existing idempotent order
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({ values: () => ({ returning: async () => [order] }) }),
        select: () => ({
          from: () => ({ where: async () => [{ id: 'tt1', priceCents: 5000, currency: 'usd' }] }),
        }),
      }),
    ...overrides,
  };
  return { db, redis, outbox, queue, order };
}

describe('OrdersService.create', () => {
  const dto = { eventId: 'e1', seats: [{ seatId: 's1', ticketTypeId: 'tt1' }] };

  it('returns a 409 when seat locks cannot be acquired', async () => {
    const d = deps();
    d.redis.acquireSeatLocks.mockResolvedValue(false);
    const svc = new OrdersService(
      d.db as never,
      d.redis as never,
      d.outbox as never,
      d.queue as never,
      TTL,
    );
    await expect(svc.create('u1', 'idem1', dto as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('acquires locks, writes order + outbox, and schedules release', async () => {
    const d = deps();
    const svc = new OrdersService(
      d.db as never,
      d.redis as never,
      d.outbox as never,
      d.queue as never,
      TTL,
    );
    const res = await svc.create('u1', 'idem1', dto as never);
    expect(res.id).toBe('ord1');
    expect(d.redis.acquireSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1'], TTL);
    expect(d.outbox.enqueue).toHaveBeenCalled(); // awaiting_payment + seat.held
    expect(d.queue.add).toHaveBeenCalledWith(
      'release',
      { orderId: 'ord1' },
      expect.objectContaining({ delay: TTL * 1000 }),
    );
  });

  it('is idempotent: returns the existing order without re-locking', async () => {
    const existing = {
      id: 'ord0',
      status: 'awaiting_payment',
      totalCents: 5000,
      currency: 'usd',
      expiresAt: new Date('2030-01-01'),
    };
    const d = deps({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [existing] }) }) }),
    });
    const svc = new OrdersService(
      d.db as never,
      d.redis as never,
      d.outbox as never,
      d.queue as never,
      TTL,
    );
    const res = await svc.create('u1', 'idem1', dto as never);
    expect(res.id).toBe('ord0');
    expect(d.redis.acquireSeatLocks).not.toHaveBeenCalled();
  });

  it('prices an unknown ticket type as 0 in the default currency', async () => {
    const order = {
      id: 'ord1',
      status: 'awaiting_payment',
      totalCents: 0,
      currency: 'usd',
      expiresAt: new Date('2030-01-01'),
    };
    const d = deps({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          insert: () => ({ values: () => ({ returning: async () => [order] }) }),
          select: () => ({ from: () => ({ where: async () => [] }) }), // no matching ticket types
        }),
    });
    const svc = new OrdersService(
      d.db as never,
      d.redis as never,
      d.outbox as never,
      d.queue as never,
      TTL,
    );
    const res = await svc.create('u1', 'idem1', dto as never);
    expect(res.totalCents).toBe(0);
    expect(res.currency).toBe('usd');
  });

  it('maps a unique-violation (23505) to a 409 and releases the Redis locks', async () => {
    const d = deps({
      transaction: async () => {
        throw { code: '23505' };
      },
    });
    const svc = new OrdersService(
      d.db as never,
      d.redis as never,
      d.outbox as never,
      d.queue as never,
      TTL,
    );
    await expect(svc.create('u1', 'idem1', dto as never)).rejects.toBeInstanceOf(ConflictException);
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });

  it('releases the Redis locks and rethrows on an unexpected error', async () => {
    const boom = new Error('db down');
    const d = deps({
      transaction: async () => {
        throw boom;
      },
    });
    const svc = new OrdersService(
      d.db as never,
      d.redis as never,
      d.outbox as never,
      d.queue as never,
      TTL,
    );
    await expect(svc.create('u1', 'idem1', dto as never)).rejects.toBe(boom);
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });
});

// Fake tx shared by release/confirmTest: no-arg select → order lookup chain
// (.from().where().for().limit()); select({...}) → held-seats chain (.from().where()).
function stateChangeTx(order: unknown, held: unknown[], setCalls: string[]) {
  return {
    select: (arg?: unknown) =>
      arg
        ? { from: () => ({ where: async () => held }) }
        : {
            from: () => ({
              where: () => ({ for: () => ({ limit: async () => (order ? [order] : []) }) }),
            }),
          },
    update: () => ({
      set: (v: { status: string }) => {
        setCalls.push(v.status);
        return { where: () => thenableReturning([{ id: 'ord1', status: v.status }]) };
      },
    }),
  };
}

describe('OrdersService.release', () => {
  function svcWith(db: unknown, redis: unknown, outbox: unknown) {
    return new OrdersService(
      db as never,
      redis as never,
      outbox as never,
      { add: jest.fn() } as never,
      600,
    );
  }

  it('expires an unpaid order, writes outbox rows, and releases the seat locks', async () => {
    const setCalls: string[] = [];
    const order = { id: 'ord1', eventId: 'e1', status: 'awaiting_payment' };
    const redis = { releaseSeatLocks: jest.fn() };
    const outbox = { enqueue: jest.fn() };
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(stateChangeTx(order, [{ seatId: 's1' }], setCalls)),
    };
    await svcWith(db, redis, outbox).release('ord1');

    expect(setCalls).toEqual(expect.arrayContaining(['expired', 'released']));
    expect(outbox.enqueue).toHaveBeenCalledTimes(2); // order.expired + seat.released
    expect(redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });

  it('is a no-op for an already-paid order (nothing to release)', async () => {
    const setCalls: string[] = [];
    const redis = { releaseSeatLocks: jest.fn() };
    const outbox = { enqueue: jest.fn() };
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(stateChangeTx({ id: 'ord1', eventId: 'e1', status: 'paid' }, [], setCalls)),
    };
    await svcWith(db, redis, outbox).release('ord1');
    expect(redis.releaseSeatLocks).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});

// Fake tx for the saga handlers: insert()→processed-messages guard (returning [] means
// "already seen"); no-arg select→order lookup; select({...})→a rows list (held seats or paid orders).
function sagaTx(opts: { order?: unknown; rows?: unknown[]; seen?: boolean; setCalls?: string[] }) {
  const { order, rows = [], seen = false, setCalls = [] } = opts;
  return {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => (seen ? [] : [{ messageId: 'm1' }]) }),
      }),
    }),
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

function sagaSvc(tx: unknown) {
  const enqueued: Array<{ routingKey: string }> = [];
  const outbox = {
    enqueue: jest.fn(async (_tx: unknown, _t: unknown, m: { routingKey: string }) => {
      enqueued.push(m);
    }),
  };
  const redis = { releaseSeatLocks: jest.fn() };
  const db = { transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) };
  const svc = new OrdersService(
    db as never,
    redis as never,
    outbox as never,
    { add: jest.fn() } as never,
    600,
  );
  return { svc, outbox, redis, enqueued };
}

describe('OrdersService saga handlers', () => {
  it('markPaid flips an awaiting_payment order to paid + confirms seats', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', userId: 'u1', eventId: 'e1', status: 'awaiting_payment' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );
    await d.svc.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);
    expect(setCalls).toEqual(expect.arrayContaining(['paid', 'confirmed']));
    expect(d.enqueued.map((m) => m.routingKey)).toEqual(
      expect.arrayContaining(['order.paid', 'seat.confirmed']),
    );
  });

  it('markPaid on an expired order requests a refund instead of resurrecting it', async () => {
    const d = sagaSvc(
      sagaTx({ order: { id: 'ord1', userId: 'u1', eventId: 'e1', status: 'expired' } }),
    );
    await d.svc.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);
    expect(d.enqueued.some((m) => m.routingKey === 'refund.requested')).toBe(true);
  });

  it('markPaid is a no-op when the message was already processed', async () => {
    const d = sagaSvc(sagaTx({ order: { id: 'ord1', status: 'awaiting_payment' }, seen: true }));
    await d.svc.markPaid({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);
    expect(d.enqueued).toHaveLength(0);
  });

  it('markFailed cancels an awaiting_payment order and releases locks', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', eventId: 'e1', status: 'awaiting_payment' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );
    await d.svc.markFailed({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' } as never);
    expect(setCalls).toEqual(expect.arrayContaining(['cancelled', 'released']));
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });

  it('markFailed on a paid order is a no-op', async () => {
    const d = sagaSvc(sagaTx({ order: { id: 'ord1', eventId: 'e1', status: 'paid' } }));
    await d.svc.markFailed({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' } as never);
    expect(d.redis.releaseSeatLocks).not.toHaveBeenCalled();
  });

  it('markRefunded flips a paid order to refunded and releases locks', async () => {
    const setCalls: string[] = [];
    const d = sagaSvc(
      sagaTx({
        order: { id: 'ord1', eventId: 'e1', status: 'paid' },
        rows: [{ seatId: 's1' }],
        setCalls,
      }),
    );
    await d.svc.markRefunded({
      messageId: 'm1',
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    } as never);
    expect(setCalls).toEqual(expect.arrayContaining(['refunded', 'released']));
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });
});

describe('OrdersService.requestRefund', () => {
  const paidOrder = {
    id: 'ord1',
    userId: 'u1',
    eventId: 'e1',
    status: 'paid',
    totalCents: 5000,
    currency: 'usd',
    expiresAt: new Date(),
  };

  it('emits refund.requested for a paid order owned by the user', async () => {
    const d = sagaSvc(sagaTx({ order: paidOrder }));
    const res = await d.svc.requestRefund('u1', 'ord1');
    expect(res.id).toBe('ord1');
    expect(d.enqueued.some((m) => m.routingKey === 'refund.requested')).toBe(true);
  });

  it('throws NotFound when the order is missing', async () => {
    const d = sagaSvc(sagaTx({ order: undefined }));
    await expect(d.svc.requestRefund('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects refunding an order that is not paid', async () => {
    const d = sagaSvc(sagaTx({ order: { ...paidOrder, status: 'awaiting_payment' } }));
    await expect(d.svc.requestRefund('u1', 'ord1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('OrdersService.refundAllPaidForEvent', () => {
  it('emits a refund.requested per paid order', async () => {
    const d = sagaSvc(sagaTx({ rows: [{ id: 'o1' }, { id: 'o2' }] }));
    await d.svc.refundAllPaidForEvent({ messageId: 'm1', eventId: 'e1' });
    expect(d.enqueued.filter((m) => m.routingKey === 'refund.requested')).toHaveLength(2);
  });

  it('is a no-op when already processed', async () => {
    const d = sagaSvc(sagaTx({ rows: [{ id: 'o1' }], seen: true }));
    await d.svc.refundAllPaidForEvent({ messageId: 'm1', eventId: 'e1' });
    expect(d.enqueued).toHaveLength(0);
  });
});

describe('OrdersService.get', () => {
  const order = {
    id: 'ord1',
    status: 'awaiting_payment',
    totalCents: 5000,
    currency: 'usd',
    expiresAt: new Date(),
  };

  it('returns the order for its owner', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [order] }) }) }),
    };
    const svc = new OrdersService(db as never, {} as never, {} as never, {} as never, 600);
    expect((await svc.get('u1', 'ord1')).id).toBe('ord1');
  });

  it('throws NotFound when the order is missing', async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) };
    const svc = new OrdersService(db as never, {} as never, {} as never, {} as never, 600);
    await expect(svc.get('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
