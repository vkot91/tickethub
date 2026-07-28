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
  // What price() resolves for the dto's seat s1 from show_section_pricing — the server's own answer,
  // which is deliberately independent of whatever ticketTypeId the dto carries.
  const pricedSeats = [{ seatId: 's1', ticketTypeId: 'tt1', priceCents: 5000, currency: 'usd' }];

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
        // price() walks seats → rows → show_section_pricing → ticket_types, so the fake has to be
        // chainable on innerJoin and resolve at .where(). Seat ids come from the dto under test.
        select: () => {
          const chain = {
            from: () => chain,
            innerJoin: () => chain,
            where: async () => pricedSeats,
          };
          return chain;
        },
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

  it('rejects a seat the show does not sell instead of pricing it as 0', async () => {
    const d = deps({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          // The seat joins to no show_section_pricing row: not on sale.
          select: () => {
            const chain = {
              from: () => chain,
              innerJoin: () => chain,
              where: async () => [],
            };
            return chain;
          },
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

describe('OrdersService.list', () => {
  const orderRow = (id: string, createdAt: string) => ({
    id,
    userId: 'u1',
    showId: 'show1',
    status: 'awaiting_payment',
    totalCents: 5000,
    currency: 'usd',
    expiresAt: new Date('2030-01-01'),
    createdAt: new Date(createdAt),
  });

  // The list is the one read that chains .orderBy(), and it groups reservations from a
  // separate column-select — so it gets its own fake rather than bending `selectFake`.
  function listService(rows: unknown[], reservations: unknown[] = []) {
    const select = (columns?: unknown) =>
      columns
        ? { from: () => ({ where: async () => reservations }) }
        : {
            from: () => ({
              where: () => ({
                orderBy: () => ({ limit: async () => rows }),
                limit: async () => rows.slice(0, 1), // the cursor lookup
              }),
            }),
          };

    return deps({ select }).service;
  }

  it('returns the page with each order its seats, and no cursor when it is not full', async () => {
    const service = listService(
      [orderRow('ord1', '2026-07-02'), orderRow('ord2', '2026-07-01')],
      [
        { orderId: 'ord1', seatId: 'seat1', ticketTypeId: 'tt1' },
        { orderId: 'ord1', seatId: 'seat2', ticketTypeId: 'tt1' },
        { orderId: 'ord2', seatId: 'seat3', ticketTypeId: 'tt1' },
      ],
    );

    const page = await service.list('u1', { limit: 20 });

    expect(page.nextCursor).toBeNull();
    expect(page.items.map((item) => item.id)).toEqual(['ord1', 'ord2']);
    expect(page.items[0].showId).toBe('show1');
    expect(page.items[0].seats).toEqual([
      { seatId: 'seat1', ticketTypeId: 'tt1' },
      { seatId: 'seat2', ticketTypeId: 'tt1' },
    ]);
    // Held seats count here: an awaiting_payment order still has seats worth showing.
    expect(page.items[1].seats).toHaveLength(1);
  });

  it('trims the extra row and hands back the last item as the cursor', async () => {
    const service = listService([
      orderRow('ord1', '2026-07-03'),
      orderRow('ord2', '2026-07-02'),
      orderRow('ord3', '2026-07-01'),
    ]);

    const page = await service.list('u1', { limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual(['ord1', 'ord2']);
    expect(page.nextCursor).toBe('ord2');
  });

  it('rejects a cursor that is not an order the caller owns', async () => {
    const service = listService([]);

    await expect(service.list('u1', { limit: 20, cursor: 'nope' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
