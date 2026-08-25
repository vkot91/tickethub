import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import {
  ORDERS_MESSAGE_PATTERNS,
  SHOWS_MESSAGE_PATTERNS,
  type SeatMapView,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';

/**
 * The one shape neither owning service can produce. Shows knows the geometry, Orders knows what is
 * taken, and there is no FK between a seat and a reservation — so the merge happens here, in the
 * process that can ask both.
 */
@Injectable()
export class GatewayUserSeatMapService {
  constructor(private readonly amqp: AmqpConnection) {}

  async get(showId: string): Promise<SeatMapView> {
    // Both calls in flight together: they are independent, and the seat map is the buyer's first
    // paint. No `allSettled` — a status lookup that failed is indistinguishable from a show with
    // nothing sold, and quietly rendering every seat free invites a 409 per click.
    const [seatMap, statuses] = await Promise.all([
      rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.SEAT_MAP, { id: showId }),
      rpcRequest(this.amqp, ORDERS_MESSAGE_PATTERNS.SEAT_STATUS, { showId }),
    ]);

    return { ...seatMap, statuses };
  }
}
