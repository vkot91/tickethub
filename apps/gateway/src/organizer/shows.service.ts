import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  ORGANIZER_ORDERS_MESSAGE_PATTERNS,
  ORGANIZER_SHOWS_MESSAGE_PATTERNS,
  type OrganizerShow,
  type OrganizerShowsQuery,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';

/** The console's show list, stitched. Ownership lives in `ownership.service.ts`. */
@Injectable()
export class GatewayOrganizerShowsService {
  constructor(private readonly amqp: AmqpConnection) {}

  /**
   * The show list with its sales numbers. `apps/shows` answers zeros — sales live in Orders and
   * capacity in Shows' own batched RPC — so the merge happens here, once for the whole page.
   *
   * Drafts are left out of the fan-out on purpose: a draft has sold nothing by definition, the
   * table already renders `—` for it, and asking about it is two round trips for a certain zero.
   */
  async listWithSales(userId: string, query: OrganizerShowsQuery): Promise<OrganizerShow[]> {
    const shows = await rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.LIST, {
      userId,
      ...query,
    });

    const saleableShowIds = shows.filter((show) => show.status !== 'draft').map((show) => show.id);

    if (saleableShowIds.length === 0) return shows;

    const [sales, capacities] = await Promise.all([
      rpcRequest(this.amqp, ORGANIZER_ORDERS_MESSAGE_PATTERNS.SALES_BY_SHOW, {
        showIds: saleableShowIds,
      }),
      rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.SUMMARIES, {
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
}
