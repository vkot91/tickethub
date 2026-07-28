import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  orders,
  rows,
  seatReservations,
  seats,
  showSectionPricing,
  ticketTypes,
  type Db,
} from '@tickethub/db';
import { RedisService } from '@tickethub/redis';
import type { Tx } from '@tickethub/outbox';
import {
  ORDER_ROUTING_KEYS,
  type CreateOrderDto,
  type OrderListQuery,
  type OrderResponse,
  type OrderSummaryPage,
} from '@tickethub/contracts';
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
        // Server-resolved seats from here on — the client's ticketTypeIds are not trusted.
        const {
          totalCents,
          currency,
          seats: pricedSeats,
        } = await this.price(
          tx,
          dto.showId,
          dto.seats.map((seat) => seat.seatId),
        );

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
          pricedSeats.map((seat) => ({
            orderId: order.id,
            showId: dto.showId,
            seatId: seat.seatId,
            ticketTypeId: seat.ticketTypeId,
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
          pricedSeats.map((seat) => seat.seatId),
        );

        // 5. Schedule the 10-minute release.
        await this.releaseQueue.add(
          'release',
          { orderId: order.id },
          { delay: this.ttlSec * 1000, removeOnComplete: true },
        );
        return toResponse(order, pricedSeats);
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

  // The buyer's own orders, newest first. Keyset on (created_at, id) rather than an offset:
  // an order created while the reader pages would otherwise shift the window and duplicate a row.
  async list(userId: string, query: OrderListQuery): Promise<OrderSummaryPage> {
    const after = query.cursor ? await this.cursorRow(userId, query.cursor) : undefined;

    const found = await this.db
      .select()
      .from(orders)
      .where(
        after
          ? and(
              eq(orders.userId, userId),
              // Casts are load-bearing: inside a row comparison Postgres cannot infer a
              // bound parameter's type, and postgres-js will not send a bare Date at all.
              sql`(${orders.createdAt}, ${orders.id}) < (${new Date(after.createdAt).toISOString()}::timestamptz, ${after.id}::uuid)`,
            )
          : eq(orders.userId, userId),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(query.limit + 1);

    const page = found.slice(0, query.limit);
    const seatsByOrder = await this.seatsByOrder(page.map((order) => order.id));

    return {
      items: page.map((order) => ({
        // Unlike `get`, held seats count too: an awaiting_payment order still has seats to show.
        ...toResponse(order, seatsByOrder.get(order.id) ?? []),
        showId: order.showId,
        createdAt: String(order.createdAt),
      })),
      nextCursor: found.length > query.limit ? page[page.length - 1].id : null,
    };
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

  // The cursor is an order id the caller owns; anything else is a client bug, not an empty page.
  private async cursorRow(userId: string, cursor: string): Promise<Order> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, cursor), eq(orders.userId, userId)))
      .limit(1);
    if (!order) throw new BadRequestException('Unknown cursor');

    return order;
  }

  // One query for the whole page's seats, grouped in memory — not one per order.
  private async seatsByOrder(orderIds: string[]): Promise<Map<string, OrderResponse['seats']>> {
    const byOrder = new Map<string, OrderResponse['seats']>();
    if (!orderIds.length) return byOrder;

    const reservations = await this.db
      .select({
        orderId: seatReservations.orderId,
        seatId: seatReservations.seatId,
        ticketTypeId: seatReservations.ticketTypeId,
      })
      .from(seatReservations)
      .where(inArray(seatReservations.orderId, orderIds));

    for (const { orderId, ...seat } of reservations) {
      byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), seat]);
    }

    return byOrder;
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
  /**
   * What the seats actually cost, resolved from the seat's own section — never from the
   * `ticketTypeId` the client sent. That field is a hint for the UI's running total only: trusting
   * it let a buyer post a VIP seat with the cheap band's id and pay the cheap price, because the
   * old lookup checked merely that the id existed *somewhere* — not that it belonged to this show,
   * let alone to this seat's section. `show_section_pricing` is the single authority, so the returned
   * seats carry the resolved ids and are what gets reserved and charged.
   *
   * A seat whose section the show does not sell has no price at all, so it is refused outright.
   */
  private async price(
    tx: Tx,
    showId: string,
    seatIds: string[],
  ): Promise<{ totalCents: number; currency: string; seats: CreateOrderDto['seats'] }> {
    const priced = await tx
      .select({
        seatId: seats.id,
        ticketTypeId: ticketTypes.id,
        priceCents: ticketTypes.priceCents,
        currency: ticketTypes.currency,
      })
      .from(seats)
      .innerJoin(rows, eq(seats.rowId, rows.id))
      .innerJoin(
        showSectionPricing,
        and(
          eq(showSectionPricing.sectionId, rows.sectionId),
          eq(showSectionPricing.showId, showId),
        ),
      )
      .innerJoin(ticketTypes, eq(ticketTypes.id, showSectionPricing.ticketTypeId))
      .where(inArray(seats.id, seatIds));

    const bySeatId = new Map(priced.map((seat) => [seat.seatId, seat]));

    const resolved = seatIds.map((seatId) => {
      const seat = bySeatId.get(seatId);
      if (!seat) throw new BadRequestException(`Seat ${seatId} is not on sale for this show`);
      return seat;
    });

    return {
      totalCents: resolved.reduce((sum, seat) => sum + seat.priceCents, 0),
      currency: resolved[0].currency,
      seats: resolved.map((seat) => ({ seatId: seat.seatId, ticketTypeId: seat.ticketTypeId })),
    };
  }
}
