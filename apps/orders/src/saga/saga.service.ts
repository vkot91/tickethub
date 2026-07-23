import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { orders, type Db } from '@tickethub/db';
import {
  ORDER_ROUTING_KEYS,
  type PaymentSucceededEvent,
  type PaymentFailedEvent,
  type RefundSucceededEvent,
} from '@tickethub/contracts';
import { canTransition, type OrderStatus } from '../orders.state';
import { OrderRepository } from '../orders.repository';

// The event-driven half of Orders (payments.events → order-state) plus the TTL release.
// All idempotent via processed_messages, and the state machine is the only authority on
// transitions.
@Injectable()
export class OrderSagaService {
  constructor(
    @Inject('DB') private readonly db: Db,
    private readonly orderRepository: OrderRepository,
  ) {}

  // Unblock seats and mark the order as expired. Called by the release worker.
  async release(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await this.orderRepository.lockOrder(tx, orderId);

      // paid/expired/cancelled → nothing to release.
      if (!order || !canTransition(order.status as OrderStatus, 'expired')) return;

      const seatIds = await this.orderRepository.settle(tx, order, 'expired', 'released');

      await this.orderRepository.emit(tx, ORDER_ROUTING_KEYS.ORDER_EXPIRED, {
        orderId,
        showId: order.showId,
      });
      await this.orderRepository.emitPerSeat(tx, ORDER_ROUTING_KEYS.SEAT_RELEASED, order, seatIds);

      await this.orderRepository.unlockSeats(order, seatIds);
    });
  }

  // payment.succeeded → confirm the order. If it can no longer become paid (expire-then-pay
  // race), auto-refund instead of resurrecting it.
  async markPaid(event: PaymentSucceededEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await this.orderRepository.alreadyProcessed(tx, event.messageId)) return;

      const order = await this.orderRepository.lockOrder(tx, event.orderId);

      if (!order) return;

      if (!canTransition(order.status as OrderStatus, 'paid')) {
        if (order.status === 'expired' || order.status === 'cancelled') {
          await this.orderRepository.emit(tx, ORDER_ROUTING_KEYS.REFUND_REQUESTED, {
            orderId: order.id,
            paymentIntentId: event.paymentIntentId,
          });
        }
        return;
      }

      await this.orderRepository.settle(tx, order, 'paid', 'confirmed');

      await this.orderRepository.emit(tx, ORDER_ROUTING_KEYS.ORDER_PAID, {
        orderId: order.id,
        userId: order.userId,
        showId: order.showId,
      });
    });
  }

  // payment.failed → cancel the order, release its seats and locks.
  async markFailed(event: PaymentFailedEvent): Promise<void> {
    await this.close(
      event.messageId,
      event.orderId,
      'cancelled',
      ORDER_ROUTING_KEYS.ORDER_CANCELLED,
    );
  }

  // refund.succeeded → close out a paid order as refunded, release its seats and locks.
  async markRefunded(event: RefundSucceededEvent): Promise<void> {
    await this.close(event.messageId, event.orderId, 'refunded');
  }

  // show.cancelled → refund every paid order for that show (each downstream refund reuses
  // the same refund.requested → Payments → charge.refunded → markRefunded path).
  async refundAllPaidForShow(event: { messageId: string; showId: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (await this.orderRepository.alreadyProcessed(tx, event.messageId)) return;

      const paid = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.showId, event.showId), eq(orders.status, 'paid')));

      for (const order of paid) {
        await this.orderRepository.emit(tx, ORDER_ROUTING_KEYS.REFUND_REQUESTED, {
          orderId: order.id,
        });
      }
    });
  }

  // Terminal transitions that free the seats: cancelled and refunded differ only in the
  // order-level event they announce (a refund's is emitted by Payments, not here).
  private async close(
    messageId: string,
    orderId: string,
    to: Extract<OrderStatus, 'cancelled' | 'refunded'>,
    routingKey?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await this.orderRepository.claim(tx, messageId, orderId, to);

      if (!order) return;

      const seatIds = await this.orderRepository.settle(tx, order, to, 'released');

      if (routingKey) {
        await this.orderRepository.emit(tx, routingKey, {
          orderId: order.id,
          showId: order.showId,
        });
      }
      await this.orderRepository.emitPerSeat(tx, ORDER_ROUTING_KEYS.SEAT_RELEASED, order, seatIds);

      await this.orderRepository.unlockSeats(order, seatIds);
    });
  }
}
