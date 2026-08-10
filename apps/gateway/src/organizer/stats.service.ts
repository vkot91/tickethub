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
import { GatewayOrganizerOwnershipService } from './ownership.service';
import { withShowContext, UNKNOWN_SHOW_TITLE, type ShowContext } from '../shared/show-context';

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
    bandId: tier.bandId,
    name: names.get(tier.bandId)?.name ?? '',
    tier: names.get(tier.bandId)?.tier ?? 'standard',
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
 * handed a **resolved** `showIds[]` — so `apps/orders` and `apps/tickets` never learn who owns
 * what, and an organizer with no shows gets zeros rather than the platform's aggregate.
 *
 * A service rather than controller code because the merge is the interesting part and deserves
 * tests without HTTP. Passthrough routes stay inline in their controllers.
 */
@Injectable()
export class GatewayOrganizerStatsService {
  constructor(
    private readonly amqp: AmqpConnection,
    private readonly ownership: GatewayOrganizerOwnershipService,
  ) {}

  /**
   * The console's half of the show-context merge. Not the buyer's `detail` + `seatMap`: that pair
   * 404s a draft and hauls back a whole venue's geometry for a handful of labels. These two keys
   * answer for the shows this caller owns, drafts included, and ask for exactly the labels needed.
   *
   * Titles arrive pre-fetched: `SUMMARIES` is batched, and calling it per show ran its whole
   * capacity aggregate (four left joins, `count(seats.id)`) once per row of the page just to read
   * a title. Only the labels are per-show, because that key takes one `showId`.
   */
  private readonly fetchShow =
    (seatIdsByShow: Map<string, string[]>, titles: Map<string, string>) =>
    async (showId: string): Promise<ShowContext> => {
      const labels = await rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.SEAT_LABELS, {
        showId,
        seatIds: seatIdsByShow.get(showId) ?? [],
      });

      // A successful `SUMMARIES` answers for every id it was asked about, so a miss here means the
      // batch itself failed — the same "Shows could not name it" the per-show fan-out used to
      // report, and the same fallback.
      return {
        title: titles.get(showId) ?? UNKNOWN_SHOW_TITLE,
        labels: new Map(Object.entries(labels)),
      };
    };

  async stats(userId: string, query: ShowStatsQuery): Promise<ShowStats> {
    const owned = await this.ownership.showIds(userId);

    // 404, not 403, and *before* the empty short-circuit: an organizer must not be able to probe
    // for a competitor's show by id, and owning nothing is not a licence to ask about anything.
    if (query.showId && !owned.includes(query.showId))
      throw new NotFoundException('Show not found');

    if (owned.length === 0) return ZERO_STATS;

    const showIds = query.showId ? [query.showId] : owned;

    // One wave, one call per service — orders owns the money, shows the seats and the sale start,
    // tickets the check-ins. The tier names are fetched alongside rather than after: they
    // only need the `showId`, so awaiting them on `orders.byTier` bought nothing but a round trip.
    const [orders, capacities, checkedInCount, tierNames] = await Promise.all([
      rpcRequest(this.amqp, ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS, {
        showIds,
        from: query.from,
        to: query.to,
      }),
      rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.SUMMARIES, { showIds }),
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
    const showIds = await this.ownership.showIds(userId);

    if (showIds.length === 0) return { items: [] };

    const rows = await rpcRequest(this.amqp, ORGANIZER_ORDERS_MESSAGE_PATTERNS.LATEST, {
      showIds,
      limit,
    });

    if (rows.length === 0) return { items: [] };

    // One call for the page, not one per row — the same reason the show context is resolved per
    // distinct show rather than per order.
    const seatIdsByShow = new Map<string, string[]>();

    for (const row of rows)
      seatIdsByShow.set(row.showId, [...(seatIdsByShow.get(row.showId) ?? []), ...row.seatIds]);

    const [buyers, summaries] = await Promise.all([
      rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
        ids: [...new Set(rows.map((row) => row.userId))],
      }),
      // Batched, and tolerant for the same reason the per-show fan-out was: an unreachable Shows
      // costs the page its titles, not the page.
      rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.SUMMARIES, {
        showIds: [...seatIdsByShow.keys()],
      }).catch(() => []),
    ]);

    const titles = new Map(summaries.map((show) => [show.showId, show.title]));

    const withShow = await withShowContext(
      rows.map((row) => ({ ...row, seats: row.seatIds.map((seatId) => ({ seatId })) })),
      this.fetchShow(seatIdsByShow, titles),
    );

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
   * Orders knows the price band id but not its name — that lives in Shows. Only the single-show
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
      const bands = await rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.BANDS, {
        showId,
      });

      for (const band of bands) {
        names.set(band.id, { name: band.name, tier: band.tier });
      }
    } catch {
      // no-op
    }

    return names;
  }
}
