import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { VENUES_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerVenuesService } from './venues.service';

// The shared venue catalogue. Read-only: organizers pick a hall, nobody owns one.
@Controller()
export class OrganizerVenuesController {
  constructor(private readonly venuesService: OrganizerVenuesService) {}

  @RabbitRPC(rpcSub(VENUES_MESSAGE_PATTERNS.LIST))
  getList() {
    return this.venuesService.getList();
  }

  @RabbitRPC(rpcSub(VENUES_MESSAGE_PATTERNS.GET))
  getOne(params: { venueId: string }) {
    return this.venuesService.getOne(params.venueId);
  }
}
