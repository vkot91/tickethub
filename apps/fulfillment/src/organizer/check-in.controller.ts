import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_TICKETS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerCheckInService } from './check-in.service';

@Controller()
export class OrganizerCheckInController {
  constructor(private readonly checkInService: OrganizerCheckInService) {}

  @RabbitRPC(rpcSub(ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECK_IN))
  checkIn(params: { code: string; showId: string }) {
    return this.checkInService.checkIn(params.code, params.showId);
  }
}
