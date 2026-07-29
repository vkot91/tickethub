import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_MESSAGE_PATTERNS, RPC_EXCHANGE } from '@tickethub/contracts';
import { OrganizerShowsService } from './shows.service';

// An organizer's own shows. Slice 3 grows this file (myShows, create, update, delete-draft);
// the buyer-facing catalog stays in `user/shows.controller.ts`.
@Controller()
export class OrganizerShowsController {
  constructor(private readonly showsService: OrganizerShowsService) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.SHOW_IDS,
    queue: ORGANIZER_MESSAGE_PATTERNS.SHOW_IDS,
  })
  showIds(params: { userId: string }) {
    return this.showsService.showIds(params.userId);
  }
}
