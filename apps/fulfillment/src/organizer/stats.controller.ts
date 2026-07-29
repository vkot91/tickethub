import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { RPC_EXCHANGE, TICKETS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { OrganizerStatsService } from './stats.service';

@Controller()
export class OrganizerStatsController {
  constructor(private readonly statsService: OrganizerStatsService) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT,
    queue: TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT,
  })
  checkedInCount(params: { showIds: string[] }) {
    return this.statsService.checkedInCount(params.showIds);
  }
}
