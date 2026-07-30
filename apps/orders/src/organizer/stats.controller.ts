import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_ORDERS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerStatsService } from './stats.service';

// The console's read surface on Orders. `showIds` arrives already resolved by the gateway —
// nothing here knows or checks who owns a show.
@Controller()
export class OrganizerStatsController {
  constructor(private readonly statsService: OrganizerStatsService) {}

  @RabbitRPC(rpcSub(ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS))
  stats(params: { showIds: string[]; from?: string; to?: string }) {
    return this.statsService.stats(params);
  }

  @RabbitRPC(rpcSub(ORGANIZER_ORDERS_MESSAGE_PATTERNS.RECENT))
  recent(params: { showIds: string[]; limit?: number }) {
    return this.statsService.recent(params);
  }
}
