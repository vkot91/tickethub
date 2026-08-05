import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Roles } from '@tickethub/common';
import { VENUES_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * The venue catalogue an organizer picks a hall from. Guards sit on the class, not the handlers,
 * so a route added later is guarded by default rather than public by accident.
 *
 * Read-only, and it stays that way here: venues belong to nobody, so a write surface would be an
 * admin audience with its own folder — not this one.
 */
@Controller('organizer/venues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('organizer')
export class GatewayOrganizerVenuesController {
  constructor(private readonly amqp: AmqpConnection) {}

  @Get() getList() {
    return rpcRequest(this.amqp, VENUES_MESSAGE_PATTERNS.LIST, {});
  }

  @Get(':id') getOne(@Param('id') id: string) {
    return rpcRequest(this.amqp, VENUES_MESSAGE_PATTERNS.GET, { venueId: id });
  }
}
