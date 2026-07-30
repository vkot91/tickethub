import { Injectable, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_PROFILE_MESSAGE_PATTERNS } from '@tickethub/contracts';
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
   * 404, not 403: an organizer must not be able to probe for the existence of a competitor's show
   * by id. Returns the caller's full id list, since every caller needs it anyway.
   */
  async assertOwnsShow(userId: string, showId: string): Promise<string[]> {
    const showIds = await this.showIds(userId);

    if (!showIds.includes(showId)) throw new NotFoundException('Show not found');

    return showIds;
  }
}
