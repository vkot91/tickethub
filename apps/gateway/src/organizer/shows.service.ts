import { Injectable, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  ORGANIZER_ORDERS_MESSAGE_PATTERNS,
  ORGANIZER_PROFILE_MESSAGE_PATTERNS,
  ORGANIZER_SHOWS_MESSAGE_PATTERNS,
  type OrganizerShow,
  type OrganizerShowsQuery,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';

/**
 * Ownership resolution for every organizer route. `apps/orders` and `apps/fulfillment` never ask
 * who owns what — the gateway resolves the id list here and passes it down, so a service can only
 * aggregate over shows the caller already proved they own.
 */
@Injectable()
export class OrganizerShowsService {
  constructor(private readonly amqp: AmqpConnection) {}

  showIds(userId: string): Promise<string[]> {
    return rpcRequest(this.amqp, ORGANIZER_PROFILE_MESSAGE_PATTERNS.SHOW_IDS, { userId });
  }

  /**
   * The show list with its sales numbers. `apps/shows` answers zeros — sales live in Orders and
   * capacity in Shows' own batched RPC — so the merge happens here, once for the whole page.
   *
   * Drafts are left out of the fan-out on purpose: a draft has sold nothing by definition, the
   * table already renders `—` for it, and asking about it is two round trips for a certain zero.
   */
  async listWithSales(userId: string, query: OrganizerShowsQuery): Promise<OrganizerShow[]> {
    const shows = await rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.MY_SHOWS, {
      userId,
      ...query,
    });

    const saleableShowIds = shows.filter((show) => show.status !== 'draft').map((show) => show.id);

    if (saleableShowIds.length === 0) return shows;

    const [sales, capacities] = await Promise.all([
      rpcRequest(this.amqp, ORGANIZER_ORDERS_MESSAGE_PATTERNS.SALES_BY_SHOW, {
        showIds: saleableShowIds,
      }),
      rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.CAPACITY, {
        showIds: saleableShowIds,
      }),
    ]);

    const salesByShowId = new Map(sales.map((sale) => [sale.showId, sale]));
    const capacityByShowId = new Map(capacities.map((show) => [show.showId, show.capacity]));

    return shows.map((show) => ({
      ...show,
      soldCount: salesByShowId.get(show.id)?.soldCount ?? 0,
      revenueCents: salesByShowId.get(show.id)?.revenueCents ?? 0,
      capacity: capacityByShowId.get(show.id) ?? 0,
    }));
  }

  /**
   * 404, not 403: an organizer must not be able to probe for the existence of a competitor's show
   * by id. Returns the caller's full id list, since every caller needs it anyway.
   */
  async assertOwnsShow(userId: string, showId: string): Promise<string[]> {
    const showIds = await this.showIds(userId);

    if (!showIds.includes(showId)) throw new NotFoundException('Show not found');

    return showIds;
  }
}
