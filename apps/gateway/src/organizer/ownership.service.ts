import { Injectable, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_SHOWS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';

/**
 * The security seam every organizer route depends on, and nothing else. `apps/orders` and
 * `apps/tickets` never ask who owns what — the gateway resolves the id list here and passes it
 * down, so a service can only aggregate over shows the caller already proved they own.
 *
 * Its own service and not a method on the shows service: that file merges a list for one screen,
 * this one answers "may you". Two jobs at different blast radii do not share a class.
 */
@Injectable()
export class GatewayOrganizerOwnershipService {
  constructor(private readonly amqp: AmqpConnection) {}

  showIds(userId: string): Promise<string[]> {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.IDS, { userId });
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
