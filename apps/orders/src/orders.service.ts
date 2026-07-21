import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import type { Queue } from 'bullmq';
import { orders, seatReservations, ticketTypes, type Db } from '@tickethub/db';
import { RedisService } from '@tickethub/redis';
import { OutboxRepository, InboxRepository, type Tx } from '@tickethub/outbox';
import {
  ORDER_ROUTING_KEYS,
  type CreateOrderDto,
  type OrderResponse,
  type PaymentSucceededEvent,
  type PaymentFailedEvent,
  type RefundSucceededEvent,
} from '@tickethub/contracts';
import { canTransition, type OrderStatus } from './order-state';

export const seatLockKey = (showId: string, seatId: string) => `seat-lock:${showId}:${seatId}`;

type Order = typeof orders.$inferSelect;

const toResponse = (order: Order): OrderResponse => ({
  id: order.id,
  status: order.status,
  totalCents: order.totalCents,
  currency: order.currency,
  expiresAt: String(order.expiresAt),
});

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: Db,
    private readonly redis: RedisService,
    private readonly outbox: OutboxRepository,
    private readonly inbox: InboxRepository,
    private readonly releaseQueue: Queue,
    private readonly ttlSec: number,
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
    if (existing) return toResponse(existing);

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
        await this.emit(tx, ORDER_ROUTING_KEYS.ORDER_AWAITING_PAYMENT, {
          orderId: order.id,
          userId,
          showId: dto.showId,
          totalCents,
        });
        await this.emitPerSeat(
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
        return toResponse(order);
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
    return toResponse(order);
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
      totalCents: seats.reduce((sum, s) => sum + (priceOf.get(s.ticketTypeId)?.priceCents ?? 0), 0),
      currency: types[0]?.currency ?? 'usd',
    };
  }

  // --- Shared steps of the settle flows below. Each is one statement's worth of intent. ---

  private async lockOrder(tx: Tx, orderId: string): Promise<Order | undefined> {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update')
      .limit(1);
    return order;
  }

  // Locks the order and returns it only if this message is new and the transition is legal.
  private async claim(
    tx: Tx,
    messageId: string,
    orderId: string,
    to: OrderStatus,
  ): Promise<Order | undefined> {
    if (await this.inbox.alreadyProcessed(tx, messageId)) return undefined;

    const order = await this.lockOrder(tx, orderId);

    if (!order || !canTransition(order.status as OrderStatus, to)) return undefined;

    return order;
  }

  // Moves the order and all of its reservations to their new statuses; returns the seat ids.
  private async settle(
    tx: Tx,
    order: Order,
    to: OrderStatus,
    seatStatus: 'released' | 'confirmed',
  ): Promise<string[]> {
    const held = await tx
      .select({ seatId: seatReservations.seatId })
      .from(seatReservations)
      .where(eq(seatReservations.orderId, order.id));

    await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));

    await tx
      .update(seatReservations)
      .set({ status: seatStatus })
      .where(eq(seatReservations.orderId, order.id));

    return held.map((h) => h.seatId);
  }

  private emit(tx: Tx, routingKey: string, payload: Record<string, unknown>): Promise<void> {
    return this.outbox.enqueue(tx, { routingKey, payload: { messageId: uuid(), ...payload } });
  }

  private async emitPerSeat(
    tx: Tx,
    routingKey: string,
    order: Order,
    seatIds: string[],
  ): Promise<void> {
    for (const seatId of seatIds) {
      await this.emit(tx, routingKey, { orderId: order.id, showId: order.showId, seatId });
    }
  }

  private unlockSeats(order: Order, seatIds: string[]): Promise<void> {
    return this.redis.releaseSeatLocks(seatIds.map((seatId) => seatLockKey(order.showId, seatId)));
  }

  // Unblock seats and mark the order as expired. Called by the release worker
  async release(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);

      // paid/expired/cancelled → nothing to release.
      if (!order || !canTransition(order.status as OrderStatus, 'expired')) return;

      const seatIds = await this.settle(tx, order, 'expired', 'released');

      await this.emit(tx, ORDER_ROUTING_KEYS.ORDER_EXPIRED, {
        orderId,
        showId: order.showId,
      });
      await this.emitPerSeat(tx, ORDER_ROUTING_KEYS.SEAT_RELEASED, order, seatIds);

      await this.unlockSeats(order, seatIds);
    });
  }

  // --- Saga event handlers (payments.events → order-state). All idempotent via
  // processed_messages, and the state machine is the only authority on transitions. ---

  // payment.succeeded → confirm the order. If it can no longer become paid (expire-then-pay
  // race), auto-refund instead of resurrecting it.
  async markPaid(e: PaymentSucceededEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await this.inbox.alreadyProcessed(tx, e.messageId)) return;

      const order = await this.lockOrder(tx, e.orderId);

      if (!order) return;

      if (!canTransition(order.status as OrderStatus, 'paid')) {
        if (order.status === 'expired' || order.status === 'cancelled') {
          await this.emit(tx, ORDER_ROUTING_KEYS.REFUND_REQUESTED, {
            orderId: order.id,
            paymentIntentId: e.paymentIntentId,
          });
        }
        return;
      }

      const seatIds = await this.settle(tx, order, 'paid', 'confirmed');

      await this.emit(tx, ORDER_ROUTING_KEYS.ORDER_PAID, {
        orderId: order.id,
        userId: order.userId,
        showId: order.showId,
      });
      await this.emitPerSeat(tx, ORDER_ROUTING_KEYS.SEAT_CONFIRMED, order, seatIds);
    });
  }

  // payment.failed → cancel the order, release its seats and locks.
  async markFailed(e: PaymentFailedEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await this.claim(tx, e.messageId, e.orderId, 'cancelled');

      if (!order) return;

      const seatIds = await this.settle(tx, order, 'cancelled', 'released');

      await this.emit(tx, ORDER_ROUTING_KEYS.ORDER_CANCELLED, {
        orderId: order.id,
        showId: order.showId,
      });
      await this.emitPerSeat(tx, ORDER_ROUTING_KEYS.SEAT_RELEASED, order, seatIds);

      await this.unlockSeats(order, seatIds);
    });
  }

  // refund.succeeded → close out a paid order as refunded, release its seats and locks.
  async markRefunded(e: RefundSucceededEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await this.claim(tx, e.messageId, e.orderId, 'refunded');

      if (!order) return;

      const seatIds = await this.settle(tx, order, 'refunded', 'released');

      await this.emitPerSeat(tx, ORDER_ROUTING_KEYS.SEAT_RELEASED, order, seatIds);

      await this.unlockSeats(order, seatIds);
    });
  }

  // REST-driven refund: owner asks to refund a paid order → emit refund.requested (Payments
  // does the Stripe refund; the charge.refunded webhook later drives markRefunded).
  async requestRefund(userId: string, orderId: string): Promise<OrderResponse> {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
        .for('update')
        .limit(1);
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'paid')
        throw new ConflictException(`Cannot refund an order in status ${order.status}`);

      // ponytail: refund window policy (N days before the show) is a single guard; add it when the shows RPC exposes startsAt.
      await this.emit(tx, ORDER_ROUTING_KEYS.REFUND_REQUESTED, { orderId: order.id });

      return toResponse(order);
    });
  }

  // show.cancelled → refund every paid order for that show (each downstream refund reuses
  // the same refund.requested → Payments → charge.refunded → markRefunded path).
  async refundAllPaidForShow(e: { messageId: string; showId: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await this.inbox.alreadyProcessed(tx, e.messageId)) return;

      const paid = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.showId, e.showId), eq(orders.status, 'paid')));

      for (const o of paid) {
        await this.emit(tx, ORDER_ROUTING_KEYS.REFUND_REQUESTED, { orderId: o.id });
      }
    });
  }
}
