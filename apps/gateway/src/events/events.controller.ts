import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { catalogQuerySchema, MESSAGE_PATTERNS } from '@tickethub/contracts';
import { RPC } from '../tokens';

@Controller('events')
export class GatewayEventsController {
  constructor(@Inject(RPC.events) private readonly events: ClientProxy) {}

  @Get() catalog(@Query() query: unknown) {
    return firstValueFrom(
      this.events.send(MESSAGE_PATTERNS.events.catalog, catalogQuerySchema.parse(query)),
    );
  }

  @Get(':id') detail(@Param('id') id: string) {
    return firstValueFrom(this.events.send(MESSAGE_PATTERNS.events.detail, { id }));
  }

  @Get(':id/seat-map') seatMap(@Param('id') id: string) {
    return firstValueFrom(this.events.send(MESSAGE_PATTERNS.events.seatMap, { id }));
  }
}
