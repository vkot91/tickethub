import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORDERS_MESSAGE_PATTERNS, RPC_EXCHANGE } from '@tickethub/contracts';
import { OrganizerStatsService } from './stats.service';

// The console's read surface on Orders. `showIds` arrives already resolved by the gateway —
// nothing here knows or checks who owns a show.
@Controller()
export class OrganizerStatsController {
  constructor(private readonly statsService: OrganizerStatsService) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORDERS_MESSAGE_PATTERNS.STATS,
    queue: ORDERS_MESSAGE_PATTERNS.STATS,
  })
  stats(params: { showIds: string[]; from?: string; to?: string }) {
    return this.statsService.stats(params);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORDERS_MESSAGE_PATTERNS.RECENT,
    queue: ORDERS_MESSAGE_PATTERNS.RECENT,
  })
  recent(params: { showIds: string[]; limit?: number }) {
    return this.statsService.recent(params);
  }
}
