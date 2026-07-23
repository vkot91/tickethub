import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const TTL = 600;

// Drizzle's `select()` is overloaded: no-arg → a row lookup (.from().where().limit(), plus
// .for('update') on the locking paths); a columns object → the seats list, which resolves
// straight off .where(). One fake covers both.
function selectFake(rows: unknown[], seats: unknown[] = []) {
  return (arg?: unknown) =>
    arg
      ? { from: () => ({ where: async () => seats }) }
      : {
          from: () => ({
            where: () => ({
              limit: async () => rows,
              for: () => ({ limit: async () => rows }),
            }),
          }),
        };
}

function deps(overrides: Record<string, unknown> = {}, seats: unknown[] = []) {
  const redis = {
    acquireSeatLocks: jest.fn().mockResolvedValue(true),
    releaseSeatLocks: jest.fn(),
  };
  const outbox = { enqueue: jest.fn() };
  const inbox = { alreadyProcessed: jest.fn().mockResolvedValue(false) };
  const queue = { add: jest.fn() };
  const order = {
    id: 'ord1',
    status: 'awaiting_payment',
    totalCents: 5000,
    currency: 'usd',
    expiresAt: new Date('2030-01-01'),
  };
  const db = {
    select: selectFake([], seats), // no existing idempotent order
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({ values: () => ({ returning: async () => [order] }) }),
        select: () => ({
          from: () => ({ where: async () => [{ id: 'tt1', priceCents: 5000, currency: 'usd' }] }),
        }),
      }),
    ...overrides,
  };

  const service = new OrdersService(
    db as never,
    redis as never,
    new OrderRepository(redis as never, outbox as never, inbox as never),
    queue as never,
    TTL,
  );

  return { service, db, redis, outbox, inbox, queue, order };
}

describe('OrdersService.create', () => {
  const dto = { showId: 'e1', seats: [{ seatId: 's1', ticketTypeId: 'tt1' }] };

  it('returns a 409 when seat locks cannot be acquired', async () => {
    const d = deps();
    d.redis.acquireSeatLocks.mockResolvedValue(false);

    await expect(d.service.create('u1', 'idem1', dto as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('acquires locks, writes order + outbox, and schedules release', async () => {
    const d = deps();

    const res = await d.service.create('u1', 'idem1', dto as never);

    expect(res.id).toBe('ord1');
    expect(res.seats).toEqual(dto.seats);
    expect(d.redis.acquireSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1'], TTL);
    expect(d.outbox.enqueue).toHaveBeenCalled(); // awaiting_payment + seat.held
    expect(d.queue.add).toHaveBeenCalledWith(
      'release',
      { orderId: 'ord1' },
      expect.objectContaining({ delay: TTL * 1000 }),
    );
  });

  it('is idempotent: returns the existing order and its seats without re-locking', async () => {
    const existing = {
      id: 'ord0',
      status: 'awaiting_payment',
      totalCents: 5000,
      currency: 'usd',
      expiresAt: new Date('2030-01-01'),
    };
    const held = [{ seatId: 's1', ticketTypeId: 'tt1' }];
    const d = deps({ select: selectFake([existing], held) });

    const res = await d.service.create('u1', 'idem1', dto as never);

    expect(res.id).toBe('ord0');
    expect(res.seats).toEqual(held);
    expect(d.redis.acquireSeatLocks).not.toHaveBeenCalled();
  });

  it('rejects an unknown ticket type instead of pricing it as 0', async () => {
    const d = deps({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          select: () => ({ from: () => ({ where: async () => [] }) }), // no matching ticket types
        }),
    });

    await expect(d.service.create('u1', 'idem1', dto as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('maps a unique-violation (23505) to a 409 and releases the Redis locks', async () => {
    const d = deps({
      transaction: async () => {
        throw { code: '23505' };
      },
    });

    await expect(d.service.create('u1', 'idem1', dto as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
  });

  it('releases the Redis locks and rethrows on an unexpected error', async () => {
    const boom = new Error('db down');
    const d = deps({
      transaction: async () => {
        throw boom;
      },
    });

    await expect(d.service.create('u1', 'idem1', dto as never)).rejects.toBe(boom);
    expect(d.redis.releaseSeatLocks).toHaveBeenCalledWith(['seat-lock:e1:s1']);
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
    const d = deps({ select: selectFake([order]) });

    expect((await d.service.get('u1', 'ord1')).id).toBe('ord1');
  });

  it('throws NotFound when the order is missing', async () => {
    const d = deps({ select: selectFake([]) });

    await expect(d.service.get('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the confirmed seats for the order', async () => {
    const seats = [{ seatId: 's1', ticketTypeId: 'tt1' }];
    const d = deps({ select: selectFake([order], seats) });

    expect((await d.service.get('u1', 'ord1')).seats).toEqual(seats);
  });
});

describe('OrdersService.requestRefund', () => {
  const paidOrder = {
    id: 'ord1',
    userId: 'u1',
    showId: 'e1',
    status: 'paid',
    totalCents: 5000,
    currency: 'usd',
    expiresAt: new Date(),
  };

  // requestRefund locks inside a transaction, then reads the seats off `db` afterwards.
  function refundDeps(order?: unknown, seats: unknown[] = []) {
    const rows = order ? [order] : [];
    return deps({
      select: selectFake(rows, seats),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select: selectFake(rows, seats) }),
    });
  }

  it('emits refund.requested for a paid order owned by the user', async () => {
    const d = refundDeps(paidOrder);

    const res = await d.service.requestRefund('u1', 'ord1');

    expect(res.id).toBe('ord1');
    expect(d.outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ routingKey: 'refund.requested' }),
    );
  });

  it('throws NotFound when the order is missing', async () => {
    const d = refundDeps(undefined);

    await expect(d.service.requestRefund('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects refunding an order that is not paid', async () => {
    const d = refundDeps({ ...paidOrder, status: 'awaiting_payment' });

    await expect(d.service.requestRefund('u1', 'ord1')).rejects.toBeInstanceOf(ConflictException);
  });
});
