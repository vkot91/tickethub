import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  ORGANIZER_SHOWS_MESSAGE_PATTERNS,
  ORGANIZER_TICKETS_MESSAGE_PATTERNS,
  SHOWS_MESSAGE_PATTERNS,
  type CheckInDto,
  type CheckInResult,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';
import { OrganizerShowsService } from './shows.service';

/**
 * The gate's fan-out.
 *
 * Ownership is proved here, for the one show being scanned, and Fulfillment is handed that single
 * id — so it never learns who owns what, and a scan can never widen to "any show this organizer
 * owns". That widening is what would let tonight's attendant burn next week's ticket.
 *
 * A service rather than controller code for the reason `stats.service.ts` gives: the merge is the
 * interesting part and deserves tests without HTTP. Only the parse stays in the controller.
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

    const [scan, facts] = await Promise.all([
      rpcRequest(this.amqp, ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECK_IN, {
        code: dto.code,
        showId: dto.showId,
      }),
      this.showFacts(dto.showId),
    ]);

    return { ...scan, ...facts };
  }

  /**
   * The half of the result Fulfillment cannot know: Shows owns the title and the seat count. Both
   * describe **the gate**, so they are the same on a rejection as on an admission — which is why
   * this runs alongside the scan rather than after it.
   *
   * A show that cannot be reached leaves both blank rather than failing the scan — by this point
   * the gate has already admitted the ticket, and an attendant holding an open turnstile needs an
   * answer more than they need a counter.
   */
  private async showFacts(showId: string): Promise<Pick<CheckInResult, 'showTitle' | 'capacity'>> {
    try {
      const [detail, capacities] = await Promise.all([
        rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, { id: showId }),
        rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.CAPACITY, { showIds: [showId] }),
      ]);

      return { showTitle: detail.title, capacity: capacities[0]?.capacity ?? 0 };
    } catch {
      return { showTitle: null, capacity: 0 };
    }
  }
}
