import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_TICKETS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerCheckInService } from './check-in.service';

// One controller per message-pattern map: both of these keys come out of
// `ORGANIZER_TICKETS_MESSAGE_PATTERNS`, so two 8-line controllers over one table were two files
// saying the same thing.
@Controller()
export class OrganizerTicketsController {
  constructor(private readonly checkInService: OrganizerCheckInService) {}

  @RabbitRPC(rpcSub(ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECK_IN))
  checkIn(params: { code: string; showId: string }) {
    return this.checkInService.checkIn(params.code, params.showId);
  }

  @RabbitRPC(rpcSub(ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT))
  checkedInCount(params: { showIds: string[] }) {
    return this.checkInService.checkedInCount(params.showIds);
  }
}
