import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { catalogQuerySchema, MESSAGE_PATTERNS } from '@tickethub/contracts';
import { RPC } from '../tokens';

const P = MESSAGE_PATTERNS.events;

@Controller('events')
export class GatewayEventsController {
  constructor(@Inject(RPC.events) private readonly events: ClientProxy) {}

  @Get() catalog(@Query() query: unknown) {
    return firstValueFrom(this.events.send(P.catalog, catalogQuerySchema.parse(query)));
  }

  @Get(':id') detail(@Param('id') id: string) {
    return firstValueFrom(this.events.send(P.detail, { id }));
  }

  @Get(':id/seat-map') seatMap(@Param('id') id: string) {
    return firstValueFrom(this.events.send(P.seatMap, { id }));
  }
}
