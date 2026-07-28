import { Controller, Get, Param, Query } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { SHOWS_MESSAGE_PATTERNS, catalogQuerySchema } from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';

@Controller('shows')
export class GatewayUserShowsController {
  constructor(private readonly amqp: AmqpConnection) {}

  @Get() catalog(@Query() query: unknown) {
    return rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.CATALOG, catalogQuerySchema.parse(query));
  }

  @Get(':id') detail(@Param('id') id: string) {
    return rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, { id });
  }

  @Get(':id/seat-map') seatMap(@Param('id') id: string) {
    return rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.SEAT_MAP, { id });
  }
}
