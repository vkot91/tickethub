import { Injectable, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import {
  AUTH_MESSAGE_PATTERNS,
  ORGANIZER_ORDERS_MESSAGE_PATTERNS,
  ORGANIZER_SHOWS_MESSAGE_PATTERNS,
  ORGANIZER_TICKETS_MESSAGE_PATTERNS,
  type OrderStats,
  type RecentOrders,
  type SeatTier,
  type ShowStats,
  type ShowStatsQuery,
} from '@tickethub/contracts';
import { OrganizerShowsService } from './shows.service';
import { ShowContextService } from '../shared/show-context.service';

/**
 * A day before the show went on sale is a zero nobody could have bought — real, but padding. The
 * range picker's window still applies; this only tightens it to whichever start is later.
 * `null` for "no explicit sale start" (on sale since publish) and for "every show" (no single
 * date to anchor several shows' graphs to) — both leave the picker's window alone.
 */
function clipToSaleStart(
  byDay: OrderStats['byDay'],
  saleStartsAt: string | null,
): OrderStats['byDay'] {
  if (!saleStartsAt) return byDay;

  const saleStartDate = saleStartsAt.slice(0, 10);

  return byDay.filter((day) => day.date >= saleStartDate);
}

/** A band Shows could not name — a cancelled or purged show — still shows its sales. */
function withNames(
  byTier: OrderStats['byTier'],
  names: Map<string, { name: string; tier: SeatTier }>,
): ShowStats['byTier'] {
  return byTier.map((tier) => ({
    ticketTypeId: tier.ticketTypeId,
    name: names.get(tier.ticketTypeId)?.name ?? '',
    tier: names.get(tier.ticketTypeId)?.tier ?? 'standard',
    soldCount: tier.soldCount,
  }));
}

const ZERO_STATS: ShowStats = {
  soldCount: 0,
  capacity: 0,
  revenueCents: 0,
  refundedCents: 0,
  checkedInCount: 0,
  byDay: [],
  byTier: [],
};

/**
 * The dashboard's fan-out. Ownership is resolved here, once, and every downstream service is
 * handed a **resolved** `showIds[]` — so `apps/orders` and `apps/fulfillment` never learn who owns
 * what, and an organizer with no shows gets zeros rather than the platform's aggregate.
 *
 * A service rather than controller code because the merge is the interesting part and deserves
 * tests without HTTP. Passthrough routes stay inline in their controllers.
 */
@Injectable()
export class OrganizerStatsService {
  constructor(
    private readonly amqp: AmqpConnection,
    private readonly myShows: OrganizerShowsService,
    private readonly showContext: ShowContextService,
  ) {}

  async stats(userId: string, query: ShowStatsQuery): Promise<ShowStats> {
    const owned = await this.myShows.showIds(userId);

    // 404, not 403, and *before* the empty short-circuit: an organizer must not be able to probe
    // for a competitor's show by id, and owning nothing is not a licence to ask about anything.
    if (query.showId && !owned.includes(query.showId))
      throw new NotFoundException('Show not found');

    if (owned.length === 0) return ZERO_STATS;

    const showIds = query.showId ? [query.showId] : owned;

    // One wave, one call per service — orders owns the money, shows the seats and the sale start,
    // fulfillment the check-ins. The tier names are fetched alongside rather than after: they
    // only need the `showId`, so awaiting them on `orders.byTier` bought nothing but a round trip.
    const [orders, capacities, checkedInCount, tierNames] = await Promise.all([
      rpcRequest(this.amqp, ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS, {
        showIds,
        from: query.from,
        to: query.to,
      }),
      rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.CAPACITY, { showIds }),
      rpcRequest(this.amqp, ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT, { showIds }),
      this.tierNames(query.showId),
    ]);

    // Only the single-show scope clips: several shows have no one sale start to anchor a graph to.
    const saleStartsAt = query.showId
      ? (capacities.find((show) => show.showId === query.showId)?.saleStartsAt ?? null)
      : null;

    return {
      soldCount: orders.soldCount,
      capacity: capacities.reduce((total, show) => total + show.capacity, 0),
      revenueCents: orders.revenueCents,
      refundedCents: orders.refundedCents,
      checkedInCount,
      byDay: clipToSaleStart(orders.byDay, saleStartsAt),
      byTier: withNames(orders.byTier, tierNames),
    };
  }

  async recentOrders(userId: string, limit: number): Promise<RecentOrders> {
    const showIds = await this.myShows.showIds(userId);

    if (showIds.length === 0) return { items: [] };

    const rows = await rpcRequest(this.amqp, ORGANIZER_ORDERS_MESSAGE_PATTERNS.RECENT, {
      showIds,
      limit,
    });

    if (rows.length === 0) return { items: [] };

    // One call for the page, not one per row — the same reason the show context is resolved per
    // distinct show rather than per order.
    const [buyers, withShow] = await Promise.all([
      rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
        ids: [...new Set(rows.map((row) => row.userId))],
      }),
      this.showContext.withShowContext(
        rows.map((row) => ({ ...row, seats: row.seatIds.map((seatId) => ({ seatId })) })),
      ),
    ]);

    const emails = new Map(buyers.map((buyer) => [buyer.id, buyer.email]));

    return {
      items: withShow.map((row) => ({
        id: row.id,
        showTitle: row.showTitle,
        // A deleted buyer is "Unknown buyer" in the table; the money it represents still happened.
        buyerEmail: emails.get(row.userId) ?? null,
        seatLabels: row.seatLabels,
        totalCents: row.totalCents,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  }

  /**
   * Orders knows the ticket type id but not its name — that lives in Shows. Only the single-show
   * view asks: "sales by band" across several shows would be adding up bands that are different
   * rows with the same name. An unreachable show leaves the names blank rather than failing the
   * whole dashboard.
   */
  private async tierNames(
    showId: string | undefined,
  ): Promise<Map<string, { name: string; tier: SeatTier }>> {
    const names = new Map<string, { name: string; tier: SeatTier }>();

    if (!showId) return names;

    try {
      const bands = await rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.TIER_NAMES, {
        showId,
      });

      for (const band of bands) {
        names.set(band.id, { name: band.name, tier: band.tier });
      }
    } catch {
      // fall through to unnamed
    }

    return names;
  }
}
