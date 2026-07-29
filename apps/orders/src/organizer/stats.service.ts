import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { orders, seatReservations, type Db } from '@tickethub/db';
import type { OrderStatus } from '@tickethub/contracts';

/** What Orders alone can answer. Capacity, tier names and check-ins are merged in the gateway. */
export interface OrdersStats {
  soldCount: number;
  revenueCents: number;
  refundedCents: number;
  byDay: { date: string; revenueCents: number; count: number }[];
  byTier: { ticketTypeId: string; soldCount: number }[];
}

export interface RecentOrderRow {
  id: string;
  showId: string;
  userId: string;
  seatIds: string[];
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
}

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_RECENT_LIMIT = 10;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * The organizer dashboard's numbers, over a **resolved** list of show ids. This service never
 * learns who owns what: the gateway proved ownership before calling, and an empty list means
 * zeros — never an unfiltered aggregate over the whole platform.
 */
@Injectable()
export class OrganizerStatsService {
  constructor(@Inject('DB') private readonly db: Db) {}

  async stats(params: { showIds: string[]; from?: string; to?: string }): Promise<OrdersStats> {
    if (params.showIds.length === 0) {
      return { soldCount: 0, revenueCents: 0, refundedCents: 0, byDay: [], byTier: [] };
    }

    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from ? new Date(params.from) : addDays(to, -DEFAULT_WINDOW_DAYS);

    const inShows = inArray(orders.showId, params.showIds);

    const [[money], tiers, days] = await Promise.all([
      this.db
        .select({
          revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'paid'), 0)::int`,
          refundedCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'refunded'), 0)::int`,
        })
        .from(orders)
        .where(inShows),

      this.db
        .select({
          ticketTypeId: seatReservations.ticketTypeId,
          soldCount: sql<number>`count(*)::int`,
        })
        .from(seatReservations)
        .where(
          and(
            inArray(seatReservations.showId, params.showIds),
            eq(seatReservations.status, 'confirmed'),
          ),
        )
        .groupBy(seatReservations.ticketTypeId),

      this.db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${orders.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`,
          revenueCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(
          and(
            inShows,
            eq(orders.status, 'paid'),
            gte(orders.createdAt, from),
            lte(orders.createdAt, to),
          ),
        )
        .groupBy(sql`1`),
    ]);

    return {
      soldCount: tiers.reduce((total, tier) => total + tier.soldCount, 0),
      revenueCents: money.revenueCents,
      refundedCents: money.refundedCents,
      byDay: zeroFill(days, from, to),
      byTier: tiers,
    };
  }

  async recent(params: { showIds: string[]; limit?: number }): Promise<RecentOrderRow[]> {
    if (params.showIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(orders)
      .where(inArray(orders.showId, params.showIds))
      .orderBy(desc(orders.createdAt))
      .limit(params.limit ?? DEFAULT_RECENT_LIMIT);

    if (rows.length === 0) return [];

    const reservations = await this.db
      .select({ orderId: seatReservations.orderId, seatId: seatReservations.seatId })
      .from(seatReservations)
      .where(
        inArray(
          seatReservations.orderId,
          rows.map((row) => row.id),
        ),
      );

    const seatsByOrder = new Map<string, string[]>();
    for (const reservation of reservations) {
      const seatIds = seatsByOrder.get(reservation.orderId) ?? [];
      seatIds.push(reservation.seatId);
      seatsByOrder.set(reservation.orderId, seatIds);
    }

    return rows.map((row) => ({
      id: row.id,
      showId: row.showId,
      userId: row.userId,
      seatIds: seatsByOrder.get(row.id) ?? [],
      totalCents: row.totalCents,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

/**
 * Every day in the window, in order, with the days nobody bought anything at zero — a chart with
 * gaps lies about its own shape. In TypeScript rather than a SQL `generate_series`: fewer moving
 * parts, and the window is at most a few hundred days.
 */
function zeroFill(
  days: { date: string; revenueCents: number; count: number }[],
  from: Date,
  to: Date,
): OrdersStats['byDay'] {
  const found = new Map(days.map((day) => [day.date, day]));
  const filled: OrdersStats['byDay'] = [];

  for (let cursor = new Date(dayKey(from)); cursor <= to; cursor = addDays(cursor, 1)) {
    const date = dayKey(cursor);
    filled.push(found.get(date) ?? { date, revenueCents: 0, count: 0 });
  }

  return filled;
}
