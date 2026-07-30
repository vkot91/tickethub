import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { TICKETS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerStatsService } from './stats.service';

@Controller()
export class OrganizerStatsController {
  constructor(private readonly statsService: OrganizerStatsService) {}

  @RabbitRPC(rpcSub(TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT))
  checkedInCount(params: { showIds: string[] }) {
    return this.statsService.checkedInCount(params.showIds);
  }
}
