import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { orders, seatReservations, type Db } from '@tickethub/db';
import type { OrderStats, RecentOrderRow, ShowSales } from '@tickethub/contracts';

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_RECENT_LIMIT = 10;

/**
 * What counts as money and what counts as a sale. `stats` and `salesByShow` answer these same two
 * questions at different grains — one total vs one row per show — so the definitions live once.
 * Two copies drift, and then the dashboard and the show list disagree about the same show.
 */
const sumPaidRevenueCents = sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'paid'), 0)::int`;

const confirmedSeatsForShows = (showIds: string[]) =>
  and(inArray(seatReservations.showId, showIds), eq(seatReservations.status, 'confirmed'));

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

  async stats(params: { showIds: string[]; from?: string; to?: string }): Promise<OrderStats> {
    if (params.showIds.length === 0) {
      return { soldCount: 0, revenueCents: 0, refundedCents: 0, byDay: [], byTier: [] };
    }

    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from ? new Date(params.from) : addDays(to, -DEFAULT_WINDOW_DAYS);

    const inShows = inArray(orders.showId, params.showIds);

    const [[money], tiers, days] = await Promise.all([
      this.db
        .select({
          revenueCents: sumPaidRevenueCents,
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
        .where(confirmedSeatsForShows(params.showIds))
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

  /**
   * The same two numbers as `stats`, one row per show, for the console's list. Every requested id
   * comes back — a show nobody bought from reads zero rather than vanishing from the table.
   */
  async salesByShow(params: { showIds: string[] }): Promise<ShowSales[]> {
    if (params.showIds.length === 0) return [];

    const [revenueRows, soldRows] = await Promise.all([
      this.db
        .select({ showId: orders.showId, revenueCents: sumPaidRevenueCents })
        .from(orders)
        .where(inArray(orders.showId, params.showIds))
        .groupBy(orders.showId),

      this.db
        .select({ showId: seatReservations.showId, soldCount: sql<number>`count(*)::int` })
        .from(seatReservations)
        .where(confirmedSeatsForShows(params.showIds))
        .groupBy(seatReservations.showId),
    ]);

    const revenueCentsByShowId = new Map(revenueRows.map((row) => [row.showId, row.revenueCents]));
    const soldCountByShowId = new Map(soldRows.map((row) => [row.showId, row.soldCount]));

    // Driven by the *requested* ids, not by what the group-bys found: a show nobody bought from
    // has to come back at zero, or it silently disappears from the caller's table.
    return params.showIds.map((showId) => ({
      showId,
      soldCount: soldCountByShowId.get(showId) ?? 0,
      revenueCents: revenueCentsByShowId.get(showId) ?? 0,
    }));
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
): OrderStats['byDay'] {
  const found = new Map(days.map((day) => [day.date, day]));
  const filled: OrderStats['byDay'] = [];

  for (let cursor = new Date(dayKey(from)); cursor <= to; cursor = addDays(cursor, 1)) {
    const date = dayKey(cursor);
    filled.push(found.get(date) ?? { date, revenueCents: 0, count: 0 });
  }

  return filled;
}
