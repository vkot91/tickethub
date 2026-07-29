import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { VENUES_MESSAGE_PATTERNS, RPC_EXCHANGE } from '@tickethub/contracts';
import { OrganizerVenuesService } from './venues.service';

// The shared venue catalogue. Read-only: organizers pick a hall, nobody owns one.
@Controller()
export class OrganizerVenuesController {
  constructor(private readonly venuesService: OrganizerVenuesService) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: VENUES_MESSAGE_PATTERNS.GET_LIST,
    queue: VENUES_MESSAGE_PATTERNS.GET_LIST,
  })
  getList() {
    return this.venuesService.getList();
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: VENUES_MESSAGE_PATTERNS.GET_ONE,
    queue: VENUES_MESSAGE_PATTERNS.GET_ONE,
  })
  getOne(params: { venueId: string }) {
    return this.venuesService.getOne(params.venueId);
  }
}
