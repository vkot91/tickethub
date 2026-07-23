import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { orders, seatReservations } from '@tickethub/db';
import { RedisService } from '@tickethub/redis';
import { OutboxRepository, InboxRepository, type Tx } from '@tickethub/outbox';
import { canTransition, type OrderStatus } from './orders.state';

export const seatLockKey = (showId: string, seatId: string) => `seat-lock:${showId}:${seatId}`;

export type Order = typeof orders.$inferSelect;

// The steps every order state change is made of — claim the message, lock the row, move the
// order and its seats, emit, unlock. No `db` here on purpose: each method runs inside the
// caller's transaction, so the write and the outbox row commit together (or not at all).
@Injectable()
export class OrderRepository {
  constructor(
    private readonly redis: RedisService,
    private readonly outbox: OutboxRepository,
    private readonly inbox: InboxRepository,
  ) {}

  async lockOrder(tx: Tx, orderId: string): Promise<Order | undefined> {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update')
      .limit(1);

    return order;
  }

  alreadyProcessed(tx: Tx, messageId: string): Promise<boolean> {
    return this.inbox.alreadyProcessed(tx, messageId);
  }

  // Locks the order and returns it only if this message is new and the transition is legal.
  async claim(
    tx: Tx,
    messageId: string,
    orderId: string,
    to: OrderStatus,
  ): Promise<Order | undefined> {
    if (await this.alreadyProcessed(tx, messageId)) return undefined;

    const order = await this.lockOrder(tx, orderId);

    if (!order || !canTransition(order.status as OrderStatus, to)) return undefined;

    return order;
  }

  // Moves the order and all of its reservations to their new statuses; returns the seat ids.
  async settle(
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

  emit(tx: Tx, routingKey: string, payload: Record<string, unknown>): Promise<void> {
    return this.outbox.enqueue(tx, { routingKey, payload: { messageId: uuid(), ...payload } });
  }

  async emitPerSeat(tx: Tx, routingKey: string, order: Order, seatIds: string[]): Promise<void> {
    for (const seatId of seatIds) {
      await this.emit(tx, routingKey, { orderId: order.id, showId: order.showId, seatId });
    }
  }

  unlockSeats(order: Order, seatIds: string[]): Promise<void> {
    return this.redis.releaseSeatLocks(seatIds.map((seatId) => seatLockKey(order.showId, seatId)));
  }
}
