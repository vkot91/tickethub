import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { orders, seatReservations, ticketTypes, type Db } from '@tickethub/db';
import { RedisService } from '@tickethub/redis';
import type { Tx } from '@tickethub/outbox';
import { ORDER_ROUTING_KEYS, type CreateOrderDto, type OrderResponse } from '@tickethub/contracts';
import { OrderRepository, seatLockKey, type Order } from './orders.repository';

export const toResponse = (order: Order, seats: OrderResponse['seats'] = []): OrderResponse => ({
  id: order.id,
  status: order.status,
  totalCents: order.totalCents,
  currency: order.currency,
  expiresAt: String(order.expiresAt),
  seats,
});

// The buyer-driven half of Orders: everything reachable from a REST call. The handlers that
// react to Payments' events live in OrderSagaService.
@Injectable()
export class OrdersService {
  constructor(
    @Inject('DB') private readonly db: Db,
    private readonly redis: RedisService,
    private readonly orderRepository: OrderRepository,
    @Inject('RELEASE_QUEUE') private readonly releaseQueue: Queue,
    @Inject('RESERVATION_TTL_SEC') private readonly ttlSec: number,
  ) {}

  async create(
    userId: string,
    idempotencyKey: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    // 1. Idempotency — same (user, key) returns the same order, no re-locking.
    const [existing] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) return this.withSeats(existing);

    // 2. Redis seat locks — cheap rejection before touching Postgres.
    const keys = dto.seats.map((s) => seatLockKey(dto.showId, s.seatId));
    if (!(await this.redis.acquireSeatLocks(keys, this.ttlSec))) {
      throw new ConflictException('One or more seats are being held by another buyer');
    }

    try {
      return await this.db.transaction(async (tx) => {
        const { totalCents, currency } = await this.price(tx, dto.seats);

        const expiresAt = new Date(Date.now() + this.ttlSec * 1000);
        const [order] = await tx
          .insert(orders)
          .values({
            userId,
            showId: dto.showId,
            idempotencyKey,
            status: 'awaiting_payment',
            totalCents,
            currency,
            expiresAt,
          })
          .returning();

        // 3. Postgres barrier — the partial-unique index rejects a second active hold.
        await tx.insert(seatReservations).values(
          dto.seats.map((s) => ({
            orderId: order.id,
            showId: dto.showId,
            seatId: s.seatId,
            ticketTypeId: s.ticketTypeId,
            status: 'held' as const,
          })),
        );

        // 4. Outbox (same tx): order.awaiting_payment + one seat.held per seat.
        // ponytail: seat.held/seat.released are the unconsumed-today toggle for a future
        // seat-availability read model (seat-picker greys out on held, frees on released).
        await this.orderRepository.emit(tx, ORDER_ROUTING_KEYS.ORDER_AWAITING_PAYMENT, {
          orderId: order.id,
          userId,
          showId: dto.showId,
          totalCents,
        });
        await this.orderRepository.emitPerSeat(
          tx,
          ORDER_ROUTING_KEYS.SEAT_HELD,
          order,
          dto.seats.map((s) => s.seatId),
        );

        // 5. Schedule the 10-minute release.
        await this.releaseQueue.add(
          'release',
          { orderId: order.id },
          { delay: this.ttlSec * 1000, removeOnComplete: true },
        );
        return toResponse(order, dto.seats);
      });
    } catch (err) {
      await this.redis.releaseSeatLocks(keys); // compensate: drop locks on PG conflict
      // 23505 = unique_violation → the partial-unique index caught a concurrent winner.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('Seat already reserved');
      }
      throw err;
    }
  }

  async get(userId: string, orderId: string): Promise<OrderResponse> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);
    if (!order) throw new NotFoundException('Order not found');

    return this.withSeats(order, 'confirmed');
  }

  // REST-driven refund: owner asks to refund a paid order → emit refund.requested (Payments
  // does the Stripe refund; the charge.refunded webhook later drives markRefunded).
  async requestRefund(userId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
        .for('update')
        .limit(1);
      if (!locked) throw new NotFoundException('Order not found');
      if (locked.status !== 'paid')
        throw new ConflictException(`Cannot refund an order in status ${locked.status}`);

      // ponytail: refund window policy (N days before the show) is a single guard; add it when the shows RPC exposes startsAt.
      await this.orderRepository.emit(tx, ORDER_ROUTING_KEYS.REFUND_REQUESTED, {
        orderId: locked.id,
      });

      return locked;
    });

    return this.withSeats(order, 'confirmed');
  }

  // Every response carries the order's seats; `status` narrows to the confirmed ones once paid.
  private async withSeats(order: Order, status?: 'confirmed'): Promise<OrderResponse> {
    const seats = await this.db
      .select({ seatId: seatReservations.seatId, ticketTypeId: seatReservations.ticketTypeId })
      .from(seatReservations)
      .where(
        status
          ? and(eq(seatReservations.orderId, order.id), eq(seatReservations.status, status))
          : eq(seatReservations.orderId, order.id),
      );

    return toResponse(order, seats);
  }

  // Prices the requested seats off ticket_types (the source of truth, never the client).
  private async price(
    tx: Tx,
    seats: CreateOrderDto['seats'],
  ): Promise<{ totalCents: number; currency: string }> {
    const typeIds = [...new Set(seats.map((s) => s.ticketTypeId))];

    const types = await tx
      .select({
        id: ticketTypes.id,
        priceCents: ticketTypes.priceCents,
        currency: ticketTypes.currency,
      })
      .from(ticketTypes)
      .where(inArray(ticketTypes.id, typeIds));

    const priceOf = new Map(types.map((t) => [t.id, t]));

    return {
      totalCents: seats.reduce((sum, s) => {
        const type = priceOf.get(s.ticketTypeId);
        if (!type) throw new BadRequestException(`Unknown ticketTypeId ${s.ticketTypeId}`);
        return sum + type.priceCents;
      }, 0),
      currency: types[0]?.currency ?? 'usd',
    };
  }
}
