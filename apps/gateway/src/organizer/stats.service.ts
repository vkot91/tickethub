import { Injectable, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import {
  AUTH_MESSAGE_PATTERNS,
  ORDERS_MESSAGE_PATTERNS,
  ORGANIZER_MESSAGE_PATTERNS,
  SHOWS_MESSAGE_PATTERNS,
  TICKETS_MESSAGE_PATTERNS,
  type OrderStatus,
  type RecentOrders,
  type SeatTier,
  type ShowDetail,
  type ShowStats,
  type ShowStatsQuery,
} from '@tickethub/contracts';
import { OrganizerShowsService } from './shows.service';
import { ShowContextService } from '../shared/show-context.service';

/** What `apps/orders` alone can answer — capacity, tier names and check-ins come from elsewhere. */
interface OrdersStats {
  soldCount: number;
  revenueCents: number;
  refundedCents: number;
  byDay: ShowStats['byDay'];
  byTier: { ticketTypeId: string; soldCount: number }[];
}

interface RecentOrderRow {
  id: string;
  showId: string;
  userId: string;
  seatIds: string[];
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
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

    const [orders, capacities, checkedInCount] = await Promise.all([
      rpcRequest<OrdersStats>(this.amqp, ORDERS_MESSAGE_PATTERNS.STATS, {
        showIds,
        from: query.from,
        to: query.to,
      }),
      rpcRequest<{ showId: string; capacity: number }[]>(
        this.amqp,
        ORGANIZER_MESSAGE_PATTERNS.CAPACITY,
        { showIds },
      ),
      rpcRequest<number>(this.amqp, TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT, { showIds }),
    ]);

    return {
      soldCount: orders.soldCount,
      capacity: capacities.reduce((total, show) => total + show.capacity, 0),
      revenueCents: orders.revenueCents,
      refundedCents: orders.refundedCents,
      checkedInCount,
      byDay: orders.byDay,
      byTier: await this.namedTiers(query.showId, orders.byTier),
    };
  }

  async recentOrders(userId: string, limit: number): Promise<RecentOrders> {
    const showIds = await this.myShows.showIds(userId);

    if (showIds.length === 0) return { items: [] };

    const rows = await rpcRequest<RecentOrderRow[]>(this.amqp, ORDERS_MESSAGE_PATTERNS.RECENT, {
      showIds,
      limit,
    });

    if (rows.length === 0) return { items: [] };

    // One call for the page, not one per row — the same reason the show context is resolved per
    // distinct show rather than per order.
    const [buyers, withShow] = await Promise.all([
      rpcRequest<{ id: string; email: string }[]>(
        this.amqp,
        AUTH_MESSAGE_PATTERNS.GET_USERS_BY_IDS,
        {
          ids: [...new Set(rows.map((row) => row.userId))],
        },
      ),
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
   * rows with the same name. An unreachable show (cancelled, purged) leaves the names blank rather
   * than failing the whole dashboard.
   */
  private async namedTiers(
    showId: string | undefined,
    byTier: OrdersStats['byTier'],
  ): Promise<ShowStats['byTier']> {
    if (byTier.length === 0) return [];

    const names = new Map<string, { name: string; tier: SeatTier }>();

    if (showId) {
      try {
        const detail = await rpcRequest<ShowDetail>(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, {
          id: showId,
        });

        for (const band of detail.priceTiers) {
          names.set(band.id, { name: band.name, tier: band.tier });
        }
      } catch {
        // fall through to unnamed
      }
    }

    return byTier.map((tier) => ({
      ticketTypeId: tier.ticketTypeId,
      name: names.get(tier.ticketTypeId)?.name ?? '',
      tier: names.get(tier.ticketTypeId)?.tier ?? 'standard',
      soldCount: tier.soldCount,
    }));
  }
}
