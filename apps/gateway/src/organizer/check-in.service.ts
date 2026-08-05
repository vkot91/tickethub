import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  ORGANIZER_TICKETS_MESSAGE_PATTERNS,
  type CheckInDto,
  type CheckInResult,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';
import { OrganizerShowsService } from './shows.service';

/**
 * The gate's guard.
 *
 * Ownership is proved here, for the one show being scanned, and Fulfillment is handed that single
 * id — so it never learns who owns what, and a scan can never widen to "any show this organizer
 * owns". That widening is what would let tonight's attendant burn next week's ticket.
 *
 * Still a service, not controller code, though nothing is merged any more: the ownership check is
 * the interesting part and deserves tests without HTTP.
 */
@Injectable()
export class OrganizerCheckInService {
  constructor(
    private readonly amqp: AmqpConnection,
    private readonly myShows: OrganizerShowsService,
  ) {}

  async checkIn(userId: string, dto: CheckInDto): Promise<CheckInResult> {
    // 404, not 403, and before anything else — an organizer must not be able to probe for a
    // competitor's show by id, and an organizer who owns nothing owns no gate either.
    await this.myShows.assertOwnsShow(userId, dto.showId);

    return rpcRequest(this.amqp, ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECK_IN, {
      code: dto.code,
      showId: dto.showId,
    });
  }
}
