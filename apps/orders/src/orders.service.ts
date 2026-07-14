import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import type { Queue } from 'bullmq';
import {
  orders,
  seatReservations,
  ordersOutbox,
  ordersProcessedMessages,
  ticketTypes,
  type Db,
} from '@tickethub/db';
import { RedisService } from '@tickethub/redis';
import { OutboxRepository, alreadyProcessed } from '@tickethub/outbox';
import {
  ORDER_ROUTING_KEYS,
  type CreateOrderDto,
  type OrderResponse,
  type PaymentSucceededEvent,
  type PaymentFailedEvent,
  type RefundSucceededEvent,
} from '@tickethub/contracts';
import { canTransition, type OrderStatus } from './order-state';

export const seatLockKey = (eventId: string, seatId: string) => `seat-lock:${eventId}:${seatId}`;

const toResponse = (order: typeof orders.$inferSelect): OrderResponse => ({
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
    const keys = dto.seats.map((s) => seatLockKey(dto.eventId, s.seatId));
    if (!(await this.redis.acquireSeatLocks(keys, this.ttlSec))) {
      throw new ConflictException('One or more seats are being held by another buyer');
    }

    try {
      return await this.db.transaction(async (tx) => {
        // Price the seats (source of truth = ticket_types).
        const typeIds = [...new Set(dto.seats.map((s) => s.ticketTypeId))];
        const types = await tx
          .select({
            id: ticketTypes.id,
            priceCents: ticketTypes.priceCents,
            currency: ticketTypes.currency,
          })
          .from(ticketTypes)
          .where(inArray(ticketTypes.id, typeIds));
        const priceOf = new Map(types.map((t) => [t.id, t]));
        const totalCents = dto.seats.reduce(
          (sum, s) => sum + (priceOf.get(s.ticketTypeId)?.priceCents ?? 0),
          0,
        );
        const currency = types[0]?.currency ?? 'usd';

        const expiresAt = new Date(Date.now() + this.ttlSec * 1000);
        const [order] = await tx
          .insert(orders)
          .values({
            userId,
            eventId: dto.eventId,
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
            eventId: dto.eventId,
            seatId: s.seatId,
            ticketTypeId: s.ticketTypeId,
            status: 'held' as const,
          })),
        );

        // 4. Outbox (same tx): order.awaiting_payment + one seat.held per seat.
        await this.outbox.enqueue(tx, ordersOutbox, {
          routingKey: ORDER_ROUTING_KEYS.orderAwaitingPayment,
          payload: {
            messageId: uuid(),
            orderId: order.id,
            userId,
            eventId: dto.eventId,
            totalCents,
          },
        });
        for (const s of dto.seats) {
          await this.outbox.enqueue(tx, ordersOutbox, {
            routingKey: ORDER_ROUTING_KEYS.seatHeld,
            payload: {
              messageId: uuid(),
              orderId: order.id,
              eventId: dto.eventId,
              seatId: s.seatId,
            },
          });
        }

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

  // Unblock seats and mark the order as expired. Called by the release worker
  async release(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1);
      // paid/expired/cancelled → nothing to release.
      if (!order || !canTransition(order.status as OrderStatus, 'expired')) return;

      const held = await tx
        .select({ seatId: seatReservations.seatId })
        .from(seatReservations)
        .where(eq(seatReservations.orderId, orderId));

      await tx.update(orders).set({ status: 'expired' }).where(eq(orders.id, orderId));
      await tx
        .update(seatReservations)
        .set({ status: 'released' })
        .where(eq(seatReservations.orderId, orderId));

      await this.outbox.enqueue(tx, ordersOutbox, {
        routingKey: ORDER_ROUTING_KEYS.orderExpired,
        payload: { messageId: uuid(), orderId, eventId: order.eventId },
      });
      for (const s of held) {
        await this.outbox.enqueue(tx, ordersOutbox, {
          routingKey: ORDER_ROUTING_KEYS.seatReleased,
          payload: { messageId: uuid(), orderId, eventId: order.eventId, seatId: s.seatId },
        });
      }

      await this.redis.releaseSeatLocks(held.map((h) => seatLockKey(order.eventId, h.seatId)));
    });
  }

  // --- Saga event handlers (payments.events → order-state). All idempotent via
  // processed_messages, and the state machine is the only authority on transitions. ---

  // payment.succeeded → confirm the order. If it can no longer become paid (expire-then-pay
  // race), auto-refund instead of resurrecting it.
  async markPaid(e: PaymentSucceededEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await alreadyProcessed(tx, ordersProcessedMessages, e.messageId)) return;

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, e.orderId))
        .for('update')
        .limit(1);
      if (!order) return;

      if (!canTransition(order.status as OrderStatus, 'paid')) {
        if (order.status === 'expired' || order.status === 'cancelled') {
          await this.outbox.enqueue(tx, ordersOutbox, {
            routingKey: ORDER_ROUTING_KEYS.refundRequested,
            payload: { messageId: uuid(), orderId: order.id, paymentIntentId: e.paymentIntentId },
          });
        }
        return;
      }

      const held = await tx
        .select({ seatId: seatReservations.seatId })
        .from(seatReservations)
        .where(eq(seatReservations.orderId, order.id));

      await tx.update(orders).set({ status: 'paid' }).where(eq(orders.id, order.id));
      await tx
        .update(seatReservations)
        .set({ status: 'confirmed' })
        .where(eq(seatReservations.orderId, order.id));

      await this.outbox.enqueue(tx, ordersOutbox, {
        routingKey: ORDER_ROUTING_KEYS.orderPaid,
        payload: {
          messageId: uuid(),
          orderId: order.id,
          userId: order.userId,
          eventId: order.eventId,
        },
      });
      for (const s of held) {
        await this.outbox.enqueue(tx, ordersOutbox, {
          routingKey: ORDER_ROUTING_KEYS.seatConfirmed,
          payload: {
            messageId: uuid(),
            orderId: order.id,
            eventId: order.eventId,
            seatId: s.seatId,
          },
        });
      }
    });
  }

  // payment.failed → cancel the order, release its seats and locks.
  async markFailed(e: PaymentFailedEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await alreadyProcessed(tx, ordersProcessedMessages, e.messageId)) return;

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, e.orderId))
        .for('update')
        .limit(1);
      if (!order || !canTransition(order.status as OrderStatus, 'cancelled')) return;

      const held = await tx
        .select({ seatId: seatReservations.seatId })
        .from(seatReservations)
        .where(eq(seatReservations.orderId, order.id));

      await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id));
      await tx
        .update(seatReservations)
        .set({ status: 'released' })
        .where(eq(seatReservations.orderId, order.id));

      await this.outbox.enqueue(tx, ordersOutbox, {
        routingKey: ORDER_ROUTING_KEYS.orderCancelled,
        payload: { messageId: uuid(), orderId: order.id, eventId: order.eventId },
      });
      for (const s of held) {
        await this.outbox.enqueue(tx, ordersOutbox, {
          routingKey: ORDER_ROUTING_KEYS.seatReleased,
          payload: {
            messageId: uuid(),
            orderId: order.id,
            eventId: order.eventId,
            seatId: s.seatId,
          },
        });
      }

      await this.redis.releaseSeatLocks(held.map((h) => seatLockKey(order.eventId, h.seatId)));
    });
  }

  // refund.succeeded → close out a paid order as refunded, release its seats and locks.
  async markRefunded(e: RefundSucceededEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await alreadyProcessed(tx, ordersProcessedMessages, e.messageId)) return;

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, e.orderId))
        .for('update')
        .limit(1);
      if (!order || !canTransition(order.status as OrderStatus, 'refunded')) return;

      const held = await tx
        .select({ seatId: seatReservations.seatId })
        .from(seatReservations)
        .where(eq(seatReservations.orderId, order.id));

      await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, order.id));
      await tx
        .update(seatReservations)
        .set({ status: 'released' })
        .where(eq(seatReservations.orderId, order.id));

      for (const s of held) {
        await this.outbox.enqueue(tx, ordersOutbox, {
          routingKey: ORDER_ROUTING_KEYS.seatReleased,
          payload: {
            messageId: uuid(),
            orderId: order.id,
            eventId: order.eventId,
            seatId: s.seatId,
          },
        });
      }

      await this.redis.releaseSeatLocks(held.map((h) => seatLockKey(order.eventId, h.seatId)));
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

      // ponytail: refund window policy (N days before event) is a single guard; add it when the events RPC exposes startsAt.
      await this.outbox.enqueue(tx, ordersOutbox, {
        routingKey: ORDER_ROUTING_KEYS.refundRequested,
        payload: { messageId: uuid(), orderId: order.id },
      });
      return toResponse(order);
    });
  }

  // event.cancelled → refund every paid order for that event (each downstream refund reuses
  // the same refund.requested → Payments → charge.refunded → markRefunded path).
  async refundAllPaidForEvent(e: { messageId: string; eventId: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await alreadyProcessed(tx, ordersProcessedMessages, e.messageId)) return;

      const paid = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.eventId, e.eventId), eq(orders.status, 'paid')));

      for (const o of paid) {
        await this.outbox.enqueue(tx, ordersOutbox, {
          routingKey: ORDER_ROUTING_KEYS.refundRequested,
          payload: { messageId: uuid(), orderId: o.id },
        });
      }
    });
  }
}
